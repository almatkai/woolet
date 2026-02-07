import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString, { max: 1 });

async function syncMigrations() {
    try {
        console.log('⏳ Starting migration synchronization...');

        const migrationFile = 'drizzle/0000_complex_wither.sql';
        const content = fs.readFileSync(migrationFile, 'utf8');

        // Remove comments and split by statement-breakpoint
        const statements = content
            .split('--> statement-breakpoint')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        console.log(` Running ${statements.length} statements...`);

        for (const statement of statements) {
            try {
                await sql.unsafe(statement);
            } catch (err: any) {
                if (err.message.includes('already exists') || err.message.includes('skipping')) {
                    // console.log(`⏩ Skipping: ${statement.substring(0, 50)}...`);
                } else {
                    console.error(`❌ Error in statement: ${statement}`);
                    throw err;
                }
            }
        }

        console.log('✅ Statements processed. Recording migration in tracking table...');

        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const createdAt = Date.now();

        await sql`
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${hash}, ${createdAt})
            ON CONFLICT (id) DO UPDATE SET hash = ${hash}, created_at = ${createdAt};
        `;

        console.log('✨ Migration 0000 synchronized successfully!');
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

syncMigrations();
