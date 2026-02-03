import React, { useState } from 'react';
import { usePricing } from './PricingContext';
import { usePlans, CheckoutProvider, useCheckout, PaymentElement, usePaymentElement, PaymentElementProvider } from '@clerk/clerk-react/experimental';
import { useUser, ClerkLoaded } from '@clerk/clerk-react';
import { Check, Crown, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Fix Lucide icons for JSX (prevents React 18/19 type conflicts)
const Icons = {
    Crown: Crown as any,
    Loader: Loader2 as any,
    Check: Check as any,
    ArrowLeft: ArrowLeft as any
};

export function CustomPricing() {
    const { data: plans, isLoading } = usePlans();
    const { activePlanId } = usePricing();
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Icons.Loader className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (selectedPlanId) {
        return (
            <CheckoutFlow
                planId={selectedPlanId}
                onBack={() => setSelectedPlanId(null)}
            />
        );
    }

    return (
        <div className="h-full overflow-y-auto p-6 md:p-10 bg-background">
            <div className="text-center mb-12">
                <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
                    <Icons.Crown className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight mb-2 text-foreground">Upgrade to Pro</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                    Unlock unlimited potential with advanced features, AI insights, and priority support.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto pb-10">
                {plans?.map((plan: any) => {
                    const price = plan.fee;
                    const isFree = !price || price.amount === 0;
                    const isCurrent = activePlanId ? activePlanId === plan.id : isFree;

                    return (
                        <div
                            key={plan.id}
                            className={cn(
                                "flex flex-col p-6 rounded-2xl border bg-card transition-all duration-200 hover:shadow-xl",
                                isCurrent ? "border-primary shadow-lg shadow-primary/10" : "border-border hover:border-primary/50"
                            )}
                        >
                            <div className="mb-5">
                                <div className="flex justify-between items-start">
                                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                                    {isCurrent && (
                                        <div className="px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground font-bold uppercase tracking-wider">
                                            Active
                                        </div>
                                    )}
                                    {plan.freeTrialEnabled && !isCurrent && (
                                        <div className="px-2 py-0.5 rounded text-[10px] bg-primary/20 text-primary border border-primary/20 font-bold uppercase tracking-wider">
                                            Trial
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-3xl font-bold text-foreground">
                                        {isFree ? 'Free' : `${price.currencySymbol}${price.amountFormatted}`}
                                    </span>
                                    {!isFree && (
                                        <span className="text-muted-foreground text-sm">/month</span>
                                    )}
                                </div>
                                {plan.freeTrialEnabled && !isCurrent && (
                                    <p className="text-[10px] text-primary font-medium mt-1 italic">
                                        Includes {plan.freeTrialDays}-day free trial
                                    </p>
                                )}
                            </div>

                            <Button
                                className="w-full mb-6"
                                variant={isCurrent ? "outline" : "default"}
                                onClick={() => !isCurrent && setSelectedPlanId(plan.id)}
                                disabled={isCurrent}
                            >
                                {isCurrent ? 'Current Plan' : 'Subscribe'}
                            </Button>

                            <div className="space-y-3 flex-1">
                                {plan.features?.length > 0 ? (
                                    plan.features.map((feature: any) => (
                                        <div key={feature.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Icons.Check className="h-4 w-4 text-primary shrink-0" />
                                            <span>{feature.name}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">Unlock all features</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Added Features Section */}
            <div className="max-w-5xl mx-auto mt-16">
                <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-3xl p-8 md:p-12 border border-primary/20">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-bold text-foreground mb-3">Why Choose Premium?</h3>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Get the most out of your financial journey with our powerful premium features
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center p-6">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                                <span className="text-2xl font-bold text-primary">AI</span>
                            </div>
                            <h4 className="font-semibold text-foreground mb-2">Advanced AI Insights</h4>
                            <p className="text-sm text-muted-foreground">
                                Get personalized financial recommendations and market analysis powered by advanced AI
                            </p>
                        </div>
                        
                        <div className="text-center p-6">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                                <span className="text-2xl font-bold text-primary">∞</span>
                            </div>
                            <h4 className="font-semibold text-foreground mb-2">Unlimited Everything</h4>
                            <p className="text-sm text-muted-foreground">
                                No limits on banks, accounts, transactions, or AI questions - manage all your finances in one place
                            </p>
                        </div>
                        
                        <div className="text-center p-6">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                                <span className="text-2xl font-bold text-primary">⚡</span>
                            </div>
                            <h4 className="font-semibold text-foreground mb-2">Priority Support</h4>
                            <p className="text-sm text-muted-foreground">
                                24/7 support with faster response times and dedicated assistance from our financial experts
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 text-center">
                        <Button variant="outline" className="border-primary text-primary hover:bg-primary/10">
                            Learn More About Premium Features
                        </Button>
                    </div>
                </div>
            </div>

            {/* Added FAQ Section */}
            <div className="max-w-4xl mx-auto mt-16">
                <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-foreground mb-3">Frequently Asked Questions</h3>
                    <p className="text-muted-foreground">
                        Everything you need to know about our pricing plans
                    </p>
                </div>
                
                <div className="space-y-4">
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h4 className="font-semibold text-foreground mb-2">Can I switch plans at any time?</h4>
                        <p className="text-sm text-muted-foreground">
                            Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
                        </p>
                    </div>
                    
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h4 className="font-semibold text-foreground mb-2">Is there a free trial?</h4>
                        <p className="text-sm text-muted-foreground">
                            Yes, our Pro and Premium plans include a 14-day free trial. You can cancel anytime before the trial ends.
                        </p>
                    </div>
                    
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h4 className="font-semibold text-foreground mb-2">How secure is my financial data?</h4>
                        <p className="text-sm text-muted-foreground">
                            We use bank-level encryption to protect your data. Your information is never shared with third parties.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CheckoutFlow({ planId, onBack }: { planId: string, onBack: () => void }) {
    const ClerkLoadedComponent = ClerkLoaded as any;
    return (
        <ClerkLoadedComponent>
            <CheckoutProvider planId={planId} planPeriod="month">
                <div className="p-6 md:p-10 h-full overflow-y-auto bg-background min-h-[500px]">
                    <Button variant="ghost" onClick={onBack} className="mb-4 pl-0 hover:pl-2 transition-all text-foreground">
                        <Icons.ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Plans
                    </Button>
                    <CustomCheckout />
                </div>
            </CheckoutProvider>
        </ClerkLoadedComponent>
    );
}

function CustomCheckout() {
    const { checkout } = useCheckout();
    const { status } = checkout;

    if (status === 'needs_initialization') {
        return <CheckoutInitialization />;
    }

    return (
        <div className="max-w-2xl mx-auto pb-10">
            <CheckoutSummary />

            {/* Test Mode Helper */}
            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Test Mode Active</h3>
                </div>
                <p className="text-xs text-amber-600 mb-3">
                    Use any of the following Stripe test cards to complete your purchase:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-muted border border-amber-500/10 flex justify-between items-center group cursor-pointer" onClick={() => navigator.clipboard.writeText('4242424242424242')}>
                        <code className="text-[10px] text-foreground">4242 4242 4242 4242</code>
                        <span className="text-[8px] text-amber-500/40 group-hover:text-amber-500 uppercase">Copy</span>
                    </div>
                    <div className="p-2 rounded bg-muted border border-amber-500/10 flex justify-between items-center group cursor-pointer" onClick={() => navigator.clipboard.writeText('4000000000000002')}>
                        <code className="text-[10px] text-foreground">4000 0000 0000 0002</code>
                        <span className="text-[8px] text-amber-500/40 group-hover:text-amber-500 uppercase">Copy</span>
                    </div>
                </div>
                <p className="text-[10px] text-amber-600 mt-2 italic">
                    * Any CVC, and any future expiry date will work.
                </p>
            </div>

            <div className="mt-8 border rounded-xl p-6 bg-card shadow-lg">
                <PaymentElementProvider checkout={checkout}>
                    <PaymentSection />
                </PaymentElementProvider>
            </div>
        </div>
    );
}

function CheckoutInitialization() {
    const { checkout } = useCheckout();
    const { start, status, fetchStatus } = checkout;

    React.useEffect(() => {
        if (status === 'needs_initialization' && fetchStatus !== 'fetching') {
            start();
        }
    }, [status, fetchStatus, start]);

    if (status !== 'needs_initialization') {
        return null;
    }

    return (
        <div className="flex flex-col items-center justify-center py-20">
            <Icons.Loader className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Initializing checkout...</p>
        </div>
    );
}

function PaymentSection() {
    const { checkout } = useCheckout();
    const { isConfirming, confirm, finalize, error } = checkout;

    const { isFormReady, submit } = usePaymentElement();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormReady || isProcessing) return;
        setIsProcessing(true);

        try {
            const { data, error: submitError } = await submit();
            if (submitError) return;

            await confirm(data);
            await finalize({
                // Reload window to reflect subscription changes or redirect
                navigate: () => window.location.reload(),
            });
        } catch (error) {
            console.error('Payment failed:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement />

            {error && <div className="text-red-500 text-sm">{error.message}</div>}

            <Button
                type="submit"
                className="w-full"
                disabled={!isFormReady || isProcessing || isConfirming}
            >
                {isProcessing || isConfirming ? (
                    <>
                        <Icons.Loader className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                    </>
                ) : 'Complete Purchase'}
            </Button>
        </form>
    );
}

function CheckoutSummary() {
    const { checkout } = useCheckout();
    const { plan, totals } = checkout;

    if (!plan) {
        return null;
    }

    const freeTrialDays = (plan as any).freeTrialDays;
    const freeTrialEnabled = (plan as any).freeTrialEnabled;

    return (
        <div className="bg-muted/30 p-6 rounded-xl mb-6 border border-primary/20">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Order Summary</h2>
            <div className="space-y-4">
                <div className="flex justify-between items-center text-sm text-foreground">
                    <div className="flex flex-col">
                        <span className="font-medium">{plan.name}</span>
                        {freeTrialEnabled && (
                            <span className="text-primary text-xs font-medium">
                                {freeTrialDays}-day free trial included
                            </span>
                        )}
                    </div>
                    <span className="font-medium">
                        {totals?.totalDueNow?.currencySymbol} {totals?.totalDueNow?.amountFormatted}
                    </span>
                </div>

                {freeTrialEnabled && (
                    <div className="pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                        <span>Due after {freeTrialDays} days</span>
                        <span>{plan.fee?.currencySymbol}{plan.fee?.amountFormatted}/month</span>
                    </div>
                )}
            </div>
        </div>
    );
}
