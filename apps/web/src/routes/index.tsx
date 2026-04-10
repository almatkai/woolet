import React from 'react';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate } from '@tanstack/react-router';
import {
    Pencil,
    Plus,
    Save,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
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
                <PageHeader title="Dashboard" variant="two-with-text">
                    {isEditing ? (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setIsEditing(false);
                                    dashboardGridRef.current?.handleCancel();
                                }}
                                className="gap-2 flex-1 sm:flex-none"
                            >
                                <X className="h-4 w-4" />
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setIsEditing(false);
                                    dashboardGridRef.current?.handleSave();
                                }}
                                className="gap-2 flex-1 sm:flex-none"
                            >
                                <Save className="h-4 w-4" />
                                Save Layout
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-2 flex-1 sm:flex-none">
                                <Pencil className="h-4 w-4" />
                                Edit Layout
                            </Button>
                            <UniversalAddSheet
                                trigger={
                                    <Button size="sm" className="gap-2 flex-1 sm:flex-none">
                                        <Plus className="h-4 w-4" />
                                        Add
                                    </Button>
                                }
                            />
                        </>
                    )}
                </PageHeader>

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
