import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { db } from './index';
import { fileURLToPath } from 'url';
import { ensureDatabaseExists } from './setup';
import * as schema from './schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
    await ensureDatabaseExists();

    console.log('⏳ Running migrations...');
    try {
        const migrationsFolder = path.resolve('drizzle');

        await migrate(db, {
            migrationsFolder,
        });
        console.log('✅ Migrations completed!');

        // Seed default currencies if they don't exist
        console.log('🌱 Seeding default currencies...');
        try {
            await db.insert(schema.currencies)
                .values(schema.DEFAULT_CURRENCIES)
                .onConflictDoNothing();
            console.log('✅ Currencies seeded.');
        } catch (seedError) {
            console.error('⚠️ Failed to seed currencies:', seedError);
        }
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        if (error.message?.includes('already exists')) {
            console.log('⚠️  Tables already exist, continuing...');
        } else {
            throw error;
        }
    }
}
