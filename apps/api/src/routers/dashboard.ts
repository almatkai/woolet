import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../lib/trpc';
import { dashboardLayouts, widgetMetadata } from '../db/schema';

// Define the layout item schema (based on react-grid-layout)
const layoutItemSchema = z.object({
    i: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    minW: z.number().optional(),
    maxW: z.number().optional(),
    minH: z.number().optional(),
    maxH: z.number().optional(),
});

// Schema for multi-breakpoint layouts
const responsiveLayoutsSchema = z.object({
    lg: z.array(layoutItemSchema),
    md: z.array(layoutItemSchema),
    sm: z.array(layoutItemSchema),
    xs: z.array(layoutItemSchema),
});

// Widget registry with creation dates
// This will be used to determine if a widget is "new" for existing users
export const WIDGET_REGISTRY: Record<string, { name: string; description: string; createdAt: string; version: string }> = {
    totalBalance: { name: 'Total Balance', description: 'Your total account balance', createdAt: '2025-01-01', version: '1.0.0' },
    monthlyIncome: { name: 'Monthly Income', description: 'Income for current month', createdAt: '2025-01-01', version: '1.0.0' },
    monthlyExpenses: { name: 'Monthly Expenses', description: 'Expenses for current month', createdAt: '2025-01-01', version: '1.0.0' },
    debts: { name: 'Debts', description: 'Personal debts', createdAt: '2025-01-01', version: '1.0.0' },
    categoryChart: { name: 'Category Chart', description: 'Spending by category', createdAt: '2025-01-01', version: '1.0.0' },
    spendingChart: { name: 'Spending Chart', description: 'Spending over time', createdAt: '2025-01-01', version: '1.0.0' },
    mortgages: { name: 'Mortgages', description: 'Mortgage loans', createdAt: '2025-01-01', version: '1.0.0' },
    recentTransactions: { name: 'Recent Transactions', description: 'Latest transactions', createdAt: '2025-01-01', version: '1.0.0' },
    credits: { name: 'Credits', description: 'Credit cards', createdAt: '2025-01-01', version: '1.0.0' },
    deposits: { name: 'Deposits', description: 'Bank deposits', createdAt: '2025-01-01', version: '1.0.0' },
    subscriptions: { name: 'Subscriptions', description: 'Recurring subscriptions', createdAt: '2025-01-01', version: '1.0.0' },
    // New widgets - January 31, 2026
    currencyExchange: { name: 'Currency Exchange', description: 'Live currency rates', createdAt: '2026-01-31', version: '1.0.0' },
    investmentPortfolio: { name: 'Investment Portfolio', description: 'Your investment holdings', createdAt: '2026-01-31', version: '1.0.0' },
    investmentPerformance: { name: 'Investment Performance', description: 'Portfolio performance metrics', createdAt: '2026-01-31', version: '1.0.0' },
    assetAllocation: { name: 'Asset Allocation', description: 'Portfolio distribution', createdAt: '2026-01-31', version: '1.0.0' },
};

export const dashboardRouter = router({
    getLayout: protectedProcedure.query(async ({ ctx }) => {
        const layout = await ctx.db.query.dashboardLayouts.findFirst({
            where: eq(dashboardLayouts.userId, ctx.userId!),
        });
        if (!layout) return null;

        // Return the stored layout data as-is
        // Frontend handles migration from old format
        return layout.layout as any;
    }),

    saveLayout: protectedProcedure
        .input(z.object({
            layouts: responsiveLayoutsSchema,
            hiddenWidgets: z.array(z.string()).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // Store layouts for all breakpoints
            const layoutData = {
                layouts: input.layouts,
                hiddenWidgets: input.hiddenWidgets || [],
            };

            await ctx.db
                .insert(dashboardLayouts)
                .values({
                    userId: ctx.userId!,
                    layout: layoutData,
                })
                .onConflictDoUpdate({
                    target: dashboardLayouts.userId,
                    set: {
                        layout: layoutData,
                        updatedAt: new Date(),
                    },
                });
            return { success: true };
        }),

    // Get all widget metadata
    getWidgetRegistry: protectedProcedure.query(() => {
        return WIDGET_REGISTRY;
    }),

    // Check which new widgets should be shown to user based on when they last saved layout
    getNewWidgets: protectedProcedure.query(async ({ ctx }) => {
        const layout = await ctx.db.query.dashboardLayouts.findFirst({
            where: eq(dashboardLayouts.userId, ctx.userId!),
        });

        if (!layout) {
            // New user - all widgets are "old" (should be shown)
            return { newWidgets: [], showAllWidgets: true };
        }

        const lastSavedAt = layout.updatedAt;
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // Find widgets created after user's last save
        const newWidgets = Object.entries(WIDGET_REGISTRY)
            .filter(([widgetId, meta]) => {
                const widgetCreatedAt = new Date(meta.createdAt);
                // Widget is new if created after user's last save
                return widgetCreatedAt > lastSavedAt;
            })
            .filter(([widgetId, meta]) => {
                const widgetCreatedAt = new Date(meta.createdAt);
                // And it's less than 1 month old (hide after 1 month)
                return widgetCreatedAt > oneMonthAgo;
            })
            .map(([widgetId]) => widgetId);

        return { newWidgets, showAllWidgets: false };
    }),
});
