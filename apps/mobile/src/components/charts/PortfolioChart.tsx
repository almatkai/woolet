import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const colors = {
    background: '#111827',
    card: '#1F2937',
    cardBorder: '#374151',
    text: '#F9FAFB',
    textMuted: '#9CA3AF',
    green: '#22c55e',
    orange: '#f97316',
    grid: '#374151',
};

interface ChartDataPoint {
    date: string;
    portfolio: number;
    benchmark: number;
}

interface PortfolioChartProps {
    data: ChartDataPoint[];
    height?: number;
}

export function PortfolioChart({ data, height = 160 }: PortfolioChartProps) {
    if (!data || data.length === 0) {
        return (
            <View style={[styles.container, { height }]}>
                <Text style={styles.emptyText}>No chart data available</Text>
            </View>
        );
    }

    const width = 300; // Will be scaled with viewBox
    const padding = { top: 10, right: 10, bottom: 20, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate min/max for Y axis
    const allValues = data.flatMap(d => [d.portfolio, d.benchmark]);
    const minY = Math.min(...allValues) - 5;
    const maxY = Math.max(...allValues) + 5;
    const yRange = maxY - minY;

    // Scale functions
    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (value: number) => padding.top + chartHeight - ((value - minY) / yRange) * chartHeight;

    // Create path strings
    const createPath = (values: number[]) => {
        return values.map((value, index) => {
            const x = xScale(index);
            const y = yScale(value);
            return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ');
    };

    // Create area path (closed path for gradient fill)
    const createAreaPath = (values: number[]) => {
        const linePath = createPath(values);
        const lastX = xScale(values.length - 1);
        const firstX = xScale(0);
        const bottomY = padding.top + chartHeight;
        return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    };

    const portfolioValues = data.map(d => d.portfolio);
    const benchmarkValues = data.map(d => d.benchmark);

    const portfolioPath = createPath(portfolioValues);
    const benchmarkPath = createPath(benchmarkValues);
    const portfolioAreaPath = createAreaPath(portfolioValues);
    const benchmarkAreaPath = createAreaPath(benchmarkValues);

    // Grid lines
    const gridLines = [];
    const numGridLines = 4;
    for (let i = 0; i <= numGridLines; i++) {
        const y = padding.top + (chartHeight / numGridLines) * i;
        const value = maxY - (yRange / numGridLines) * i;
        gridLines.push({ y, value });
    }

    return (
        <View style={[styles.container, { height }]}>
            <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                <Defs>
                    <LinearGradient id="portfolioGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor={colors.green} stopOpacity="0.3" />
                        <Stop offset="100%" stopColor={colors.green} stopOpacity="0.05" />
                    </LinearGradient>
                    <LinearGradient id="benchmarkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor={colors.orange} stopOpacity="0.2" />
                        <Stop offset="100%" stopColor={colors.orange} stopOpacity="0.02" />
                    </LinearGradient>
                </Defs>

                {/* Grid lines */}
                {gridLines.map((line, i) => (
                    <React.Fragment key={i}>
                        <Line
                            x1={padding.left}
                            y1={line.y}
                            x2={width - padding.right}
                            y2={line.y}
                            stroke={colors.grid}
                            strokeWidth={0.5}
                            strokeDasharray="3,3"
                        />
                    </React.Fragment>
                ))}

                {/* Benchmark area and line */}
                <Path
                    d={benchmarkAreaPath}
                    fill="url(#benchmarkGradient)"
                />
                <Path
                    d={benchmarkPath}
                    stroke={colors.orange}
                    strokeWidth={2}
                    fill="none"
                />

                {/* Portfolio area and line */}
                <Path
                    d={portfolioAreaPath}
                    fill="url(#portfolioGradient)"
                />
                <Path
                    d={portfolioPath}
                    stroke={colors.green}
                    strokeWidth={2}
                    fill="none"
                />

                {/* End point circles */}
                <Circle
                    cx={xScale(data.length - 1)}
                    cy={yScale(portfolioValues[portfolioValues.length - 1])}
                    r={4}
                    fill={colors.green}
                />
                <Circle
                    cx={xScale(data.length - 1)}
                    cy={yScale(benchmarkValues[benchmarkValues.length - 1])}
                    r={4}
                    fill={colors.orange}
                />
            </Svg>

            {/* Y-axis labels */}
            <View style={styles.yAxisLabels}>
                {gridLines.map((line, i) => (
                    <Text key={i} style={[styles.axisLabel, { top: line.y - 6 }]}>
                        {line.value.toFixed(0)}%
                    </Text>
                ))}
            </View>
        </View>
    );
}

interface AllocationBarProps {
    holdings: Array<{
        ticker: string;
        name: string;
        allocation: number;
        currentValue: number;
    }>;
}

const allocationColors = [
    '#3b82f6', '#22c55e', '#a855f7', '#f97316',
    '#ec4899', '#06b6d4', '#eab308', '#ef4444'
];

export function AllocationBars({ holdings }: AllocationBarProps) {
    if (!holdings || holdings.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No holdings yet</Text>
            </View>
        );
    }

    return (
        <View style={styles.allocationContainer}>
            {holdings.map((holding, idx) => (
                <View key={holding.ticker} style={styles.allocationItem}>
                    <View style={styles.allocationHeader}>
                        <View style={styles.allocationLeft}>
                            <View style={[styles.colorDot, { backgroundColor: allocationColors[idx % allocationColors.length] }]} />
                            <View>
                                <Text style={styles.allocationTicker}>{holding.ticker}</Text>
                                <Text style={styles.allocationName} numberOfLines={1}>{holding.name}</Text>
                            </View>
                        </View>
                        <View style={styles.allocationRight}>
                            <Text style={styles.allocationPercent}>{holding.allocation.toFixed(1)}%</Text>
                        </View>
                    </View>
                    <View style={styles.progressBar}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${Math.min(holding.allocation, 100)}%`,
                                    backgroundColor: allocationColors[idx % allocationColors.length]
                                }
                            ]}
                        />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
        textAlign: 'center',
    },
    yAxisLabels: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 35,
    },
    axisLabel: {
        position: 'absolute',
        left: 0,
        fontSize: 10,
        color: colors.textMuted,
    },
    // Allocation styles
    allocationContainer: {
        gap: 12,
    },
    allocationItem: {
        gap: 6,
    },
    allocationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    allocationLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    colorDot: {
        width: 8,
        height: 32,
        borderRadius: 4,
    },
    allocationTicker: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    allocationName: {
        fontSize: 11,
        color: colors.textMuted,
        maxWidth: 120,
    },
    allocationRight: {
        alignItems: 'flex-end',
    },
    allocationPercent: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },
    progressBar: {
        height: 6,
        backgroundColor: colors.background,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
});
