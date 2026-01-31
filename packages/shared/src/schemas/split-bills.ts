import { z } from 'zod';

// Contact types for split participants
export const contactTypeSchema = z.enum(['telegram', 'whatsapp', 'phone', 'email', 'other']);
export type ContactType = z.infer<typeof contactTypeSchema>;

// Split status
export const splitStatusSchema = z.enum(['pending', 'partial', 'settled']);
export type SplitStatus = z.infer<typeof splitStatusSchema>;

// ==========================================
// Split Participant Schemas
// ==========================================

export const createSplitParticipantSchema = z.object({
    name: z.string().min(1).max(100),
    contactType: contactTypeSchema.optional(),
    contactValue: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateSplitParticipantSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    contactType: contactTypeSchema.nullable().optional(),
    contactValue: z.string().nullable().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    isActive: z.boolean().optional(),
});

// ==========================================
// Transaction Split Schemas
// ==========================================

// Individual split entry when creating/updating splits
export const splitEntrySchema = z.object({
    participantId: z.string().uuid(),
    owedAmount: z.number().positive(),
    note: z.string().optional(),
});

// Create splits for a transaction
export const createTransactionSplitsSchema = z.object({
    transactionId: z.string().uuid(),
    splits: z.array(splitEntrySchema).min(1),
    // If true, divide the transaction amount equally among all participants
    equalSplit: z.boolean().default(false),
    // If equalSplit is true, this is the total amount to split (defaults to transaction amount)
    totalAmount: z.number().positive().optional(),
});

// Quick split - create splits when creating a transaction
export const quickSplitSchema = z.object({
    participantIds: z.array(z.string().uuid()).min(1),
    // If true, split equally
    equalSplit: z.boolean().default(true),
    // Custom amounts per participant (used when equalSplit is false)
    amounts: z.array(z.object({
        participantId: z.string().uuid(),
        amount: z.number().positive(),
    })).optional(),
    // Whether to include yourself in the split calculation
    includeSelf: z.boolean().default(true),
});

// Update a single split
export const updateTransactionSplitSchema = z.object({
    id: z.string().uuid(),
    owedAmount: z.number().positive().optional(),
    note: z.string().nullable().optional(),
});

// ==========================================
// Split Payment Schemas
// ==========================================

export const recordSplitPaymentSchema = z.object({
    splitId: z.string().uuid(),
    amount: z.number().positive(),
    // Optionally specify which account received the payment
    receivedToCurrencyBalanceId: z.string().uuid().optional(),
    // Whether to create an income transaction for this payment
    createIncomeTransaction: z.boolean().default(false),
    note: z.string().optional(),
});

// Mark a split as fully paid
export const settleSplitSchema = z.object({
    splitId: z.string().uuid(),
    // Optionally specify which account received the payment
    receivedToCurrencyBalanceId: z.string().uuid().optional(),
    // Whether to create an income transaction
    createIncomeTransaction: z.boolean().default(false),
    note: z.string().optional(),
});

// ==========================================
// Query Schemas
// ==========================================

export const getSplitsQuerySchema = z.object({
    transactionId: z.string().uuid().optional(),
    participantId: z.string().uuid().optional(),
    status: splitStatusSchema.optional(),
    // Date range for the original transaction
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const getPendingSplitsQuerySchema = z.object({
    // Only get splits where you are owed money (others owe you)
    limit: z.number().min(1).max(100).default(50),
});

// ==========================================
// Types
// ==========================================

export type CreateSplitParticipant = z.infer<typeof createSplitParticipantSchema>;
export type UpdateSplitParticipant = z.infer<typeof updateSplitParticipantSchema>;
export type SplitEntry = z.infer<typeof splitEntrySchema>;
export type CreateTransactionSplits = z.infer<typeof createTransactionSplitsSchema>;
export type QuickSplit = z.infer<typeof quickSplitSchema>;
export type UpdateTransactionSplit = z.infer<typeof updateTransactionSplitSchema>;
export type RecordSplitPayment = z.infer<typeof recordSplitPaymentSchema>;
export type SettleSplit = z.infer<typeof settleSplitSchema>;
export type GetSplitsQuery = z.infer<typeof getSplitsQuerySchema>;
export type GetPendingSplitsQuery = z.infer<typeof getPendingSplitsQuerySchema>;
