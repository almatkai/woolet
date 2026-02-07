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

        const appUser = process.env.APP_DB_USER || 'woolet_app';

        let sql;
        try {
            sql = postgres(adminUrl.toString(), { max: 1, connect_timeout: 5 });

            // 1. Ensure target database exists
            const exists = await sql`
                SELECT 1 FROM pg_database WHERE datname = ${targetDb}
            `;

            if (exists.length === 0) {
                console.log(`🚧 Database '${targetDb}' does not exist. Creating...`);
                await sql.unsafe(`CREATE DATABASE "${targetDb}"`);
                console.log(`✅ Database '${targetDb}' created successfully.`);
            } else {
                console.log(`✅ Database '${targetDb}' already exists.`);
            }

            // 2. Grant privileges to the application user (assuming it already exists)
            console.log(`🔑 Granting privileges on '${targetDb}' to '${appUser}'...`);
            try {
                // Connect tasks often need these
                await sql.unsafe(`GRANT CONNECT ON DATABASE "${targetDb}" TO "${appUser}"`);
                await sql.unsafe(`GRANT TEMP ON DATABASE "${targetDb}" TO "${appUser}"`);

                // Now we need to grant schema-level permissions.
                // In Postgres 15+, the "public" schema needs explicit CREATE grants.
                const targetSql = postgres(fullUrl, { max: 1, connect_timeout: 5 });
                await targetSql.unsafe(`GRANT ALL ON SCHEMA public TO "${appUser}"`);
                await targetSql.end();

                console.log(`✅ Privileges granted.`);
            } catch (grantError: any) {
                console.warn(`⚠️  Warning: Could not grant all privileges: ${grantError.message}`);
                console.log(`💡 Note: If user '${appUser}' doesn't exist, this is expected.`);
            }

            await sql.end();
        } catch (adminError: any) {
            console.log(`⚠️ Could not connect to 'postgres' database or perform admin tasks: ${adminError.message}`);
            console.log(`📡 Attempting direct connection to verify '${targetDb}'...`);

            const directSql = postgres(fullUrl, { max: 1, connect_timeout: 5 });
            try {
                await directSql`SELECT 1`;
                console.log(`✅ Successfully connected to '${targetDb}'.`);
                await directSql.end();
            } catch (directError: any) {
                console.error(`❌ Could not connect to '${targetDb}' either:`, directError.message);
                throw directError;
            }
        }
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            console.log(`✅ Already exists (handled error).`);
        } else {
            console.error('❌ Database setup failed:', error.message);
        }
    }
}

setupDatabase();
