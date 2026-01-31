import React from 'react';
import { motion } from 'motion/react';
import {
    Wallet,
    Receipt,
    Users,
    CreditCard,
    Home,
    PiggyBank,
    TrendingUp,
    Bitcoin,
    CalendarClock,
    BarChart3,
    Shield,
    Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const features = [
    {
        title: "Multi-Currency Accounts",
        description: "Manage multiple bank accounts across different currencies in one place.",
        icon: Wallet,
        color: "from-blue-500 to-cyan-500",
    },
    {
        title: "Expense Tracking",
        description: "Categorize and visualize your spending with beautiful charts and insights.",
        icon: Receipt,
        color: "from-orange-500 to-red-500",
    },
    {
        title: "Debt Management",
        description: "Track money you owe or are owed, with repayment history and reminders.",
        icon: Users,
        color: "from-purple-500 to-pink-500",
    },
    {
        title: "Subscriptions",
        description: "Keep track of all your recurring payments and never miss a renewal.",
        icon: CalendarClock,
        color: "from-teal-500 to-green-500",
    },
    {
        title: "Credit Cards",
        description: "Monitor credit limits, balances, and payment due dates.",
        icon: CreditCard,
        color: "from-indigo-500 to-purple-500",
    },
    {
        title: "Mortgages",
        description: "Track mortgage payments, remaining balance, and interest rates.",
        icon: Home,
        color: "from-emerald-500 to-teal-500",
    },
    {
        title: "Deposits & Savings",
        description: "Monitor your savings accounts and deposit maturity dates.",
        icon: PiggyBank,
        color: "from-pink-500 to-rose-500",
    },
    {
        title: "Investments",
        description: "Track your portfolio performance with real-time stock prices.",
        icon: TrendingUp,
        color: "from-green-500 to-emerald-500",
    },
    {
        title: "Analytics Dashboard",
        description: "Get actionable insights with customizable widgets and reports.",
        icon: BarChart3,
        color: "from-blue-600 to-indigo-600",
    },
    {
        title: "Secure & Private",
        description: "Your data is encrypted and never shared with third parties.",
        icon: Shield,
        color: "from-slate-500 to-zinc-600",
    },
    {
        title: "Fast & Responsive",
        description: "Optimized for all devices with instant sync across platforms.",
        icon: Zap,
        color: "from-yellow-500 to-orange-500",
    },
    {
        title: "Crypto (Coming Soon)",
        description: "Track your cryptocurrency portfolio alongside traditional assets.",
        icon: Bitcoin,
        color: "from-amber-500 to-yellow-500",
        badge: "Soon",
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: "spring" as const,
            stiffness: 100,
            damping: 15,
        },
    },
};

export function FeaturesGrid() {
    return (
        <section id="features" className="py-20 px-4 bg-muted/30">
            <div className="max-w-7xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4 text-foreground">
                        Everything You Need to Master Your Money
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        From daily expenses to long-term investments, Woo-Let gives you complete visibility
                        and control over your financial life.
                    </p>
                </div>

                {/* Features Grid */}
                <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                >
                    {features.map((feature, index) => (
                        <motion.div key={feature.title} variants={itemVariants}>
                            <Card className="h-full group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/20 bg-background/80 backdrop-blur-sm">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="p-2.5 rounded-xl bg-primary shadow-lg group-hover:bg-primary/90 transition-colors">
                                            <feature.icon className="h-5 w-5 text-primary-foreground" />
                                        </div>
                                        {feature.badge && (
                                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                                                {feature.badge}
                                            </span>
                                        )}
                                    </div>
                                    <CardTitle className="text-lg mt-3 group-hover:text-primary transition-colors">
                                        {feature.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-sm leading-relaxed">
                                        {feature.description}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

export default FeaturesGrid;
