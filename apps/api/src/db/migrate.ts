import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { db } from './index';
import { fileURLToPath } from 'url';
import { ensureDatabaseExists } from './setup';

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
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        if (error.message?.includes('already exists')) {
            console.log('⚠️  Tables already exist, continuing...');
        } else {
            throw error;
        }
    }
}
