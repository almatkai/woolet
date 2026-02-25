import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Wallet, Receipt, PiggyBank, Home, CalendarDays, TrendingUp, Users, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

// Import form components
import { AddTransactionForm } from './AddTransactionForm';
import { AddDebtForm } from './AddDebtForm';
import { AddSubscriptionForm } from './AddSubscriptionForm';
import { AddDepositForm } from './AddDepositForm';
import { AddMortgageForm } from './AddMortgageForm';
import { AddInvestmentForm } from './AddInvestmentForm';

interface AddOption {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    action: 'navigate' | 'form';
    href?: string;
}

interface UniversalAddSheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
}

export function UniversalAddSheet({ open: openProp, onOpenChange, trigger }: UniversalAddSheetProps = {}) {
    const isControlled = openProp !== undefined;
    const [openInternal, setOpenInternal] = useState(false);
    const open = isControlled ? openProp! : openInternal;
    const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setOpenInternal;
    const [selectedOption, setSelectedOption] = useState<string | null>('transaction');
    const navigate = useNavigate();
    const isNarrowLayout = useIsMobile();
    const isBottomSheetMobile = useIsMobile(470);

    const addOptions: AddOption[] = [
        {
            id: 'transaction',
            label: 'Transaction',
            description: 'Record income or expense',
            icon: <Receipt className="h-5 w-5" />,
            action: 'form',
        },
        {
            id: 'account',
            label: 'Account',
            description: 'Add a new bank account',
            icon: <Wallet className="h-5 w-5" />,
            action: 'navigate',
            href: '/accounts'
        },
        {
            id: 'debt',
            label: 'Debt',
            description: 'Track money you owe or lent',
            icon: <Users className="h-5 w-5" />,
            action: 'form',
        },
        {
            id: 'subscription',
            label: 'Subscription',
            description: 'Add recurring payments',
            icon: <CalendarDays className="h-5 w-5" />,
            action: 'form',
        },
        {
            id: 'deposit',
            label: 'Deposit',
            description: 'Track savings deposits',
            icon: <PiggyBank className="h-5 w-5" />,
            action: 'form',
        },
        {
            id: 'mortgage',
            label: 'Mortgage',
            description: 'Add mortgage details',
            icon: <Home className="h-5 w-5" />,
            action: 'form',
        },
        {
            id: 'investment',
            label: 'Investment',
            description: 'Add stocks or investments',
            icon: <TrendingUp className="h-5 w-5" />,
            action: 'form',
        },
    ];

    const handleOptionClick = (option: AddOption) => {
        if (option.action === 'navigate' && option.href) {
            setOpen(false);
            navigate({ to: option.href });
        } else if (option.action === 'form') {
            setSelectedOption(option.id);
        }
    };

    // handleClose removed (unused)

    const handleBack = () => {
        if (isBottomSheetMobile) {
            setSelectedOption('transaction');
            return;
        }
        setSelectedOption(null);
    };

    const handleSuccess = () => {
        setOpen(false);
        setSelectedOption(null);
    };

    const activeOption = isBottomSheetMobile && !selectedOption ? 'transaction' : selectedOption;
    const selectedOptionData = addOptions.find(o => o.id === activeOption);

    // Render the form content based on selection
    const renderFormContent = (option: string | null) => {
        switch (option) {
            case 'transaction':
                return <AddTransactionForm onSuccess={handleSuccess} onCancel={handleBack} />;
            case 'debt':
                return <AddDebtForm onSuccess={handleSuccess} onCancel={handleBack} />;
            case 'subscription':
                return <AddSubscriptionForm onSuccess={handleSuccess} onCancel={handleBack} />;
            case 'deposit':
                return <AddDepositForm onSuccess={handleSuccess} onCancel={handleBack} />;
            case 'mortgage':
                return <AddMortgageForm onSuccess={handleSuccess} onCancel={handleBack} />;
            case 'investment':
                return <AddInvestmentForm onSuccess={handleSuccess} onCancel={handleBack} showCancel={false} />;
            default:
                return null;
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {!isControlled && (
                <SheetTrigger asChild>
                    {trigger ?? (
                        <Button size="sm" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add
                        </Button>
                    )}
                </SheetTrigger>
            )}
            <SheetContent
                side={isBottomSheetMobile ? 'bottom' : 'right'}
                className={cn(
                    'w-full p-0',
                    isBottomSheetMobile
                        ? 'h-[92dvh] rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+0.5rem)]'
                        : 'sm:max-w-4xl'
                )}
            >
                {isBottomSheetMobile ? (
                    <div className="flex h-full flex-col bg-background">
                        <div className="border-b p-4">
                            <h2 className="font-semibold">Add {selectedOptionData?.label || 'New'}</h2>
                            <p className="text-sm text-muted-foreground">
                                {selectedOptionData?.description || 'Choose what you want to add'}
                            </p>
                            <div className="-mx-1 mt-3 overflow-x-auto">
                                <div className="flex gap-2 px-1 pb-1">
                                    {addOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => handleOptionClick(option)}
                                            className={cn(
                                                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                                                activeOption === option.id
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                            )}
                                        >
                                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-background">
                                                {option.icon}
                                            </span>
                                            <span className="font-medium">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 pb-6">
                                {activeOption ? (
                                    renderFormContent(activeOption)
                                ) : (
                                    <div className="flex min-h-[220px] items-center justify-center text-center text-muted-foreground">
                                        Select an option to get started
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                ) : (
                    <div className="flex h-full">
                        <div
                            className={cn(
                                'border-r bg-muted/30 flex flex-col transition-all duration-300',
                                isNarrowLayout ? 'w-16' : 'w-72'
                            )}
                        >
                            {!isNarrowLayout && (
                                <SheetHeader className="border-b p-4">
                                    <SheetTitle className="text-lg">Add New</SheetTitle>
                                </SheetHeader>
                            )}
                            <ScrollArea className="flex-1">
                                <div className={cn('space-y-1', isNarrowLayout ? 'p-2' : 'p-3')}>
                                    {addOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => handleOptionClick(option)}
                                            className={cn(
                                                'rounded-lg transition-colors',
                                                isNarrowLayout
                                                    ? 'w-full flex items-center justify-center p-2'
                                                    : 'w-full flex items-start gap-3 p-3 text-left',
                                                activeOption === option.id
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'hover:bg-accent hover:text-accent-foreground'
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                                                    activeOption === option.id
                                                        ? 'bg-primary-foreground/20'
                                                        : 'bg-background'
                                                )}
                                            >
                                                {option.icon}
                                            </div>
                                            {!isNarrowLayout && (
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="text-sm font-medium">{option.label}</h3>
                                                    <p
                                                        className={cn(
                                                            'truncate text-xs',
                                                            activeOption === option.id
                                                                ? 'text-primary-foreground/80'
                                                                : 'text-muted-foreground'
                                                        )}
                                                    >
                                                        {option.description}
                                                    </p>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="flex flex-1 flex-col bg-background">
                            {activeOption ? (
                                <>
                                    <div className="flex items-center justify-between border-b p-4">
                                        <div className="flex items-center gap-3">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleBack}
                                                className="shrink-0"
                                            >
                                                <ArrowLeft className="h-4 w-4" />
                                            </Button>
                                            <div>
                                                <h2 className="font-semibold">
                                                    Add {selectedOptionData?.label}
                                                </h2>
                                                <p className="text-sm text-muted-foreground">
                                                    {selectedOptionData?.description}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <ScrollArea className="flex-1 p-1 md:p-6">
                                        {renderFormContent(activeOption)}
                                    </ScrollArea>
                                </>
                            ) : (
                                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                                    <div className="text-center">
                                        <div className="mb-4 flex justify-center">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                                <Plus className="h-6 w-6" />
                                            </div>
                                        </div>
                                        <p>Select an option from the sidebar to get started</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
