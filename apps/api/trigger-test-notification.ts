import { db } from './src/db';
import { notifications, users } from './src/db/schema';
import { eq, desc } from 'drizzle-orm';

async function triggerTest() {
    // 1. Get user IDs from command line arguments
    const targetUserIds = process.argv.slice(2);
    
    if (targetUserIds.length === 0) {
        // Fallback to latest user if no IDs provided
        const latestUser = await db.query.users.findFirst({
            orderBy: [desc(users.createdAt)],
        });
        if (latestUser) {
            targetUserIds.push(latestUser.id);
        } else {
            console.error('❌ No users found in database.');
            process.exit(1);
        }
    }

    console.log(`🔔 Sending test notifications to ${targetUserIds.length} user(s)...`);

    for (const userId of targetUserIds) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            console.warn(`⚠️ User with ID ${userId} not found, skipping.`);
            continue;
        }

        console.log(`  -> Creating for: ${user.email} (${user.id})`);

        // 2. Insert a new notification
        await db.insert(notifications).values({
            userId: user.id,
            type: 'general',
            title: 'Test Notification 🚀',
            message: 'This is a test browser notification from Woolet!',
            priority: 'high',
            links: {
                web: '/notifications',
            },
            isRead: false,
        });
    }

    console.log('✅ All notifications created in database!');
    console.log('👉 Users should see them in their browsers within 30 seconds.');
    process.exit(0);
}

triggerTest().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
