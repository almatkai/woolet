import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, ResponsiveContainer, XAxis } from 'recharts';
import { cn } from '@/lib/utils';

interface AdaptiveMetricWidgetProps {
    title: string;
    icon: React.ReactNode;
    value: React.ReactNode;
    subValue?: string | React.ReactNode;
    color?: string; // hex color for chart
    valueColor?: string; // CSS color for the value text
    chartData?: any[];
    gridParams?: { w: number; h: number };
}

export function AdaptiveMetricWidget({
    title,
    icon,
    value,
    subValue,
    color = "#8884d8",
    valueColor,
    chartData,
    gridParams
}: AdaptiveMetricWidgetProps) {
    const isExpanded = (gridParams?.w || 1) >= 2;
    const isCompact = (gridParams?.w ?? 0) <= 1 || (gridParams?.h ?? 0) <= 2;

    const resolvedIcon = React.isValidElement(icon)
        ? React.cloneElement(icon, { className: cn('dashboard-widget__icon', icon.props?.className) })
        : icon;

    if (isExpanded && chartData && chartData.length > 0) {
        return (
            <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate">{title}</CardTitle>
                    <div className="flex-shrink-0">{resolvedIcon}</div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 flex flex-col p-3 pt-0">
                    <div className="dashboard-widget__value" style={valueColor ? { color: valueColor } : {}}>{value}</div>
                    <div className="flex-1 min-h-0 mt-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />

                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke={color}
                                    fillOpacity={1}
                                    fill={`url(#grad-${title})`}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    {subValue && <div className="dashboard-widget__sub">{subValue}</div>}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
            <CardHeader className="dashboard-widget__header flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                <CardTitle className="dashboard-widget__title truncate">{title}</CardTitle>
                {isCompact ? (
                    <div className="dashboard-widget__header-value" style={valueColor ? { color: valueColor } : {}}>
                        {value}
                    </div>
                ) : (
                    <div className="flex-shrink-0">{resolvedIcon}</div>
                )}
            </CardHeader>
            <CardContent className={isCompact ? 'p-2 pt-1 pb-2 flex-1 flex items-end' : 'p-3 pt-0'}>
                {!isCompact && <div className="dashboard-widget__value" style={valueColor ? { color: valueColor } : {}}>{value}</div>}
                {subValue && (
                    <p className={cn('dashboard-widget__sub truncate', isCompact ? 'w-full' : 'mt-0.5')}>
                        {subValue}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
