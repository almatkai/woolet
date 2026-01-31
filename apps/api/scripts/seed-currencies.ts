
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { currencies, DEFAULT_CURRENCIES } from '../src/db/schema/currencies';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
    console.log('🌱 Seeding currencies...');

    await db.insert(currencies)
        .values(DEFAULT_CURRENCIES)
        .onConflictDoNothing();

    console.log('✅ Currencies seeded.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Error seeding currencies:', err);
    process.exit(1);
});
