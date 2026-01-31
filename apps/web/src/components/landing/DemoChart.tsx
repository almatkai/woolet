import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp } from 'lucide-react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const chartData = [
    { month: "Jan", portfolio: 4200, benchmark: 4000 },
    { month: "Feb", portfolio: 4800, benchmark: 4350 },
    { month: "Mar", portfolio: 5100, benchmark: 4250 },
    { month: "Apr", portfolio: 4500, benchmark: 4600 },
    { month: "May", portfolio: 5500, benchmark: 4500 },
    { month: "Jun", portfolio: 6200, benchmark: 4900 },
    { month: "Jul", portfolio: 5800, benchmark: 4700 },
    { month: "Aug", portfolio: 6800, benchmark: 5100 },
];

export function DemoChart() {
    return (
        <section className="py-20 px-4 bg-muted/30">
            <div className="max-w-6xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
                        Investment Performance
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                        Track your portfolio growth and compare your performance against global benchmarks.
                    </p>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                >
                    <Card className="border-border/50 shadow-xl bg-background/90 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="text-xl">Your Portfolio vs S&P 500</CardTitle>
                            <CardDescription>
                                Real-time performance tracking against the market
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] md:h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={chartData}
                                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                                    >
                                        <defs>
                                            <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                        <XAxis
                                            dataKey="month"
                                            tickLine={false}
                                            axisLine={false}
                                            stroke="hsl(var(--muted-foreground))"
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            stroke="hsl(var(--muted-foreground))"
                                            tickFormatter={(value) => `$${value / 1000}k`}
                                        />

                                        <Area
                                            type="monotone"
                                            dataKey="benchmark"
                                            stroke="hsl(var(--muted-foreground))"
                                            fill="transparent"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            name="S&P 500"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="portfolio"
                                            stroke="hsl(var(--primary))"
                                            fill="url(#colorPortfolio)"
                                            strokeWidth={3}
                                            name="Your Portfolio"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t border-border/50 pt-4">
                            <div className="flex w-full items-start gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-primary" />
                                    <span className="text-muted-foreground">Your Portfolio</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full border border-muted-foreground border-dashed" />
                                    <span className="text-muted-foreground">S&P 500</span>
                                </div>
                                <div className="ml-auto flex items-center gap-1 text-foreground font-medium">
                                    <TrendingUp className="h-4 w-4" />
                                    Outperforming market by 23.6%
                                </div>
                            </div>
                        </CardFooter>
                    </Card>
                </motion.div>
            </div>
        </section>
    );
}

export default DemoChart;
