import { pgTable, text, integer } from 'drizzle-orm/pg-core';

export const currencies = pgTable('currencies', {
    code: text('code').primaryKey(), // ISO 4217: USD, EUR, KZT
    name: text('name').notNull(), // US Dollar, Euro, Kazakhstani Tenge
    symbol: text('symbol').notNull(), // $, €, ₸
    decimalPlaces: integer('decimal_places').default(2).notNull(),
});

// Pre-defined currencies to seed
// Pre-defined currencies to seed
export const DEFAULT_CURRENCIES = [
    { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
    { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2 },
    { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸', decimalPlaces: 2 },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimalPlaces: 2 },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2 },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0 },
    { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimalPlaces: 2 },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2 },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2 },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2 },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2 },
    { code: 'BTC', name: 'Bitcoin', symbol: '₿', decimalPlaces: 8 },
    { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', decimalPlaces: 8 },
    { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimalPlaces: 0 },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2 },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimalPlaces: 2 },
    { code: 'MXN', name: 'Mexican Peso', symbol: '$', decimalPlaces: 2 },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimalPlaces: 2 },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimalPlaces: 2 },
    { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimalPlaces: 2 },
    { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimalPlaces: 2 },
    { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimalPlaces: 2 },
    { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimalPlaces: 2 },
    { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2 },
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 2 },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalPlaces: 2 },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalPlaces: 0 },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalPlaces: 2 },
    { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2 },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalPlaces: 2 },
    { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimalPlaces: 2 },
    { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimalPlaces: 2 },
    { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimalPlaces: 2 },
    { code: 'CLP', name: 'Chilean Peso', symbol: '$', decimalPlaces: 0 },
    { code: 'COP', name: 'Colombian Peso', symbol: '$', decimalPlaces: 2 },
    { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/', decimalPlaces: 2 },
    { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimalPlaces: 2 },
    { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', decimalPlaces: 2 },
    { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimalPlaces: 2 },
    { code: 'KGS', name: 'Kyrgyzstani Som', symbol: 'с', decimalPlaces: 2 },
    { code: 'UZS', name: 'Uzbekistani Som', symbol: 'so\'m', decimalPlaces: 2 },
    { code: 'GEL', name: 'Georgian Lari', symbol: '₾', decimalPlaces: 2 },
    { code: 'AMD', name: 'Armenian Dram', symbol: '֏', decimalPlaces: 2 },
    { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼', decimalPlaces: 2 },
    { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'SM', decimalPlaces: 2 },
    { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br', decimalPlaces: 2 },
    { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮', decimalPlaces: 2 },
    { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', decimalPlaces: 2 },
    { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimalPlaces: 3 },
    { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimalPlaces: 3 },
    { code: 'OMR', name: 'Omani Rial', symbol: '﷼', decimalPlaces: 3 },
    { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JD', decimalPlaces: 3 },
    { code: 'LBP', name: 'Lebanese Pound', symbol: 'L£', decimalPlaces: 2 },
    { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimalPlaces: 2 },
    { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', decimalPlaces: 2 },
    { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimalPlaces: 2 },
    { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', decimalPlaces: 2 },
];

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
