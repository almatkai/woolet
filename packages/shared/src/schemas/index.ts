import { z } from 'zod';

// Account schemas
export const createAccountSchema = z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['bank', 'cash', 'card', 'crypto', 'investment']),
    isCash: z.boolean().default(false),
    currency: z.string().length(3),
    balance: z.number().default(0),
    icon: z.string().optional(),
    color: z.string().optional(),
});

// Transaction schemas
export const createTransactionSchema = z.object({
    accountId: z.string().uuid(),
    categoryId: z.string().uuid(),
    amount: z.number().positive(),
    type: z.enum(['income', 'expense', 'transfer']),
    description: z.string().optional(),
    date: z.string(),
    toAccountId: z.string().uuid().optional(),
    fee: z.number().min(0).default(0),
});

// Debt schemas
export const createDebtSchema = z.object({
    accountId: z.string().uuid(),
    personName: z.string().min(1).max(100),
    personContact: z.string().optional(),
    amount: z.number().positive(),
    type: z.enum(['i_owe', 'they_owe']),
    description: z.string().optional(),
    dueDate: z.string().optional(),
});

// Category schemas
export const createCategorySchema = z.object({
    name: z.string().min(1).max(50),
    icon: z.string().min(1),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// Investing schemas
export * from './investing';

// Split bills schemas
export * from './split-bills';
