
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
    console.log('🗑️ Dropping all tables...');

    // Drop all tables in public schema
    await client`DROP SCHEMA public CASCADE;`;
    await client`CREATE SCHEMA public;`;
    await client`GRANT ALL ON SCHEMA public TO public;`; // standard permissions

    console.log('✅ All tables dropped. Database is clean.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Error dropping tables:', err);
    process.exit(1);
});
