
export type PaymentStatusLogic = 'monthly' | 'period';
export type PaymentStatusType = 'credit' | 'mortgage' | 'subscription';

export interface PaymentStatusOptions {
    logic: PaymentStatusLogic;
    period: number;
}

export interface PaymentStatusSettings {
    paymentStatusLogic?: PaymentStatusLogic | null;
    paymentStatusPeriod?: string | null;
    creditStatusLogic?: PaymentStatusLogic | null;
    creditStatusPeriod?: string | null;
    mortgageStatusLogic?: PaymentStatusLogic | null;
    mortgageStatusPeriod?: string | null;
    subscriptionStatusLogic?: PaymentStatusLogic | null;
    subscriptionStatusPeriod?: string | null;
}

export function getPaymentStatusOptions(
    settings: PaymentStatusSettings | undefined,
    type: PaymentStatusType
): PaymentStatusOptions {
    const globalLogic = (settings?.paymentStatusLogic as PaymentStatusLogic) || 'monthly';
    const globalPeriod = parseInt(settings?.paymentStatusPeriod || '15', 10);

    const overrideLogic =
        type === 'credit'
            ? settings?.creditStatusLogic
            : type === 'mortgage'
                ? settings?.mortgageStatusLogic
                : settings?.subscriptionStatusLogic;

    const overridePeriod =
        type === 'credit'
            ? settings?.creditStatusPeriod
            : type === 'mortgage'
                ? settings?.mortgageStatusPeriod
                : settings?.subscriptionStatusPeriod;

    return {
        logic: (overrideLogic as PaymentStatusLogic) || globalLogic,
        period: parseInt(overridePeriod || String(globalPeriod), 10),
    };
}

export function getTargetMonthStr(
    billingDay: number | null,
    options: PaymentStatusOptions
): string {
    const { logic, period } = options;
    const today = new Date();
    const day = billingDay || 1;

    if (logic === 'monthly') {
        return today.toISOString().slice(0, 7);
    }

    // Logic for 'period' (Threshold)
    let nextDue = new Date(today.getFullYear(), today.getMonth(), day);
    
    // If today is past the billing day, the next due date is in the next month
    if (today.getDate() > day) {
        nextDue.setMonth(nextDue.getMonth() + 1);
    }

    const diffTime = nextDue.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If within threshold, we are looking for the payment for the upcoming due date
    if (diffDays <= period) {
        return nextDue.toISOString().slice(0, 7);
    } else {
        // Otherwise, we are still in the "window" of the previous payment
        let prevDue = new Date(nextDue);
        prevDue.setMonth(prevDue.getMonth() - 1);
        return prevDue.toISOString().slice(0, 7);
    }
}

export function isPaidForTargetMonth(
    payments: Array<{ monthYear?: string; paidAt?: string | Date }> | undefined,
    targetMonthStr: string,
    isMortgage: boolean
): boolean {
    if (!payments) return false;

    if (isMortgage) {
        return payments.some(p => p.monthYear === targetMonthStr);
    }

    // For regular subscriptions
    const [targetYear, targetMonth] = targetMonthStr.split('-').map(Number);
    return payments.some(p => {
        if (!p.paidAt) return false;
        const paidDate = new Date(p.paidAt);
        return (
            (paidDate.getMonth() + 1) === targetMonth &&
            paidDate.getFullYear() === targetYear
        );
    });
}
