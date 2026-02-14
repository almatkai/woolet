import { router } from '../lib/trpc';
import { userRouter } from './user';
import { bankRouter } from './bank';
import { accountRouter } from './account';
import { currencyRouter } from './currency';
import { categoryRouter } from './category';
import { transactionRouter } from './transaction';
import { debtRouter } from './debt';
import { creditRouter } from './credit';
import { mortgageRouter } from './mortgage';
import { depositRouter } from './deposit';
import { dashboardRouter } from './dashboard';
import { investingRouter } from './investing';
import { subscriptionRouter } from './subscription';
import { newsRouter } from './news';
import { aiRouter } from './ai';
import { settingsRouter } from './settings';
import { splitBillRouter } from './split-bill';
import { notificationRouter } from './notification';
import { pushSubscriptionRouter } from './push-subscription';

export const appRouter = router({
    user: userRouter,
    bank: bankRouter,
    account: accountRouter,
    currency: currencyRouter,
    category: categoryRouter,
    transaction: transactionRouter,
    debt: debtRouter,
    credit: creditRouter,
    mortgage: mortgageRouter,
    deposit: depositRouter,
    dashboard: dashboardRouter,
    investing: investingRouter,
    subscription: subscriptionRouter,
    news: newsRouter,
    ai: aiRouter,
    settings: settingsRouter,
    splitBill: splitBillRouter,
    notification: notificationRouter,
    pushSubscription: pushSubscriptionRouter,
});

export type AppRouter = typeof appRouter;

