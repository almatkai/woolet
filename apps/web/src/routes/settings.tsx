import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/components/theme-provider';
import { DeleteConfirm } from '@/components/DeleteConfirm';
import {
    Download,
    Upload,
    AlertTriangle,
    FileJson,
    Loader2,
    Trash2,
    Sun,
    Moon,
    Eclipse,
    FlaskConical,
    Calendar,
    DollarSign
} from 'lucide-react';

// Local type definitions for user preferences
interface UserPreferences {
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    spendingWidget?: {
        categoryIds?: string[];
    };
    recentTransactionsWidget?: {
        excludedCategories?: string[];
        period?: string;
    };
}

type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const WEEK_START_OPTIONS = [
    { value: 0 as WeekStartDay, label: 'Sunday' },
    { value: 1 as WeekStartDay, label: 'Monday' },
    { value: 2 as WeekStartDay, label: 'Tuesday' },
    { value: 3 as WeekStartDay, label: 'Wednesday' },
    { value: 4 as WeekStartDay, label: 'Thursday' },
    { value: 5 as WeekStartDay, label: 'Friday' },
    { value: 6 as WeekStartDay, label: 'Saturday' },
] as const;

const DEFAULT_WEEK_STARTS_ON: WeekStartDay = 1; // Monday
import { toast } from 'sonner';
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

export function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const { data: user } = trpc.user.me.useQuery();
    const { data: limitsData } = trpc.user.getLimits.useQuery();
    const { data: userSettings } = trpc.settings.getUserSettings.useQuery();
    const utils = trpc.useUtils();
    const navigate = useNavigate();

    // Export/Import State
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importData, setImportData] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mutations
    const updateUserMutation = trpc.user.update.useMutation({
        onSuccess: () => {
            utils.user.me.invalidate();
            utils.user.getLimits.invalidate();
            toast.success('Settings updated successfully');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update settings');
        },
    });

    const updateSettingsMutation = trpc.settings.updateUserSettings.useMutation({
        onSuccess: () => {
            utils.settings.getUserSettings.invalidate();
            toast.success('Currency settings updated successfully');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update currency settings');
        },
    });

    const deleteAllDataMutation = trpc.user.deleteAllData.useMutation({
        onSuccess: () => {
            utils.invalidate();
            toast.success('All data has been deleted successfully');
            navigate({ to: '/' });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to delete data');
        },
    });

    const importMutation = trpc.data.importData.useMutation({
        onSuccess: () => {
            toast.success('Data imported successfully');
            setImportFile(null);
            setImportData(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            utils.invalidate();
        },
        onError: (error: any) => {
            toast.error(`Import failed: ${error.message}`);
        }
    });

    // Handlers
    const handleTestModeToggle = (checked: boolean) => {
        updateUserMutation.mutate({ testMode: checked });
    };

    const handleWeekStartDayChange = (value: string) => {
        const weekStartsOn = parseInt(value, 10) as WeekStartDay;
        const currentPrefs = (user?.preferences as UserPreferences) || {};
        
        console.log('Settings - Changing week start day:', { 
            value, 
            weekStartsOn, 
            currentPrefs,
            newPrefs: { ...currentPrefs, weekStartsOn }
        });
        
        updateUserMutation.mutate({ 
            preferences: {
                ...currentPrefs,
                weekStartsOn
            }
        });
    };

    const handleDefaultCurrencyChange = (value: string) => {
        updateSettingsMutation.mutate({ defaultCurrency: value });
    };

    const handleDeleteAllData = () => {
        deleteAllDataMutation.mutate();
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const result = await utils.client.data.exportData.query();
            const jsonString = JSON.stringify(result, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `woolet -export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            toast.success('Export downloaded successfully');
        } catch (error) {
            console.error(error);
            toast.error('Failed to export data');
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportFile(file);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                setImportData(json.data);
            } catch (err) {
                toast.error('Invalid JSON file');
                setImportFile(null);
            }
        };
        reader.readAsText(file);
    };

    const handleImport = () => {
        if (!importData) return;
        setIsImporting(true);
        importMutation.mutate({ data: importData }, {
            onSettled: () => setIsImporting(false)
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground">Manage your preferences</p>
            </div>

            {/* Theme Settings */}
            <Card>
                <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>Customize the look and feel of the application</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Theme</Label>
                            <div className="flex flex-wrap gap-4">
                                <Button
                                    variant={theme === 'light' ? 'default' : 'outline'}
                                    onClick={() => setTheme('light')}
                                    className="w-32 justify-start gap-2"
                                >
                                    <Sun className="h-4 w-4" />
                                    Light
                                </Button>
                                <Button
                                    variant={theme === 'dark' ? 'default' : 'outline'}
                                    onClick={() => setTheme('dark')}
                                    className="w-32 justify-start gap-2"
                                >
                                    <Moon className="h-4 w-4" />
                                    Dark
                                </Button>
                                <Button
                                    variant={theme === 'super-dark' ? 'default' : 'outline'}
                                    onClick={() => setTheme('super-dark')}
                                    className="w-32 justify-start gap-2"
                                >
                                    <Eclipse className="h-4 w-4" />
                                    Super Dark
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Profile / Test Mode */}
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Update your profile settings</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {/* Test Mode Toggle */}
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <FlaskConical className="h-5 w-5 text-orange-500" />
                                    <Label className="text-base font-medium">Test Mode</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Enable lower limits for testing features with minimal data
                                </p>
                            </div>
                            <Switch
                                checked={user?.testMode ?? false}
                                onCheckedChange={handleTestModeToggle}
                                disabled={updateUserMutation.isLoading}
                            />
                        </div>

                        {/* Week Start Day Setting */}
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-5 w-5 text-blue-500" />
                                    <Label className="text-base font-medium">Week Starts On</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Choose which day marks the beginning of a new week
                                </p>
                            </div>
                            <Select
                                value={(() => {
                                    const currentValue = String((user?.preferences as UserPreferences)?.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON);
                                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                    const numericValue = Number(currentValue);
                                    return currentValue;
                                })()}
                                onValueChange={handleWeekStartDayChange}
                                disabled={updateUserMutation.isLoading}
                            >
                                <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WEEK_START_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={String(option.value)}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Default Currency Setting */}
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-green-500" />
                                    <Label className="text-base font-medium">Default Currency</Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Currency exchange rates will be shown relative to this currency
                                </p>
                            </div>
                            <Select
                                value={userSettings?.defaultCurrency || 'USD'}
                                onValueChange={handleDefaultCurrencyChange}
                                disabled={updateSettingsMutation.isLoading}
                            >
                                <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USD">🇺🇸 USD</SelectItem>
                                    <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
                                    <SelectItem value="GBP">🇬🇧 GBP</SelectItem>
                                    <SelectItem value="JPY">🇯🇵 JPY</SelectItem>
                                    <SelectItem value="CHF">🇨🇭 CHF</SelectItem>
                                    <SelectItem value="CAD">🇨🇦 CAD</SelectItem>
                                    <SelectItem value="AUD">🇦🇺 AUD</SelectItem>
                                    <SelectItem value="CNY">🇨🇳 CNY</SelectItem>
                                    <SelectItem value="INR">🇮🇳 INR</SelectItem>
                                    <SelectItem value="KZT">🇰🇿 KZT</SelectItem>
                                    <SelectItem value="RUB">🇷🇺 RUB</SelectItem>
                                    <SelectItem value="HKD">🇭🇰 HKD</SelectItem>
                                    <SelectItem value="SGD">🇸🇬 SGD</SelectItem>
                                    <SelectItem value="KRW">🇰🇷 KRW</SelectItem>
                                    <SelectItem value="MXN">🇲🇽 MXN</SelectItem>
                                    <SelectItem value="BRL">🇧🇷 BRL</SelectItem>
                                    <SelectItem value="SEK">🇸🇪 SEK</SelectItem>
                                    <SelectItem value="NOK">🇳🇴 NOK</SelectItem>
                                    <SelectItem value="DKK">🇩🇰 DKK</SelectItem>
                                    <SelectItem value="TRY">🇹🇷 TRY</SelectItem>
                                    <SelectItem value="ZAR">🇿🇦 ZAR</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Test Mode Limits Display */}
                        {limitsData?.testMode && (
                            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    <span className="text-sm font-medium text-orange-500">Test Mode Active</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                                    <div className="p-2 bg-background rounded">
                                        <div className="text-muted-foreground">Transactions</div>
                                        <div className="font-medium">{limitsData.limits.transactions}</div>
                                    </div>
                                    <div className="p-2 bg-background rounded">
                                        <div className="text-muted-foreground">Accounts</div>
                                        <div className="font-medium">{limitsData.limits.accounts}</div>
                                    </div>
                                    <div className="p-2 bg-background rounded">
                                        <div className="text-muted-foreground">Debts</div>
                                        <div className="font-medium">{limitsData.limits.debts}</div>
                                    </div>
                                    <div className="p-2 bg-background rounded">
                                        <div className="text-muted-foreground">Deposits</div>
                                        <div className="font-medium">{limitsData.limits.deposits}</div>
                                    </div>
                                    <div className="p-2 bg-background rounded">
                                        <div className="text-muted-foreground">Mortgages</div>
                                        <div className="font-medium">{limitsData.limits.mortgages}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Data Management (Export/Import) */}
            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5" />
                            Export Data
                        </CardTitle>
                        <CardDescription>
                            Download a backup of all your financial data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={handleExport} disabled={isExporting}>
                            {isExporting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                'Download JSON Backup'
                            )}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="border-red-200 dark:border-red-900/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <Upload className="h-5 w-5" />
                            Import Data
                        </CardTitle>
                        <CardDescription>
                            Restore data from a backup file. 
                            <span className="font-bold text-red-500 block mt-1">
                                Warning: This will completely replace all your current data!
                            </span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="import-file">Backup File</Label>
                            <Input 
                                id="import-file" 
                                type="file" 
                                accept=".json"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                        </div>

                        {importFile && importData && (
                            <div className="rounded-md bg-muted p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <FileJson className="h-4 w-4" />
                                    {importFile.name}
                                </div>
                                <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                                    <div>Banks: {importData.banks?.length || 0}</div>
                                    <div>Accounts: {importData.accounts?.length || 0}</div>
                                    <div>Transactions: {importData.transactions?.length || 0}</div>
                                    <div>Stocks: {importData.stocks?.length || 0}</div>
                                    <div>Categories: {importData.categories?.length || 0}</div>
                                    <div>Debts: {importData.debts?.length || 0}</div>
                                    <div>Credits: {importData.credits?.length || 0}</div>
                                    <div>Mortgages: {importData.mortgages?.length || 0}</div>
                                    <div>Deposits: {importData.deposits?.length || 0}</div>
                                    <div>Subscriptions: {importData.subscriptions?.length || 0}</div>
                                    <div>Holdings: {importData.portfolioHoldings?.length || 0}</div>
                                    <div>Investment Tx: {importData.investmentTransactions?.length || 0}</div>
                                    <div>Split Participants: {importData.splitParticipants?.length || 0}</div>
                                    <div>Split Transactions: {importData.transactionSplits?.length || 0}</div>
                                    <div>Split Payments: {importData.splitPayments?.length || 0}</div>
                                </div>
                                
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" className="w-full" disabled={isImporting}>
                                            {isImporting ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Importing...
                                                </>
                                            ) : (
                                                'Confirm Import & Replace Data'
                                            )}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                                                <AlertTriangle className="h-5 w-5" />
                                                Are you absolutely sure?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. This will permanently delete your current
                                                data (accounts, transactions, categories, etc.) and replace it with the data from the backup file.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction 
                                                onClick={handleImport}
                                                className="bg-red-600 hover:bg-red-700"
                                            >
                                                Yes, Replace All Data
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Danger Zone */}
            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Danger Zone
                    </CardTitle>
                    <CardDescription>
                        Irreversible actions that will permanently delete your data
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                            <div className="space-y-3">
                                <div>
                                    <h3 className="font-semibold text-destructive mb-1">Delete All Data</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Permanently delete all your financial data. This will reset your account 
                                        to a fresh state as if newly created.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <DeleteConfirm
                                        title="Delete All Data?"
                                        description="This will permanently delete ALL your data including banks, accounts, transactions, debts, credits, mortgages, deposits, and categories. This action CANNOT be undone. Are you absolutely sure you want to proceed?"
                                        onConfirm={handleDeleteAllData}
                                        trigger={
                                            <Button 
                                                variant="destructive" 
                                                className="gap-2"
                                                disabled={deleteAllDataMutation.isLoading}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                {deleteAllDataMutation.isLoading ? 'Deleting...' : 'Delete All Data'}
                                            </Button>
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}