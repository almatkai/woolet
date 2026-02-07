# Woolet  Agent Guidelines

Hello! If you are a Gemini or any other AI agent working on this project, please follow these guidelines to maintain data integrity and project consistency.

## 🚀 Data Export & Import

Whenever you add a new feature that introduces new database tables or entities, you **MUST** update the data sync functionality in:
- `apps/api/src/routers/data.ts`

### 📋 Checklist for New Entities
1.  **Update `exportData`**: Add a query to fetch the new records for the current user. Ensure related data is also fetched if necessary.
2.  **Update `importData`**: 
    - Add a `delete` statement in the transaction to clear existing data for that entity.
    - Add an `insert` statement to restore the data from the imported JSON.
    - Ensure correct insertion order to satisfy foreign key constraints.
3.  **Handle Date Parsing**: If your new table has `TIMESTAMP` columns, ensure they are handled by the `parseDates` utility (which targets full ISO strings).
4.  **Handle ID Conflict**: Ensure your new IDs are remapped using the `remapIds` utility to maintain relationships while allowing imports across different accounts.

## 🛠️ Schema Conventions
- Use `uuid('id').defaultRandom().primaryKey()` for all primary keys.
- Use `timestamp('created_at').defaultNow().notNull()` and `updatedAt` for record tracking.
- Ensure `onDelete: 'cascade'` or `onDelete: 'set null'` is correctly set for foreign keys to prevent orphan records or orphaned syncs.

## 🧪 Testing Sync
Always verify your changes by:
1. Exporting data with your new feature records.
2. Wiping user data (or using another test account).
3. Importing the JSON and verifying the records are restored correctly with their relationships.

## ✅ Proper Drizzle Migration Workflow

When you change the database schema locally, follow these steps to ensure the production database stays in sync:

1.  **Edit Schema**: Modify your schema files in `apps/api/src/db/schema/`.
2.  **Generate Migration**: 
    ```bash
    cd apps/api
    bun run db:generate
    ```
    This creates a new `.sql` file in `apps/api/drizzle/` and updates the journal.
3.  **Commit Migrations**: Always commit the generated `.sql` files and the updated `_journal.json` to git.
4.  **Deploy**: Pushing to GitHub builds a new Docker image containing these migration files. The `deploy.sh` script on the server runs `bun run db:migrate` automatically.

### 🔑 Key Rules
- **Never skip `db:generate`**: The snapshots alone are not enough; the SQL files are the source of truth for database changes.
- **Do not modify SQL manually**: If you need to change a migration, delete the SQL and generate it again.
- **Idempotency**: All migrations are configured to be idempotent, but avoid re-running migrations that have already succeeded.

## 💱 Currency selector
- If you add a currency selector anywhere in the app, **use the shared `CurrencySelect` component** (`apps/web/src/components/CurrencySelect.tsx`) so **subscriptions**, **accounts**, and transactions use the same currency list and display consistently.

---
*Maintained by the Woolet  Team and AI Agents.*
