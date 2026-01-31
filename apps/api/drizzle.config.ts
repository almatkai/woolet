import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load the root .env so migration tools always have DATABASE_URL defined.
config({ path: '../../.env', override: false });

export default {
    schema: './src/db/schema/index.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
} satisfies Config;
