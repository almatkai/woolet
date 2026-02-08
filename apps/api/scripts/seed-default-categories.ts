/**
 * Seed default categories into the database.
 * These are system-wide categories with userId = null that all users can use.
 * 
 * Run with: bun run --env-file=../../.env scripts/seed-default-categories.ts
 */

import { db } from '../src/db';
import { categories, DEFAULT_CATEGORIES } from '../src/db/schema';

async function seedDefaultCategories() {
    console.log('🌱 Seeding default categories...');
    
    let inserted = 0;
    let skipped = 0;
    
    for (const category of DEFAULT_CATEGORIES) {
        try {
            await db.insert(categories).values({
                id: category.id,
                userId: null, // System-wide category
                name: category.name,
                icon: category.icon,
                color: category.color,
                type: category.type,
            }).onConflictDoNothing();
            inserted++;
        } catch (error) {
            skipped++;
            console.log(`  ⏭️  Skipped "${category.name}" (already exists or error)`);
        }
    }
    
    console.log(`✅ Seeded ${inserted} categories (${skipped} skipped)`);
    process.exit(0);
}

seedDefaultCategories().catch((error) => {
    console.error('❌ Failed to seed categories:', error);
    process.exit(1);
});
