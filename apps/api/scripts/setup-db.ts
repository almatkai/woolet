import postgres from 'postgres';

async function setupDatabase() {
    const fullUrl = process.env.DATABASE_URL;

    if (!fullUrl) {
        console.error('❌ DATABASE_URL is not defined');
        process.exit(1);
    }

    try {
        // Parse the connection string to get the target database name
        // Format: postgresql://user:password@host:port/dbname
        const url = new URL(fullUrl);
        const targetDb = url.pathname.slice(1); // remove leading '/'

        if (!targetDb) {
            console.error('❌ Could not determine target database name from DATABASE_URL');
            process.exit(1);
        }

        console.log(`⏳ Checking if database '${targetDb}' exists...`);

        // Connect to the default 'postgres' database to perform administrative tasks
        const adminUrl = new URL(fullUrl);
        adminUrl.pathname = '/postgres';

        const sql = postgres(adminUrl.toString(), { max: 1 });

        const exists = await sql`
            SELECT 1 FROM pg_database WHERE datname = ${targetDb}
        `;

        if (exists.length === 0) {
            console.log(`🚧 Database '${targetDb}' does not exist. Creating...`);
            // Note: CREATE DATABASE cannot be executed in a transaction or with parameters for the name
            await sql.unsafe(`CREATE DATABASE "${targetDb}"`);
            console.log(`✅ Database '${targetDb}' created successfully.`);
        } else {
            console.log(`✅ Database '${targetDb}' already exists.`);
        }

        await sql.end();
    } catch (error: any) {
        // If the error is that the database already exists (just in case of race conditions)
        if (error.message?.includes('already exists')) {
            console.log(`✅ Database already exists (handled error).`);
        } else {
            console.error('❌ Database setup failed:', error.message);
            // Don't exit with error if we just can't connect to 'postgres' (e.g. on limited managed hosts)
            // Migrations might still work if the DB already exists.
        }
    }
}

setupDatabase();
