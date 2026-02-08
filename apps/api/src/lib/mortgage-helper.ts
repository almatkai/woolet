
import { db } from '../db';
import { mortgages, mortgagePayments, transactions, categories, currencyBalances, accounts } from '../db/schema';
import { eq, and, like } from 'drizzle-orm';

/**
 * Checks if a transaction is a mortgage payment and links it to the mortgage.
 * 
 * Logic:
 * 1. Transaction must be an EXPENSE.
 * 2. It must have a category named "Mortgage" (or similar).
 * 3. It must belong to an account that has an Active Mortgage.
 * 4. Create a record in `mortgage_payments` for the transaction month.
 * 5. Update the mortgage remaining balance.
 */
export async function processMortgagePaymentFromTransaction(
    transactionId: string
) {
    try {
        const tx = await db.query.transactions.findFirst({
            where: eq(transactions.id, transactionId),
            with: {
                category: true,
                currencyBalance: {
                    with: {
                        account: true
                    }
                }
            }
        });

        if (!tx || tx.type !== 'expense') return;

        // Check Category: Must be "Mortgage"
        // TODO: Make this more robust, maybe user setting or fuzzy match?
        // For now, simple string includes 'mortgage' is safe enough given the user context.
        const categoryName = tx.category?.name?.toLowerCase() || '';
        const description = tx.description?.toLowerCase() || '';

        const isMortgageRelated = categoryName.includes('mortgage') || description.includes('mortgage');

        if (!isMortgageRelated) return;

        // Find Active Mortgage for this Account
        const mortgage = await db.query.mortgages.findFirst({
            where: and(
                eq(mortgages.accountId, tx.currencyBalance.account.id),
                eq(mortgages.status, 'active')
            ),
            with: {
                payments: true
            }
        });

        if (!mortgage) return;

        // Determine Month (YYYY-MM)
        const date = new Date(tx.date);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        // Check if already paid for this month
        const alreadyPaid = mortgage.payments.some(p => p.monthYear === monthYear);
        if (alreadyPaid) {
            console.log(`[Mortgage Auto-Link] Skipping ${monthYear} for mortgage ${mortgage.id} - already paid.`);
            return;
        }

        // Link it!
        await db.insert(mortgagePayments).values({
            mortgageId: mortgage.id,
            monthYear: monthYear,
            amount: tx.amount,
            paidAt: new Date(),
            note: `Auto-linked from transaction: ${tx.description}`
        });

        // Update Remaining Balance
        const newRemainingBalance = Math.max(0, Number(mortgage.remainingBalance) - Number(tx.amount));
        const newStatus = newRemainingBalance === 0 ? 'paid_off' : mortgage.status;

        await db.update(mortgages)
            .set({
                remainingBalance: newRemainingBalance.toString(),
                status: newStatus,
            })
            .where(eq(mortgages.id, mortgage.id));

        console.log(`[Mortgage Auto-Link] Successfully linked transaction ${tx.id} to mortgage ${mortgage.id} for month ${monthYear}`);

    } catch (error) {
        console.error('[Mortgage Auto-Link] Error processing transaction:', error);
    }
}
