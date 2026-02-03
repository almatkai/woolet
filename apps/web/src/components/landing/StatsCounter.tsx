import React from 'react';
import { motion } from 'motion/react';
import { CountingNumber } from '@/components/ui/counting-number';
import { Wallet, Receipt, Users, TrendingUp } from 'lucide-react';

const stats = [
    {
        icon: Wallet,
        value: 50,
        suffix: "+",
        label: "Account Types Supported",
        color: "text-foreground",
    },
    {
        icon: Receipt,
        value: 1000,
        suffix: "+",
        label: "Transactions Tracked Daily",
        color: "text-foreground",
    },
    {
        icon: Users,
        value: 10,
        suffix: "+",
        label: "Financial Products",
        color: "text-foreground",
    },
    {
        icon: TrendingUp,
        value: 99,
        suffix: "%",
        label: "Uptime Guarantee",
        color: "text-foreground",
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: {
            type: "spring" as const,
            stiffness: 100,
            damping: 15,
        },
    },
};

export function StatsCounter() {
    return (
        <section className="py-20 px-4 relative overflow-hidden bg-background">
            {/* Background decoration - subtle solid background */}
            <div className="absolute inset-0 bg-muted/5" />

            <div className="max-w-6xl mx-auto relative z-10">
                {/* Section Header */}
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
                        Built for Your Financial Success
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                        Join thousands of users who trust Woolet to manage their finances.
                    </p>
                </div>

                {/* Stats Grid */}
                <motion.div
                    className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8"
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                >
                    {stats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            variants={itemVariants}
                            className="relative group"
                        >
                            <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8 text-center shadow-sm hover:shadow-lg transition-all duration-300 hover:border-primary/20">
                                {/* Icon */}
                                <div className="inline-flex items-center justify-center p-3 rounded-xl bg-primary mb-4 text-primary-foreground">
                                    <stat.icon className="h-6 w-6" />
                                </div>

                                {/* Number */}
                                <div className="text-4xl md:text-5xl font-bold mb-2">
                                    <CountingNumber
                                        number={stat.value}
                                        className={stat.color}
                                        transition={{ stiffness: 50, damping: 30 }}
                                    />
                                    <span className={stat.color}>{stat.suffix}</span>
                                </div>

                                {/* Label */}
                                <p className="text-sm text-muted-foreground font-medium">
                                    {stat.label}
                                </p>
                            </div>

                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

export default StatsCounter;
