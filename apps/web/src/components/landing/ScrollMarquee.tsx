import React from 'react';
import { ScrollVelocity } from '@/components/ui/scroll-velocity';

export function ScrollMarquee() {
    const texts = [
        "💰 Spending • 📊 Analytics • 💳 Credits • 🏠 Mortgages • 📈 Investments • 💵 Debts • 🏦 Accounts •",
        "🔒 Secure • ⚡ Fast • 🌍 Multi-Currency • 📱 Responsive • 🎯 Insights • 🔄 Real-time • ✨ Beautiful •",
    ];

    return (
        <section className="py-8 overflow-hidden bg-muted/5 border-y border-border/10">
            <ScrollVelocity
                texts={texts}
                velocity={80}
                numCopies={4}
                className="text-muted-foreground/70"
            />
        </section>
    );
}

export default ScrollMarquee;
