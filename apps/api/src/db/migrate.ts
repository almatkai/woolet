import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { db } from './index';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
    console.log('⏳ Running migrations...');
    try {
        // The drizzle folder is at apps/api/drizzle
        // This file is at apps/api/src/db/migrate.ts
        // So we need to go up two levels to src, then one to api, then into drizzle
        const migrationsFolder = path.join(__dirname, '..', '..', 'drizzle');
        
        await migrate(db, {
            migrationsFolder,
        });
        console.log('✅ Migrations completed!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        // Don't exit process here if we want the server to try to start anyway,
        // but usually you want it to fail.
        throw error;
    }
}
