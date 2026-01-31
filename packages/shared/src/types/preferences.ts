export interface UserPreferences {
    // General settings
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday (default), etc.
    
    // Widget-specific preferences
    spendingWidget?: {
        categoryIds?: string[];
    };
    
    recentTransactionsWidget?: {
        excludedCategories?: string[];
        period?: string;
    };
}

export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEK_START_OPTIONS = [
    { value: 0 as WeekStartDay, label: 'Sunday' },
    { value: 1 as WeekStartDay, label: 'Monday' },
    { value: 2 as WeekStartDay, label: 'Tuesday' },
    { value: 3 as WeekStartDay, label: 'Wednesday' },
    { value: 4 as WeekStartDay, label: 'Thursday' },
    { value: 5 as WeekStartDay, label: 'Friday' },
    { value: 6 as WeekStartDay, label: 'Saturday' },
] as const;

export const DEFAULT_WEEK_STARTS_ON: WeekStartDay = 1; // Monday