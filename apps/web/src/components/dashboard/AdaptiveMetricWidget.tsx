import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Area, AreaChart, ResponsiveContainer, XAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { WidgetFooter } from './WidgetFooter';

interface AdaptiveMetricWidgetProps {
    title: string;
    icon: React.ReactNode;
    value: React.ReactNode;
    subValue?: string | React.ReactNode;
    color?: string; // hex color for chart
    valueColor?: string; // CSS color for the value text
    chartData?: any[];
    gridParams?: { w: number; h: number; breakpoint?: string };
}

export function AdaptiveMetricWidget({
    title,
    icon,
    value,
    subValue,
    color = "hsl(var(--primary))",
    valueColor,
    chartData,
    gridParams
}: AdaptiveMetricWidgetProps) {
    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;

    const resolvedIcon = React.isValidElement(icon)
        ? React.cloneElement(icon as React.ReactElement, { className: cn('h-4 w-4', (icon.props as any)?.className) })
        : icon;

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group rounded-[32px] overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl">
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{title}</div>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-lg font-bold tracking-tight whitespace-nowrap" style={valueColor ? { color: valueColor } : {}}>
                            {value}
                        </span>
                    </div>
                </div>
                <div 
                    className="p-1.5 rounded-md transition-colors bg-muted/50 group-hover:bg-muted"
                    style={color ? { color: color } : {}}
                >
                    {resolvedIcon}
                </div>
            </CardHeader>

            <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0 relative">
                {chartData && chartData.length > 0 && (
                    <div className="absolute inset-x-0 bottom-0 h-12 opacity-50 group-hover:opacity-80 transition-opacity pointer-events-none">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke={color}
                                    strokeWidth={1.5}
                                    fill={color}
                                    fillOpacity={0.1}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {!isCompact && subValue && (
                    <div className="relative z-10 py-1">
                        <div className="text-[10px] text-muted-foreground font-medium truncate">
                            {subValue}
                        </div>
                    </div>
                )}
            </CardContent>

            {subValue && isCompact && (
                <WidgetFooter flex={false}>
                    <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                        {subValue}
                    </div>
                </WidgetFooter>
            )}
        </Card>
    );
}
