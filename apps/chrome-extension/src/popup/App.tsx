import { useState, useEffect } from 'react';
import { CreditCard, Calendar, RefreshCcw, Check, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SubscriptionData {
    name?: string;
    amount?: string;
    currency?: string;
    frequency?: string;
    renewalText?: string;
    startDate?: string;
    last4Digits?: string;
    cardBrand?: string;
    fullPriceString?: string;
}

function App() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<SubscriptionData | null>(null);
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

    useEffect(() => {
        // Get current tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
            const tabId = tabs[0]?.id;
            if (tabId) {
                // Check storage for detected data
                chrome.storage.local.get([`detected_sub_${tabId}`], (result: { [key: string]: SubscriptionData }) => {
                    const detected = result[`detected_sub_${tabId}`];
                    console.log('Detected from storage:', detected);
                    if (detected) {
                        setData(detected);
                    }
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        });
    }, []);

    const handleSave = async () => {
        setStatus('saving');
        // Here we would call the API
        // For now simulate success after delay
        setTimeout(() => {
            setStatus('success');
        }, 1500);
    };

    if (loading) {
        return (
            <div className="w-[350px] h-[400px] flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="w-[350px] h-auto min-h-[300px] p-6 flex flex-col items-center justify-center bg-background text-center">
                <div className="bg-muted p-4 rounded-full mb-4">
                    <RefreshCcw className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold mb-2">No Subscription Found</h2>
                <p className="text-muted-foreground text-sm mb-6">
                    We couldn't detect subscription details on this page. Navigate to a billing page and try again.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/90 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="w-[350px] bg-background text-foreground font-sans border border-border">
            <div className="p-4 border-b border-border bg-card">
                <h1 className="text-lg font-bold flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">W</span>
                    Woolet
                </h1>
            </div>

            <div className="p-4 space-y-4">
                {status === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in duration-300">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-3">
                            <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="font-semibold text-lg">Subscription Added!</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            We've added this to your dashboard.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Detected Subscription</h3>

                            <div className="space-y-1">
                                <div className="text-xl font-bold">{data.name || 'Unknown Subscription'}</div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-lg font-semibold text-primary">
                                        {data.amount || '---'}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {data.frequency || ''}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-border/50 space-y-2">
                                {data.startDate && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span>Renews: <span className="font-medium">{data.startDate}</span></span>
                                    </div>
                                )}
                                {data.last4Digits ? (
                                    <div className="flex items-center gap-2 text-sm">
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                        <span>Card: <span className="font-medium">•••• {data.last4Digits}</span></span>
                                        {data.cardBrand && (
                                            <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">{data.cardBrand}</span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm text-orange-500">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>No card detected</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium">Link to Account</label>
                            <select className="w-full p-2 rounded-md border border-input bg-background text-sm">
                                {/* TODO: Populate with user accounts */}
                                <option>Checking (•••• 4242)</option>
                                <option>Chase Sapphire (•••• 1234)</option>
                                {data.last4Digits && <option selected>Matched: Visa (•••• {data.last4Digits})</option>}
                                <option value="new">+ Add new account</option>
                            </select>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={status === 'saving'}
                            className={cn(
                                "w-full py-2.5 rounded-md font-medium text-sm transition-all shadow-sm",
                                "bg-primary text-primary-foreground hover:bg-primary/90",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                        >
                            {status === 'saving' ? 'Saving...' : 'Add Subscription'}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

export default App
