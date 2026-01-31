import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString, { max: 1 });

async function migrate() {
    try {
        console.log('Creating investing tables...');
        
        const migrationSQL = readFileSync(join(__dirname, 'drizzle/0005_superb_ezekiel.sql'), 'utf-8');
        await sql.unsafe(migrationSQL);
        
        console.log('✓ Investing tables migration applied successfully!');
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            console.log('✓ Tables already exist, skipping migration');
        } else {
            console.error('Migration error:', error);
            throw error;
        }
    } finally {
        await sql.end();
    }
}

migrate();
