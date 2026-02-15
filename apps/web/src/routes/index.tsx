import React from 'react';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate } from '@tanstack/react-router';
import {
    Pencil,
    Save,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { UniversalAddSheet } from '@/components/UniversalAddSheet';
import { SpendingChart } from '@/components/SpendingChart';
import { CategoryPieChart } from '@/components/CategoryPieChart';
import { DashboardGrid } from '@/components/DashboardGrid';
import { TotalBalanceWidget } from '@/components/dashboard/TotalBalanceWidget';
import { MonthlyIncomeWidget } from '@/components/dashboard/MonthlyIncomeWidget';
import { MonthlyExpensesWidget } from '@/components/dashboard/MonthlyExpensesWidget';
import { MortgageWidget } from '@/components/dashboard/MortgageWidget';
import { DebtsWidget } from '@/components/dashboard/DebtsWidget';
import { CreditWidget } from '@/components/dashboard/CreditWidget';
import { DepositWidget } from '@/components/dashboard/DepositWidget';
import { RecentTransactionsWidget } from '@/components/dashboard/RecentTransactionsWidget';
import { SubscriptionsWidget } from '@/components/dashboard/SubscriptionsWidget';
import { CurrencyExchangeWidget } from '@/components/dashboard/CurrencyExchangeWidget';
import { InvestmentPortfolioWidget } from '@/components/dashboard/InvestmentPortfolioWidget';
import { InvestmentPerformanceWidget } from '@/components/dashboard/InvestmentPerformanceWidget';
import { AssetAllocationWidget } from '@/components/dashboard/AssetAllocationWidget';
import { SplitBillWidget } from '@/components/dashboard/SplitBillWidget';
import { SpendingAnomalyCard } from '@/components/dashboard/SpendingAnomalyCard';
import { PricingCtaBanner } from '@/components/PricingCtaBanner';

export function Dashboard() {
    const [isEditing, setIsEditing] = React.useState(false);
    const dashboardGridRef = React.useRef<{ handleSave: () => void; handleCancel: () => void }>(null);

    return (
        <div className="space-y-6">
            <SignedOut>
                <Navigate to="/login" />
            </SignedOut>

            <SignedIn>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    </div>
                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setIsEditing(false);
                                        dashboardGridRef.current?.handleCancel();
                                    }}
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setIsEditing(false);
                                        dashboardGridRef.current?.handleSave();
                                    }}
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Layout
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit Layout
                            </Button>
                        )}
                        <UniversalAddSheet />
                    </div>
                </div>

                <PricingCtaBanner variant="inline" className="mb-4" />

                <SpendingAnomalyCard />

                {/* KPI Cards */}
                <DashboardGrid
                    isEditing={isEditing}
                    onEditingChange={setIsEditing}
                    ref={dashboardGridRef}
                >
                    {/* Total Balance Card */}
                    <TotalBalanceWidget key="totalBalance" />

                    {/* Monthly Income Card */}
                    <MonthlyIncomeWidget key="monthlyIncome" />

                    {/* Monthly Expenses Card */}
                    <MonthlyExpensesWidget key="monthlyExpenses" />

                    <SpendingChart key="spendingChart" />

                    <CategoryPieChart key="categoryChart" />

                    <RecentTransactionsWidget key="recentTransactions" />

                    <DebtsWidget key="debts" />

                    <CreditWidget key="credits" />

                    <DepositWidget key="deposits" />

                    <MortgageWidget key="mortgages" />

                    <SubscriptionsWidget key="subscriptions" />

                    {/* Currency & Investment Widgets */}
                    <CurrencyExchangeWidget key="currencyExchange" />

                    <InvestmentPortfolioWidget key="investmentPortfolio" />

                    <InvestmentPerformanceWidget key="investmentPerformance" />

                    <AssetAllocationWidget key="assetAllocation" />

                    <SplitBillWidget key="splitBills" />
                </DashboardGrid>
            </SignedIn>
        </div>
    );
}
