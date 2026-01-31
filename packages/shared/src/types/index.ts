// Account types
export type AccountType = 'bank' | 'cash' | 'card' | 'crypto' | 'investment';

// Transaction types
export type TransactionType = 'income' | 'expense' | 'transfer';

// Debt types
export type DebtType = 'i_owe' | 'they_owe';
export type DebtStatus = 'pending' | 'partial' | 'paid';

// Financial product status
export type FinancialProductStatus = 'active' | 'paid_off' | 'defaulted';

// Compounding frequency
export type CompoundingFrequency = 'daily' | 'monthly' | 'annually';

// Preferences types
export * from './preferences';

// Investing types
export * from './investing';
