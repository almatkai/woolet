import { and, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import {
  banks,
  categories,
  credits,
  currencyBalances,
  debts,
  fxRates,
  mortgages,
  portfolioHoldings,
  subscriptions,
  transactions,
  users,
} from '../../db/schema';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const isoDateSchema = z.string().regex(ISO_DATE_REGEX, 'Use YYYY-MM-DD format');

const NAVIGATION_PATHS = ['/dashboard', '/transactions', '/accounts', '/insights', '/settings', '/budget'] as const;

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type CapabilityAction = {
  type: 'navigate';
  path: (typeof NAVIGATION_PATHS)[number];
};

interface CapabilityExecutionContext {
  userId: string;
  dryRun?: boolean;
  confirmationToken?: string | null;
  idempotencyKey?: string | null;
}

interface CapabilityExecutionPayload {
  data?: unknown;
  userMessage?: string;
  clientAction?: CapabilityAction;
}

interface CapabilityDefinition<TArgs extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  aliases?: string[];
  description: string;
  readOnly: boolean;
  requiresConfirmation: boolean;
  introducedAt: string;
  deprecatedAt?: string;
  argsSchema: TArgs;
  argsJsonSchema: JsonSchema;
  execute: (ctx: CapabilityExecutionContext, args: z.infer<TArgs>) => Promise<CapabilityExecutionPayload>;
}

export interface CapabilityManifestItem {
  id: string;
  aliases: string[];
  description: string;
  readOnly: boolean;
  requiresConfirmation: boolean;
  introducedAt: string;
  deprecatedAt?: string;
  argsSchema: JsonSchema;
}

export interface CapabilityManifest {
  version: string;
  generatedAt: string;
  capabilities: CapabilityManifestItem[];
}

export interface CapabilityExecutionResult {
  success: boolean;
  capabilityId: string;
  aliasUsed?: string;
  readOnly?: boolean;
  data?: unknown;
  userMessage?: string;
  clientAction?: CapabilityAction;
  error?: {
    code: 'UNKNOWN_CAPABILITY' | 'INVALID_ARGS' | 'EXECUTION_ERROR';
    message: string;
    details?: unknown;
  };
}

export interface ExecuteCapabilityInput {
  userId: string;
  capabilityId: string;
  args?: Record<string, unknown>;
  dryRun?: boolean;
  confirmationToken?: string | null;
  idempotencyKey?: string | null;
}

const docsIndex = [
  {
    topic: 'Dashboard',
    keywords: ['dashboard', 'home', 'overview', 'summary'],
    content: 'Dashboard shows net worth, recent transactions, and active accounts. Widgets are customizable.',
  },
  {
    topic: 'Transactions',
    keywords: ['transaction', 'add', 'edit', 'delete', 'spending', 'expense', 'income'],
    content: 'Use Transactions to view history and add records. Filters include date, category, and account.',
  },
  {
    topic: 'Accounts',
    keywords: ['account', 'bank', 'card', 'manual', 'sync'],
    content: 'Accounts lists linked banks and manual accounts. You can add banks and cash wallets there.',
  },
  {
    topic: 'Insights',
    keywords: ['insight', 'report', 'graph', 'chart', 'analysis'],
    content: 'Insights includes spending reports, trends, and income versus expense breakdowns.',
  },
  {
    topic: 'Settings',
    keywords: ['setting', 'preference', 'currency', 'theme', 'profile'],
    content: 'Settings controls profile, default currency, notifications, and app behavior.',
  },
  {
    topic: 'Budgets',
    keywords: ['budget', 'limit', 'save', 'goal'],
    content: 'Budgets tracks category limits and progress against monthly targets.',
  },
  {
    topic: 'AI Chat',
    keywords: ['ai', 'woo', 'chat', 'assistant', 'help'],
    content: 'Woo can answer finance questions, inspect data, and run approved actions.',
  },
];

async function getUserHierarchy(userId: string) {
  const userBanks = await db.query.banks.findMany({
    where: eq(banks.userId, userId),
    with: {
      accounts: {
        with: {
          currencyBalances: true,
        },
      },
    },
  });

  const accountIds = userBanks.flatMap((bank) => bank.accounts.map((account) => account.id));
  const balanceIds = userBanks.flatMap((bank) =>
    bank.accounts.flatMap((account) => account.currencyBalances.map((balance) => balance.id))
  );

  return { userBanks, accountIds, balanceIds };
}

const searchTransactionsArgsSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    categoryId: z.string().uuid().optional(),
    type: z.enum(['income', 'expense', 'transfer']).optional(),
    minAmount: z.number().positive().optional(),
    maxAmount: z.number().positive().optional(),
  })
  .strict();

const analyzeSpendingArgsSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .strict();

const createTransactionArgsSchema = z
  .object({
    amount: z.number().positive(),
    description: z.string().trim().min(1).max(500).optional(),
    date: isoDateSchema,
    categoryId: z.string().uuid(),
    currencyBalanceId: z.string().uuid(),
    type: z.enum(['income', 'expense', 'transfer']),
  })
  .strict();

const upcomingPaymentsArgsSchema = z
  .object({
    days: z.number().int().min(1).max(365).optional(),
  })
  .strict();

const navigateArgsSchema = z
  .object({
    path: z.enum(NAVIGATION_PATHS),
  })
  .strict();

const queryDocsArgsSchema = z
  .object({
    query: z.string().trim().min(2).max(200),
  })
  .strict();

const CAPABILITY_MANIFEST_VERSION = '1.0.0';

const capabilities: CapabilityDefinition[] = [
  {
    id: 'transactions.search.v1',
    aliases: ['search_transactions'],
    description: 'Search user transactions with optional filters.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: searchTransactionsArgsSchema,
    argsJsonSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        categoryId: { type: 'string', format: 'uuid' },
        type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
        minAmount: { type: 'number' },
        maxAmount: { type: 'number' },
      },
      additionalProperties: false,
    },
    execute: async ({ userId }, args) => {
      const { balanceIds } = await getUserHierarchy(userId);
      if (balanceIds.length === 0) {
        return { data: { transactions: [] } };
      }

      const whereParts: any[] = [inArray(transactions.currencyBalanceId, balanceIds)];
      if (args.startDate) whereParts.push(gte(transactions.date, args.startDate));
      if (args.endDate) whereParts.push(lte(transactions.date, args.endDate));
      if (args.categoryId) whereParts.push(eq(transactions.categoryId, args.categoryId));
      if (args.type) whereParts.push(eq(transactions.type, args.type));
      if (args.minAmount !== undefined) whereParts.push(gte(transactions.amount, args.minAmount.toString()));
      if (args.maxAmount !== undefined) whereParts.push(lte(transactions.amount, args.maxAmount.toString()));

      const rows = await db.query.transactions.findMany({
        where: and(...whereParts),
        with: { category: true },
        orderBy: [desc(transactions.date)],
        limit: 50,
      });

      return {
        data: {
          transactions: rows.map((row) => ({
            id: row.id,
            date: row.date,
            amount: row.amount,
            description: row.description,
            category: row.category?.name,
            type: row.type,
          })),
        },
      };
    },
  },
  {
    id: 'accounts.getBalances.v1',
    aliases: ['get_account_balance'],
    description: 'Get all banks, accounts, and balances for the current user.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: z.object({}).strict(),
    argsJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async ({ userId }) => {
      const { userBanks } = await getUserHierarchy(userId);
      return {
        data: {
          banks: userBanks.map((bank) => ({
            name: bank.name,
            accounts: bank.accounts.map((account) => ({
              name: account.name,
              type: account.type,
              balances: account.currencyBalances.map((balance) => ({
                id: balance.id,
                amount: balance.balance,
                currency: balance.currencyCode,
              })),
            })),
          })),
        },
      };
    },
  },
  {
    id: 'categories.list.v1',
    aliases: ['get_categories'],
    description: 'List default and user-defined categories.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: z.object({}).strict(),
    argsJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async ({ userId }) => {
      const rows = await db.query.categories.findMany({
        where: sql`${categories.userId} IS NULL OR ${categories.userId} = ${userId}`,
      });

      return {
        data: {
          categories: rows.map((row) => ({
            id: row.id,
            name: row.name,
            type: row.type,
            icon: row.icon,
          })),
        },
      };
    },
  },
  {
    id: 'subscriptions.list.v1',
    aliases: ['get_subscriptions'],
    description: 'List recurring subscriptions.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: z.object({}).strict(),
    argsJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async ({ userId }) => {
      const rows = await db.query.subscriptions.findMany({
        where: eq(subscriptions.userId, userId),
      });

      return {
        data: {
          subscriptions: rows.map((row) => ({
            id: row.id,
            name: row.name,
            amount: row.amount,
            currency: row.currency,
            frequency: row.frequency,
            status: row.status,
          })),
        },
      };
    },
  },
  {
    id: 'portfolio.list.v1',
    aliases: ['get_portfolio'],
    description: 'Get stock holdings in portfolio.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: z.object({}).strict(),
    argsJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async ({ userId }) => {
      const rows = await db.query.portfolioHoldings.findMany({
        where: eq(portfolioHoldings.userId, userId),
        with: { stock: true },
      });

      return {
        data: {
          holdings: rows.map((row) => ({
            ticker: row.stock.ticker,
            name: row.stock.name,
            quantity: row.quantity,
            avgCost: row.averageCostBasis,
          })),
        },
      };
    },
  },
  {
    id: 'spending.analyze.v1',
    aliases: ['analyze_spending'],
    description: 'Aggregate expenses by category for a date range.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: analyzeSpendingArgsSchema,
    argsJsonSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['startDate', 'endDate'],
      additionalProperties: false,
    },
    execute: async ({ userId }, args) => {
      const { balanceIds } = await getUserHierarchy(userId);
      if (balanceIds.length === 0) {
        return { data: { spendingByCategory: [] } };
      }

      const rows = await db
        .select({
          categoryName: categories.name,
          totalAmount: sum(transactions.amount),
          count: sql`count(*)`.mapWith(Number),
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            inArray(transactions.currencyBalanceId, balanceIds),
            gte(transactions.date, args.startDate),
            lte(transactions.date, args.endDate),
            eq(transactions.type, 'expense')
          )
        )
        .groupBy(categories.name);

      return {
        data: {
          spendingByCategory: rows,
        },
      };
    },
  },
  {
    id: 'transactions.create.v1',
    aliases: ['create_transaction'],
    description: 'Create a transaction in a user-owned account balance.',
    readOnly: false,
    requiresConfirmation: true,
    introducedAt: '2026-02-21',
    argsSchema: createTransactionArgsSchema,
    argsJsonSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        description: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        categoryId: { type: 'string', format: 'uuid' },
        currencyBalanceId: { type: 'string', format: 'uuid' },
        type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
      },
      required: ['amount', 'date', 'categoryId', 'currencyBalanceId', 'type'],
      additionalProperties: false,
    },
    execute: async (ctx, args) => {
      const balance = await db.query.currencyBalances.findFirst({
        where: eq(currencyBalances.id, args.currencyBalanceId),
        with: {
          account: {
            with: {
              bank: true,
            },
          },
        },
      });

      if (!balance || balance.account.bank.userId !== ctx.userId) {
        throw new Error('Invalid account or access denied');
      }

      if (ctx.dryRun) {
        return {
          data: {
            dryRun: true,
            preview: {
              amount: args.amount,
              description: args.description || 'Added via AI',
              date: args.date,
              categoryId: args.categoryId,
              currencyBalanceId: args.currencyBalanceId,
              type: args.type,
            },
          },
          userMessage: 'Dry run complete. No transaction was created.',
        };
      }

      const [created] = await db
        .insert(transactions)
        .values({
          currencyBalanceId: args.currencyBalanceId,
          categoryId: args.categoryId,
          amount: args.amount.toString(),
          description: args.description || 'Added via AI',
          date: args.date,
          type: args.type,
          idempotencyKey: ctx.idempotencyKey || undefined,
        })
        .returning();

      return {
        data: {
          success: true,
          transactionId: created.id,
        },
      };
    },
  },
  {
    id: 'liabilities.summary.v1',
    aliases: ['get_debts_and_credits'],
    description: 'Get debts, credits, and mortgages summary.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: z.object({}).strict(),
    argsJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async ({ userId }) => {
      const [{ accountIds }, debtsList] = await Promise.all([
        getUserHierarchy(userId),
        db.query.debts.findMany({ where: eq(debts.userId, userId) }),
      ]);

      if (accountIds.length === 0) {
        return {
          data: {
            debts: debtsList.map((debtItem) => ({
              person: debtItem.personName,
              amount: debtItem.amount,
              type: debtItem.type,
              status: debtItem.status,
            })),
            credits: [],
            mortgages: [],
          },
        };
      }

      const [creditsList, mortgagesList] = await Promise.all([
        db.query.credits.findMany({ where: inArray(credits.accountId, accountIds) }),
        db.query.mortgages.findMany({ where: inArray(mortgages.accountId, accountIds) }),
      ]);

      return {
        data: {
          debts: debtsList.map((debtItem) => ({
            person: debtItem.personName,
            amount: debtItem.amount,
            type: debtItem.type,
            status: debtItem.status,
          })),
          credits: creditsList.map((creditItem) => ({
            name: creditItem.name,
            principal: creditItem.principalAmount,
            remaining: creditItem.remainingBalance,
            monthly: creditItem.monthlyPayment,
          })),
          mortgages: mortgagesList.map((mortgageItem) => ({
            property: mortgageItem.propertyName,
            remaining: mortgageItem.remainingBalance,
            monthly: mortgageItem.monthlyPayment,
          })),
        },
      };
    },
  },
  {
    id: 'payments.upcoming.v1',
    aliases: ['get_upcoming_payments'],
    description: 'List upcoming recurring payments.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: upcomingPaymentsArgsSchema,
    argsJsonSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', minimum: 1, maximum: 365 },
      },
      additionalProperties: false,
    },
    execute: async ({ userId }, args) => {
      const [{ accountIds }, subscriptionRows] = await Promise.all([
        getUserHierarchy(userId),
        db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId) }),
      ]);

      if (accountIds.length === 0) {
        return {
          data: {
            daysLookahead: args.days || 30,
            subscriptions: subscriptionRows.map((subscriptionItem) => ({
              name: subscriptionItem.name,
              amount: subscriptionItem.amount,
              frequency: subscriptionItem.frequency,
              nextDate: `Check billing day ${subscriptionItem.billingDay}`,
            })),
            credits: [],
            mortgages: [],
          },
        };
      }

      const [creditsList, mortgagesList] = await Promise.all([
        db.query.credits.findMany({ where: inArray(credits.accountId, accountIds) }),
        db.query.mortgages.findMany({ where: inArray(mortgages.accountId, accountIds) }),
      ]);

      return {
        data: {
          daysLookahead: args.days || 30,
          subscriptions: subscriptionRows.map((subscriptionItem) => ({
            name: subscriptionItem.name,
            amount: subscriptionItem.amount,
            frequency: subscriptionItem.frequency,
            nextDate: `Check billing day ${subscriptionItem.billingDay}`,
          })),
          credits: creditsList.map((creditItem) => ({
            name: creditItem.name,
            amount: creditItem.monthlyPayment,
            nextDate: 'Monthly',
          })),
          mortgages: mortgagesList.map((mortgageItem) => ({
            name: mortgageItem.propertyName,
            amount: mortgageItem.monthlyPayment,
            nextDate: `Monthly on day ${mortgageItem.paymentDay}`,
          })),
        },
      };
    },
  },
  {
    id: 'netWorth.breakdown.v1',
    aliases: ['get_net_worth_breakdown'],
    description: 'Get net worth breakdown converted to user default currency.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: z.object({}).strict(),
    argsJsonSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: async ({ userId }) => {
      const [user, { userBanks }] = await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, userId) }),
        getUserHierarchy(userId),
      ]);

      const defaultCurrency = user?.defaultCurrency || 'USD';
      const rates = await db.query.fxRates.findMany({
        where: eq(fxRates.toCurrency, defaultCurrency),
        orderBy: [desc(fxRates.date)],
        limit: 100,
      });

      const rateMap = new Map<string, number>([[defaultCurrency, 1]]);
      for (const rate of rates) {
        if (!rateMap.has(rate.fromCurrency)) {
          rateMap.set(rate.fromCurrency, Number(rate.rate));
        }
      }

      let totalNetWorth = 0;
      const breakdown = userBanks.map((bankItem) => {
        let bankTotal = 0;
        for (const accountItem of bankItem.accounts) {
          for (const balance of accountItem.currencyBalances) {
            const rate = rateMap.get(balance.currencyCode) || 1;
            bankTotal += Number(balance.balance) * rate;
          }
        }
        totalNetWorth += bankTotal;

        return {
          bankName: bankItem.name,
          totalValue: bankTotal.toFixed(2),
          currency: defaultCurrency,
        };
      });

      breakdown.sort((a, b) => Number(b.totalValue) - Number(a.totalValue));

      return {
        data: {
          defaultCurrency,
          totalNetWorth: totalNetWorth.toFixed(2),
          breakdown,
        },
      };
    },
  },
  {
    id: 'navigation.goTo.v1',
    aliases: ['navigate_to'],
    description: 'Return a client navigation action to a supported path.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: navigateArgsSchema,
    argsJsonSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          enum: NAVIGATION_PATHS,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    execute: async (_ctx, args) => {
      return {
        data: { success: true, path: args.path },
        clientAction: { type: 'navigate', path: args.path },
      };
    },
  },
  {
    id: 'docs.query.v1',
    aliases: ['query_docs'],
    description: 'Search built-in product help snippets.',
    readOnly: true,
    requiresConfirmation: false,
    introducedAt: '2026-02-21',
    argsSchema: queryDocsArgsSchema,
    argsJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    execute: async (_ctx, args) => {
      const normalized = args.query.toLowerCase();
      const results = docsIndex
        .filter((doc) => {
          const topicMatch = doc.topic.toLowerCase().includes(normalized);
          const keywordMatch = doc.keywords.some((keyword) => normalized.includes(keyword));
          const contentMatch = doc.content.toLowerCase().includes(normalized);
          return topicMatch || keywordMatch || contentMatch;
        })
        .map((doc) => `${doc.topic}: ${doc.content}`);

      return {
        data: {
          results: results.length > 0 ? results : ['No specific help article found. Try a more precise query.'],
        },
      };
    },
  },
];

const capabilityById = new Map<string, CapabilityDefinition>(capabilities.map((capability) => [capability.id, capability]));

const aliasToCapabilityId = new Map<string, string>();
for (const capability of capabilities) {
  for (const alias of capability.aliases || []) {
    aliasToCapabilityId.set(alias, capability.id);
  }
}

function resolveCapability(idOrAlias: string): { capabilityId: string; aliasUsed?: string; definition?: CapabilityDefinition } {
  const direct = capabilityById.get(idOrAlias);
  if (direct) {
    return { capabilityId: direct.id, definition: direct };
  }

  const mappedId = aliasToCapabilityId.get(idOrAlias);
  if (!mappedId) {
    return { capabilityId: idOrAlias };
  }

  return {
    capabilityId: mappedId,
    aliasUsed: idOrAlias,
    definition: capabilityById.get(mappedId),
  };
}

export function getCapabilityManifest(): CapabilityManifest {
  return {
    version: CAPABILITY_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      aliases: capability.aliases || [],
      description: capability.description,
      readOnly: capability.readOnly,
      requiresConfirmation: capability.requiresConfirmation,
      introducedAt: capability.introducedAt,
      deprecatedAt: capability.deprecatedAt,
      argsSchema: capability.argsJsonSchema,
    })),
  };
}

export function isCapabilityReadOnly(capabilityIdOrAlias: string): boolean {
  const { definition } = resolveCapability(capabilityIdOrAlias);
  return definition?.readOnly ?? false;
}

export async function executeCapability(input: ExecuteCapabilityInput): Promise<CapabilityExecutionResult> {
  const { capabilityId, aliasUsed, definition } = resolveCapability(input.capabilityId);

  if (!definition) {
    return {
      success: false,
      capabilityId,
      aliasUsed,
      error: {
        code: 'UNKNOWN_CAPABILITY',
        message: `Unknown capability: ${input.capabilityId}`,
        details: {
          available: capabilities.map((capability) => capability.id),
        },
      },
    };
  }

  const parsedArgs = definition.argsSchema.safeParse(input.args || {});
  if (!parsedArgs.success) {
    return {
      success: false,
      capabilityId,
      aliasUsed,
      readOnly: definition.readOnly,
      error: {
        code: 'INVALID_ARGS',
        message: 'Arguments do not match capability schema.',
        details: parsedArgs.error.flatten(),
      },
    };
  }

  try {
    const payload = await definition.execute(
      {
        userId: input.userId,
        dryRun: input.dryRun,
        confirmationToken: input.confirmationToken,
        idempotencyKey: input.idempotencyKey,
      },
      parsedArgs.data
    );

    return {
      success: true,
      capabilityId,
      aliasUsed,
      readOnly: definition.readOnly,
      data: payload.data,
      userMessage: payload.userMessage,
      clientAction: payload.clientAction,
    };
  } catch (error: any) {
    return {
      success: false,
      capabilityId,
      aliasUsed,
      readOnly: definition.readOnly,
      error: {
        code: 'EXECUTION_ERROR',
        message: error?.message || 'Capability execution failed.',
      },
    };
  }
}
