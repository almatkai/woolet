
import { useTheme } from '@/components/theme-provider';
import { trpc } from '@/lib/trpc';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import {
    Moon,
    MoonStar,
    Sun,
    Eclipse,
    FlaskConical,
    Trash2,
    AlertTriangle,
    Calendar,
    DollarSign,
    Download,
    Upload,
    FileJson,
    Loader2,
    ListChecks
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PushNotificationSettings, usePushNotifications } from '@/hooks/usePushNotifications';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bell, BellRing } from 'lucide-react';
import { SignOutButton } from '@clerk/clerk-react';
import { CurrencySelector } from '@/components/ui/currency-selector';

export function SettingsPage() {
    const { theme, setTheme } = useTheme();
    trpc.user.me.useQuery();
    const { data: settings } = trpc.settings.getUserSettings.useQuery();
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [pushSettingsOpen, setPushSettingsOpen] = useState(false);

    const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

    const utils = trpc.useUtils();

    const updateSettings = trpc.settings.updateUserSettings.useMutation({
        onSuccess: () => {
            toast.success('Settings updated');
            utils.settings.getUserSettings.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update settings');
        }
    });

    const deleteDataMutation = trpc.user.deleteAllData.useMutation({
        onSuccess: () => {
            toast.success('All data deleted successfully');
            utils.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to delete data');
        }
    });

    const importDataMutation = trpc.user.importData.useMutation({
        onSuccess: () => {
            toast.success('Data imported successfully');
            utils.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to import data. Please ensure the file is valid.');
        }
    });

    const globalStatusLogic = settings?.paymentStatusLogic || 'monthly';
    const globalStatusPeriod = settings?.paymentStatusPeriod || '15';
    const creditStatusLogic = settings?.creditStatusLogic ?? 'global';
    const creditStatusPeriod = settings?.creditStatusPeriod ?? 'global';
    const mortgageStatusLogic = settings?.mortgageStatusLogic ?? 'global';
    const mortgageStatusPeriod = settings?.mortgageStatusPeriod ?? 'global';
    const subscriptionStatusLogic = settings?.subscriptionStatusLogic ?? 'global';
    const subscriptionStatusPeriod = settings?.subscriptionStatusPeriod ?? 'global';

    const exportData = async () => {
        setIsExporting(true);
        try {
            const data = await utils.user.exportAllData.fetch();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `woolet-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Data exported successfully');
        } catch (error: unknown) {
            toast.error('Failed to export data');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await importDataMutation.mutateAsync(data);
        } catch {
            // Error handled by mutation onError
        } finally {
            setIsImporting(false);
            e.target.value = '';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-1 mb-8">
                <h1 className="text-4xl font-medium tracking-tight text-foreground">General Settings</h1>
                <p className="text-muted-foreground text-lg">Manage your application preferences and appearance.</p>
            </div>

            <PushNotificationSettings open={pushSettingsOpen} onOpenChange={setPushSettingsOpen} />

            {/* Theme Settings */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Eclipse className="size-5 text-primary" />
                        Appearance
                    </CardTitle>
                    <CardDescription>Customize the look and feel of the application</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-wrap gap-4">
                        <button
                            onClick={() => setTheme('light')}
                            className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${theme === 'light'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border/50 hover:border-border text-muted-foreground'
                                }`}
                        >
                            <Sun className="size-4" />
                            <span className="font-medium">Light</span>
                        </button>
                        <button
                            onClick={() => setTheme('dark')}
                            className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${theme === 'dark'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border/50 hover:border-border text-muted-foreground'
                                }`}
                        >
                            <Moon className="size-4" />
                            <span className="font-medium">Dark</span>
                        </button>
                        <button
                            onClick={() => setTheme('super-dark')}
                            className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${theme === 'super-dark'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border/50 hover:border-border text-muted-foreground'
                                }`}
                        >
                            <MoonStar className="size-4" />
                            <span className="font-medium">Super Dark</span>
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Profile Preferences */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <FlaskConical className="size-5 text-primary" />
                        Profile
                    </CardTitle>
                    <CardDescription>Update your profile settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-background/50 border border-border/50">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="size-4 text-orange-500" />
                                <Label className="text-base font-semibold">Test Mode</Label>
                            </div>
                            <p className="text-sm text-muted-foreground">Enable lower limits for testing features with minimal data</p>
                        </div>
                        <Switch />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-background/50 border border-border/50">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Calendar className="size-4 text-blue-500" />
                                <Label className="text-base font-semibold">Week Starts On</Label>
                            </div>
                            <p className="text-sm text-muted-foreground">Choose which day marks the beginning of a new week</p>
                        </div>
                        <Select defaultValue="monday">
                            <SelectTrigger className="w-[180px] bg-background border-border">
                                <SelectValue placeholder="Select day" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="monday">Monday</SelectItem>
                                <SelectItem value="sunday">Sunday</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-background/50 border border-border/50">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <DollarSign className="size-4 text-emerald-500" />
                                <Label className="text-base font-semibold">Default Currency</Label>
                            </div>
                            <p className="text-sm text-muted-foreground">Currency exchange rates will be shown relative to this currency</p>
                        </div>
                        <CurrencySelector
                            value={settings?.defaultCurrency || 'USD'}
                            onValueChange={(val: string) => updateSettings.mutate({ defaultCurrency: val })}
                        />
                    </div>

                    <div className="flex flex-col gap-4 p-4 rounded-2xl bg-background/50 border border-border/50">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <ListChecks className="size-4 text-sky-500" />
                                    <Label className="text-base font-semibold">Payment Status Rules</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">How paid/unpaid is calculated</p>
                            </div>
                            <Select
                                value={globalStatusLogic}
                                onValueChange={(val: 'monthly' | 'period') => updateSettings.mutate({ paymentStatusLogic: val })}
                            >
                                <SelectTrigger className="w-[180px] bg-background border-border">
                                    <SelectValue placeholder="Select logic" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monthly">Each Month (Reset 1st)</SelectItem>
                                    <SelectItem value="period">Time Period (Threshold)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {globalStatusLogic === 'period' && (
                            <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                <div className="space-y-1">
                                    <Label className="text-sm font-medium">Due Warning Threshold</Label>
                                    <p className="text-xs text-muted-foreground">Show "Unpaid" if due date is within these many days</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={globalStatusPeriod}
                                        onValueChange={(val: string) => updateSettings.mutate({ paymentStatusPeriod: val })}
                                    >
                                        <SelectTrigger className="w-[100px] bg-background border-border">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="3">3 Days</SelectItem>
                                            <SelectItem value="7">7 Days</SelectItem>
                                            <SelectItem value="10">10 Days</SelectItem>
                                            <SelectItem value="14">14 Days</SelectItem>
                                            <SelectItem value="15">15 Days</SelectItem>
                                            <SelectItem value="21">21 Days</SelectItem>
                                            <SelectItem value="30">30 Days</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-border/50">
                            <div className="text-sm font-semibold">Per-type overrides</div>
                            <div className="mt-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-medium">Credits</Label>
                                        <p className="text-xs text-muted-foreground">Use global or override</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Select
                                            value={creditStatusLogic}
                                            onValueChange={(val: 'global' | 'monthly' | 'period') => updateSettings.mutate({ creditStatusLogic: val === 'global' ? null : val })}
                                        >
                                            <SelectTrigger className="w-[180px] bg-background border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="global">Use Global</SelectItem>
                                                <SelectItem value="monthly">Each Month (Reset 1st)</SelectItem>
                                                <SelectItem value="period">Time Period (Threshold)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={creditStatusLogic === 'period' ? creditStatusPeriod : 'global'}
                                            onValueChange={(val: string) => updateSettings.mutate({ creditStatusPeriod: val === 'global' ? null : val })}
                                            disabled={creditStatusLogic !== 'period'}
                                        >
                                            <SelectTrigger className="w-[100px] bg-background border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="global">Use Global</SelectItem>
                                                <SelectItem value="3">3 Days</SelectItem>
                                                <SelectItem value="7">7 Days</SelectItem>
                                                <SelectItem value="10">10 Days</SelectItem>
                                                <SelectItem value="14">14 Days</SelectItem>
                                                <SelectItem value="15">15 Days</SelectItem>
                                                <SelectItem value="21">21 Days</SelectItem>
                                                <SelectItem value="30">30 Days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-medium">Mortgages</Label>
                                        <p className="text-xs text-muted-foreground">Use global or override</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Select
                                            value={mortgageStatusLogic}
                                            onValueChange={(val: 'global' | 'monthly' | 'period') => updateSettings.mutate({ mortgageStatusLogic: val === 'global' ? null : val })}
                                        >
                                            <SelectTrigger className="w-[180px] bg-background border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="global">Use Global</SelectItem>
                                                <SelectItem value="monthly">Each Month (Reset 1st)</SelectItem>
                                                <SelectItem value="period">Time Period (Threshold)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={mortgageStatusLogic === 'period' ? mortgageStatusPeriod : 'global'}
                                            onValueChange={(val: string) => updateSettings.mutate({ mortgageStatusPeriod: val === 'global' ? null : val })}
                                            disabled={mortgageStatusLogic !== 'period'}
                                        >
                                            <SelectTrigger className="w-[100px] bg-background border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="global">Use Global</SelectItem>
                                                <SelectItem value="3">3 Days</SelectItem>
                                                <SelectItem value="7">7 Days</SelectItem>
                                                <SelectItem value="10">10 Days</SelectItem>
                                                <SelectItem value="14">14 Days</SelectItem>
                                                <SelectItem value="15">15 Days</SelectItem>
                                                <SelectItem value="21">21 Days</SelectItem>
                                                <SelectItem value="30">30 Days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-medium">Subscriptions</Label>
                                        <p className="text-xs text-muted-foreground">Use global or override</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Select
                                            value={subscriptionStatusLogic}
                                            onValueChange={(val: 'global' | 'monthly' | 'period') => updateSettings.mutate({ subscriptionStatusLogic: val === 'global' ? null : val })}
                                        >
                                            <SelectTrigger className="w-[180px] bg-background border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="global">Use Global</SelectItem>
                                                <SelectItem value="monthly">Each Month (Reset 1st)</SelectItem>
                                                <SelectItem value="period">Time Period (Threshold)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={subscriptionStatusLogic === 'period' ? subscriptionStatusPeriod : 'global'}
                                            onValueChange={(val: string) => updateSettings.mutate({ subscriptionStatusPeriod: val === 'global' ? null : val })}
                                            disabled={subscriptionStatusLogic !== 'period'}
                                        >
                                            <SelectTrigger className="w-[100px] bg-background border-border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="global">Use Global</SelectItem>
                                                <SelectItem value="3">3 Days</SelectItem>
                                                <SelectItem value="7">7 Days</SelectItem>
                                                <SelectItem value="10">10 Days</SelectItem>
                                                <SelectItem value="14">14 Days</SelectItem>
                                                <SelectItem value="15">15 Days</SelectItem>
                                                <SelectItem value="21">21 Days</SelectItem>
                                                <SelectItem value="30">30 Days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Push Notifications */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Bell className="size-5 text-primary" />
                        Push Notifications
                    </CardTitle>
                    <CardDescription>Receive browser notifications for subscription reminders and payment alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-border/50">
                        <div className="flex items-center gap-3">
                            {isSubscribed ? (
                                <BellRing className="size-5 text-green-500" />
                            ) : (
                                <Bell className="size-5 text-muted-foreground" />
                            )}
                            <div>
                                <p className="font-medium">
                                    {isSubscribed ? 'Notifications Enabled' : 'Browser Notifications'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {isSubscribed
                                        ? 'You will receive push notifications'
                                        : 'Enable to receive notifications outside the app'}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant={isSubscribed ? 'outline' : 'default'}
                            onClick={() => {
                                if (isSubscribed) {
                                    unsubscribe().catch(console.error);
                                } else {
                                    subscribe().catch(console.error);
                                }
                            }}
                            disabled={!isSupported}
                        >
                            {isSubscribed ? 'Disable' : 'Enable'}
                        </Button>
                    </div>

                    {!isSupported && (
                        <p className="text-sm text-muted-foreground">
                            Push notifications are not supported in your browser.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Data Management */}
            <Card className="bg-card/30 backdrop-blur-sm border-border/50 overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Download className="size-5 text-primary" />
                        Export Data
                    </CardTitle>
                    <CardDescription>Download a backup of all your financial data.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={exportData}
                        disabled={isExporting}
                        className="rounded-xl px-6"
                    >
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Download JSON Backup
                    </Button>
                </CardContent>

                <div className="border-t border-border/50">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Upload className="size-5 text-primary" />
                            Import Data
                        </CardTitle>
                        <CardDescription>
                            Restore data from a backup file.
                            <span className="text-destructive font-bold ml-1">Warning: This will completely replace all your current data!</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="import-file" className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2">Backup File</Label>
                            <div className="relative group">
                                <input
                                    id="import-file"
                                    type="file"
                                    accept=".json"
                                    onChange={handleImport}
                                    disabled={isImporting}
                                    className="hidden"
                                />
                                <Button
                                    variant="outline"
                                    disabled={isImporting}
                                    onClick={() => document.getElementById('import-file')?.click()}
                                    className="w-full h-24 border-dashed border-2 bg-background/50 hover:bg-background hover:border-primary transition-all rounded-2xl flex flex-col gap-2"
                                >
                                    {isImporting ? (
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    ) : (
                                        <>
                                            <FileJson className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                                            <span className="text-sm font-medium">Click to select backup file</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </div>

                <div className="border-t border-border/50 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2 text-destructive">
                            <AlertTriangle className="size-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription>Irreversible actions that will permanently delete your data.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="rounded-xl px-6">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete All My Data
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
                                        <AlertTriangle className="text-destructive size-6" />
                                        Are you absolutely sure?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-muted-foreground text-lg">
                                        This action cannot be undone. This will permanently delete your
                                        entire financial history including accounts, transactions, and categories.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="gap-2">
                                    <AlertDialogCancel className="bg-background border-border rounded-xl">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => deleteDataMutation.mutate()}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl px-6"
                                    >
                                        Yes, delete everything
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </div>
            </Card>
            <div className="pt-8 border-t border-border/50 flex justify-end">
                <SignOutButton>
                    <Button>
                        <LogOut className="size-4" />
                        Sign out
                    </Button>
                </SignOutButton>
            </div>
        </div>
    );
}

