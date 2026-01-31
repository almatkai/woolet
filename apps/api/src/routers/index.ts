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
import { dataRouter } from './data';
import { subscriptionRouter } from './subscription';
import { newsRouter } from './news';
import { aiRouter } from './ai';
import { settingsRouter } from './settings';
import { splitBillRouter } from './split-bill';

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
    data: dataRouter,
    subscription: subscriptionRouter,
    news: newsRouter,
    ai: aiRouter,
    settings: settingsRouter,
    splitBill: splitBillRouter,
});

export type AppRouter = typeof appRouter;

