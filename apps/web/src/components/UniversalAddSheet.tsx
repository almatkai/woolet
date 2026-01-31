import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Wallet, Receipt, PiggyBank, Home, CalendarDays, TrendingUp, Users, ArrowLeft, X } from 'lucide-react';
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

export function UniversalAddSheet() {
    const [open, setOpen] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string | null>('transaction');
    const navigate = useNavigate();
    const [isSmallScreen, setIsSmallScreen] = useState(false);

    useEffect(() => {
        const checkScreenSize = () => {
            setIsSmallScreen(window.innerWidth < 850);
        };
        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

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

    const handleClose = () => {
        setOpen(false);
        setSelectedOption(null);
    };

    const handleBack = () => {
        setSelectedOption(null);
    };

    const handleSuccess = () => {
        setOpen(false);
        setSelectedOption(null);
    };

    const selectedOptionData = addOptions.find(o => o.id === selectedOption);

    // Render the form content based on selection
    const renderFormContent = () => {
        switch (selectedOption) {
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
            <SheetTrigger asChild>
                <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-4xl p-0">
                <div className="flex h-full">
                    {/* Left Sidebar - Type Selection */}
                    <div className={cn(
                        "border-r bg-muted/30 flex flex-col transition-all duration-300",
                        isSmallScreen ? "w-16" : "w-72"
                    )}>
                        {!isSmallScreen && (
                            <SheetHeader className="p-4 border-b">
                                <SheetTitle className="text-lg">Add New</SheetTitle>
                            </SheetHeader>
                        )}
                        <ScrollArea className="flex-1">
                            <div className={cn(
                                "space-y-1",
                                isSmallScreen ? "p-2" : "p-3"
                            )}>
                                {addOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleOptionClick(option)}
                                        className={cn(
                                            "rounded-lg transition-colors",
                                            isSmallScreen 
                                                ? "w-full flex items-center justify-center p-2"
                                                : "w-full flex items-start gap-3 p-3 text-left",
                                            selectedOption === option.id
                                                ? "bg-primary text-primary-foreground"
                                                : "hover:bg-accent hover:text-accent-foreground"
                                        )}
                                    >
                                        <div className={cn(
                                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                                            selectedOption === option.id
                                                ? "bg-primary-foreground/20"
                                                : "bg-background"
                                        )}>
                                            {option.icon}
                                        </div>
                                        {!isSmallScreen && (
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-medium text-sm">{option.label}</h3>
                                                <p className={cn(
                                                    "text-xs truncate",
                                                    selectedOption === option.id
                                                        ? "text-primary-foreground/80"
                                                        : "text-muted-foreground"
                                                )}>
                                                    {option.description}
                                                </p>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Right Side - Form Content */}
                    <div className="flex-1 flex flex-col bg-background">
                        {selectedOption ? (
                            <>
                                {/* Form Header */}
                                <div className="flex items-center justify-between p-4 border-b">
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
                                {/* Form Content */}
                                <ScrollArea className="flex-1 p-6">
                                    {renderFormContent()}
                                </ScrollArea>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <div className="flex justify-center mb-4">
                                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                            <Plus className="h-6 w-6" />
                                        </div>
                                    </div>
                                    <p>Select an option from the sidebar to get started</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
