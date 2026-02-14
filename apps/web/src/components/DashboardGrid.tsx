import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Responsive } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import './resize-styles.css';
import './dashboard-widget.css';
import { Button } from '@/components/ui/button';
import { Trash2, Eye } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

// Internal Layout type to handle property access that base Layout sometimes misses in union types
interface InternalLayout extends Layout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
}

type Layouts = {
    [key: string]: InternalLayout[] | undefined;
    lg?: InternalLayout[];
    md?: InternalLayout[];
    sm?: InternalLayout[];
    xs?: InternalLayout[];
};

// Breakpoint type for type safety
type Breakpoint = 'lg' | 'md' | 'sm' | 'xs';

const BREAKPOINTS: Record<Breakpoint, number> = {
    lg: 1300,
    md: 900,
    sm: 300,
    xs: 0,
};

const COLS: Record<Breakpoint, number> = {
    lg: 6,
    md: 4,
    sm: 2,
    xs: 2,
};

const MIN_H_SM = 2;

const getBreakpointFromWidth = (width: number): Breakpoint => {
    if (width >= BREAKPOINTS.lg) return 'lg';
    if (width >= BREAKPOINTS.md) return 'md';
    if (width >= BREAKPOINTS.sm) return 'sm';
    return 'xs';
};

// Custom WidthProvider implementation
const withSize = (Component: any) => {
    return (props: any) => {
        const [width, setWidth] = useState<number | null>(null);
        const ref = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const element = ref.current;
            if (!element) return;

            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    setWidth(entry.contentRect.width);
                }
            });

            observer.observe(element);
            // set initial width
            setWidth(element.offsetWidth);

            return () => observer.disconnect();
        }, []);

        return (
            <div ref={ref} className={props.className} style={props.style}>
                {width !== null && width > 0 ? <Component {...props} width={width} /> : null}
            </div>
        );
    };
};

const ResponsiveGridLayout = withSize(Responsive);

interface DashboardGridProps {
    children: React.ReactNode;
    isEditing: boolean;
    onEditingChange: (isEditing: boolean) => void;
}

// Default layouts for each breakpoint - all use 2 columns minimum for mobile
const defaultLayouts: Layouts = {
    lg: ([
        { i: 'totalBalance', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'monthlyIncome', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'monthlyExpenses', x: 2, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'debts', x: 3, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'categoryChart', x: 4, y: 0, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'spendingChart', x: 0, y: 2, w: 3, h: 3, minW: 1, minH: 1 },
        { i: 'mortgages', x: 3, y: 2, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'recentTransactions', x: 4, y: 3, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'credits', x: 0, y: 5, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'deposits', x: 2, y: 5, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'subscriptions', x: 4, y: 5, w: 2, h: 3, minW: 1, minH: 1 },
        // New widgets
        { i: 'currencyExchange', x: 0, y: 8, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPortfolio', x: 2, y: 8, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPerformance', x: 4, y: 8, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'assetAllocation', x: 0, y: 11, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'splitBills', x: 2, y: 11, w: 2, h: 3, minW: 1, minH: 1 },
    ] as InternalLayout[]),
    md: ([
        { i: 'totalBalance', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'monthlyIncome', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'monthlyExpenses', x: 2, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'debts', x: 3, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'spendingChart', x: 0, y: 2, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'categoryChart', x: 2, y: 2, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'recentTransactions', x: 0, y: 5, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'mortgages', x: 2, y: 5, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'credits', x: 3, y: 5, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'deposits', x: 0, y: 8, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'subscriptions', x: 2, y: 8, w: 2, h: 3, minW: 1, minH: 1 },
        // New widgets
        { i: 'currencyExchange', x: 0, y: 11, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPortfolio', x: 2, y: 11, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPerformance', x: 0, y: 14, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'assetAllocation', x: 2, y: 14, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'splitBills', x: 0, y: 17, w: 2, h: 3, minW: 1, minH: 1 },
    ] as InternalLayout[]),
    sm: ([
        { i: 'totalBalance', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'monthlyIncome', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'monthlyExpenses', x: 0, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'debts', x: 1, y: 2, w: 1, h: 2, minW: 1, minH: 1 },
        { i: 'spendingChart', x: 0, y: 4, w: 2, h: 4, minW: 1, minH: 1 },
        { i: 'categoryChart', x: 0, y: 8, w: 2, h: 4, minW: 1, minH: 1 },
        { i: 'recentTransactions', x: 0, y: 12, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'deposits', x: 1, y: 12, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'mortgages', x: 0, y: 15, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'credits', x: 1, y: 15, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'subscriptions', x: 0, y: 18, w: 2, h: 3, minW: 1, minH: 1 },
        // New widgets
        { i: 'currencyExchange', x: 0, y: 21, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPortfolio', x: 0, y: 24, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPerformance', x: 0, y: 27, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'assetAllocation', x: 0, y: 30, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'splitBills', x: 0, y: 33, w: 2, h: 3, minW: 1, minH: 1 },
    ] as InternalLayout[]),
    // XS also uses 2 columns - compact layout for small phones
    xs: ([
        { i: 'totalBalance', x: 0, y: 0, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'monthlyIncome', x: 1, y: 0, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'monthlyExpenses', x: 0, y: 3, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'debts', x: 1, y: 3, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'spendingChart', x: 0, y: 6, w: 2, h: 4, minW: 1, minH: 1 },
        { i: 'categoryChart', x: 0, y: 10, w: 2, h: 4, minW: 1, minH: 1 },
        { i: 'recentTransactions', x: 0, y: 14, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'mortgages', x: 0, y: 17, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'credits', x: 1, y: 17, w: 1, h: 3, minW: 1, minH: 1 },
        { i: 'deposits', x: 0, y: 20, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'subscriptions', x: 0, y: 23, w: 2, h: 3, minW: 1, minH: 1 },
        // New widgets
        { i: 'currencyExchange', x: 0, y: 26, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPortfolio', x: 0, y: 29, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'investmentPerformance', x: 0, y: 32, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'assetAllocation', x: 0, y: 35, w: 2, h: 3, minW: 1, minH: 1 },
        { i: 'splitBills', x: 0, y: 38, w: 2, h: 3, minW: 1, minH: 1 },
    ] as InternalLayout[])


};

// Helper function to migrate old format to new format
function migrateLayoutData(savedData: any): { layouts: Layouts; hiddenWidgets: string[] } {
    // If null/undefined, return defaults with no hidden widgets
    if (!savedData) {
        return { layouts: defaultLayouts, hiddenWidgets: [] };
    }

    // New format: has 'layouts' object with lg, md, sm, xs
    if (savedData.layouts && savedData.layouts.lg) {
        // Ensure minH/minW are updated to 1 for existing layouts and remove duplicates
        const updatedLayouts: Layouts = {};
        Object.keys(savedData.layouts).forEach((key) => {
            const seenKeys = new Set<string>();
            updatedLayouts[key] = savedData.layouts[key]
                .map((item: Layout) => ({
                    ...item,
                    minW: 1,
                    minH: 1,
                }))
                .filter((item: InternalLayout) => {
                    if (seenKeys.has(item.i)) {
                        return false;
                    }
                    seenKeys.add(item.i);
                    return true;
                });
        });

        // Use the saved hiddenWidgets as-is - don't force any widgets to be hidden
        const hiddenWidgets = savedData.hiddenWidgets || [];

        return {
            layouts: updatedLayouts,
            hiddenWidgets: hiddenWidgets,
        };
    }

    // Old format with 'layout' array (single layout)
    if (savedData.layout && Array.isArray(savedData.layout)) {
        const singleLayout = savedData.layout.map((item: Layout) => ({
            ...item,
            minW: 1,
            minH: 1,
        })) as InternalLayout[];
        // Generate responsive layouts from the single layout
        return {
            layouts: {
                lg: singleLayout,
                md: generateResponsiveLayout(singleLayout, 4),
                sm: generateResponsiveLayout(singleLayout, 2),
                xs: generateResponsiveLayout(singleLayout, 1),
            },
            hiddenWidgets: savedData.hiddenWidgets || [],
        };
    }

    // Very old format: just an array
    if (Array.isArray(savedData)) {
        const singleLayout = savedData.map((item: Layout) => ({
            ...item,
            minW: 1,
            minH: 1,
        })) as InternalLayout[];
        return {
            layouts: {
                lg: singleLayout,
                md: generateResponsiveLayout(singleLayout, 4),
                sm: generateResponsiveLayout(singleLayout, 2),
                xs: generateResponsiveLayout(singleLayout, 1),
            },
            hiddenWidgets: [],
        };
    }

    // Fallback to defaults with subscriptions hidden by default
    return { layouts: defaultLayouts, hiddenWidgets: ['subscriptions'] };
}

// Generate responsive layout from a source layout for a given column count
function generateResponsiveLayout(sourceLayout: InternalLayout[], cols: number): InternalLayout[] {
    return sourceLayout.map((item, index) => ({
        ...item,
        x: cols === 1 ? 0 : (index % cols),
        y: Math.floor(index / cols) * (item.h || 2),
        w: Math.min(item.w || 1, cols),
    })) as InternalLayout[];
}

function normalizeLayoutsForSmallHeights(input: Layouts): Layouts {
    const output: Layouts = {};

    (Object.keys(input) as Array<keyof Layouts>).forEach((key) => {
        const bp = key as Breakpoint;
        const layout = input[bp];
        if (!layout) return;

        if (bp === 'sm') {
            output[bp] = layout.map((item) => {
                const nextH = Math.max(item.h ?? MIN_H_SM, MIN_H_SM);
                const nextMinH = Math.max(item.minH ?? MIN_H_SM, MIN_H_SM);
                return {
                    ...item,
                    h: nextH,
                    minH: nextMinH,
                };
            });
        } else {
            output[bp] = layout;
        }
    });

    return output;
}

export const DashboardGrid = forwardRef<{ handleSave: () => void; handleCancel: () => void }, DashboardGridProps>(
    ({ children, isEditing, onEditingChange }, ref) => {
        const [layouts, setLayouts] = useState<Layouts | null>(null);
        const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
        const [currentBreakpoint, setCurrentBreakpoint] = useState<Breakpoint>('lg');
        const [isLayoutReady, setIsLayoutReady] = useState(false);
        const utils = trpc.useUtils();

        const { data: savedLayout, isLoading } = trpc.dashboard.getLayout.useQuery(undefined, {
            refetchOnWindowFocus: false,
        });

        const saveLayoutMutation = trpc.dashboard.saveLayout.useMutation({
            onSuccess: () => {
                toast.success('Dashboard layout saved');
                onEditingChange(false);
                utils.dashboard.getLayout.invalidate();
            },
            onError: () => toast.error('Failed to save layout'),
        });

        useEffect(() => {
            const handle = setTimeout(() => {
                if (savedLayout !== undefined) {
                    const { layouts: loadedLayouts, hiddenWidgets: loadedHiddenWidgets } = migrateLayoutData(savedLayout);

                    // Check if user has no saved layout (null means new user or reset)
                    const isNewUser = savedLayout === null;

                    if (isNewUser) {
                        // New user: use default layouts with all widgets visible
                        setLayouts(normalizeLayoutsForSmallHeights(defaultLayouts));
                        setHiddenWidgets([]);
                        setIsLayoutReady(true);
                        return;
                    }

                    // Existing user with saved layout
                    const defaultWidgetIds = new Set((defaultLayouts.lg || []).map(l => l.i));
                    const savedWidgetIds = new Set((loadedLayouts.lg || []).map(l => l.i));
                    const allKnownWidgetIds = new Set([...savedWidgetIds, ...loadedHiddenWidgets]);

                    // Find newly added widgets (in defaults but not in saved layout or hidden)
                    const newWidgets = Array.from(defaultWidgetIds).filter(id => !allKnownWidgetIds.has(id));

                    // For existing users, hide any new widgets by default
                    const updatedHiddenWidgets = [...loadedHiddenWidgets, ...newWidgets];

                    // Ensure all widgets from defaults are present in each breakpoint
                    const breakpoints: Breakpoint[] = ['lg', 'md', 'sm', 'xs'];
                    const completeLayouts: Layouts = {};

                    breakpoints.forEach(bp => {
                        const bpLayout = (loadedLayouts[bp] || defaultLayouts[bp]) as InternalLayout[];

                        // Remove duplicate widgets (keep first occurrence)
                        const seenKeys = new Set<string>();
                        const deduplicatedLayout = bpLayout.filter((item) => {
                            if (seenKeys.has(item.i)) {
                                return false;
                            }
                            seenKeys.add(item.i);
                            return true;
                        });

                        // Only include widgets that are not hidden
                        const visibleLayout = deduplicatedLayout.filter(
                            (item) => !updatedHiddenWidgets.includes(item.i)
                        );

                        completeLayouts[bp] = visibleLayout;
                    });

                    setLayouts(normalizeLayoutsForSmallHeights(completeLayouts));
                    setHiddenWidgets(updatedHiddenWidgets);
                    setIsLayoutReady(true);
                }
            }, 0);
            return () => clearTimeout(handle);
        }, [savedLayout]);

        const onLayoutChange = useCallback((currentLayout: Layout[], allLayouts: Layouts) => {
            // Only update layouts when in edit mode
            if (isEditing) {
                // Cast allLayouts back to InternalLayout arrays
                const typedLayouts: Layouts = {};
                Object.keys(allLayouts).forEach(bp => {
                    typedLayouts[bp] = (allLayouts[bp] as Layout[]).map(l => {
                        const item = l as any;
                        return {
                            ...l,
                            i: item.i,
                            x: item.x,
                            y: item.y,
                            w: item.w,
                            h: item.h
                        } as InternalLayout;
                    });
                });
                setLayouts(normalizeLayoutsForSmallHeights(typedLayouts));
            }
        }, [isEditing]);

        const onBreakpointChange = useCallback((newBreakpoint: string) => {
            setCurrentBreakpoint(newBreakpoint as Breakpoint);
        }, []);

        const handleSave = () => {
            if (!layouts) return;
            const normalizedLayouts = normalizeLayoutsForSmallHeights(layouts);
            saveLayoutMutation.mutate({
                layouts: normalizedLayouts as { lg: any[]; md: any[]; sm: any[]; xs: any[] },
                hiddenWidgets
            });
        };

        const handleCancel = () => {
            if (savedLayout) {
                const { layouts: loadedLayouts, hiddenWidgets: loadedHiddenWidgets } = migrateLayoutData(savedLayout);
                setLayouts(normalizeLayoutsForSmallHeights(loadedLayouts));
                setHiddenWidgets(loadedHiddenWidgets);
            } else {
                setLayouts(normalizeLayoutsForSmallHeights(defaultLayouts));
                setHiddenWidgets([]);
            }
            onEditingChange(false);
        };

        useImperativeHandle(ref, () => ({
            handleSave,
            handleCancel,
        }));

        const handleHideWidget = (widgetId: string) => {
            if (!layouts) return;
            setHiddenWidgets([...hiddenWidgets, widgetId]);
            // Remove widget from all breakpoint layouts
            const newLayouts: Layouts = {};
            Object.keys(layouts).forEach(bp => {
                const currentBp = bp as Breakpoint;
                const bpLayout = layouts[currentBp] as InternalLayout[];
                if (bpLayout) {
                    newLayouts[currentBp] = bpLayout.filter(item => item.i !== widgetId);
                }
            });
            setLayouts(normalizeLayoutsForSmallHeights(newLayouts));
        };

        const handleShowWidget = (widgetId: string) => {
            if (!layouts) return;
            setHiddenWidgets(hiddenWidgets.filter(id => id !== widgetId));
            // Add widget back to all breakpoint layouts
            const newLayouts: Layouts = {};
            Object.keys(layouts).forEach(bp => {
                const currentBp = bp as Breakpoint;
                const bpLayout = (layouts[currentBp] || []) as InternalLayout[];

                // Check if widget already exists in this breakpoint
                const existingIndex = bpLayout.findIndex(item => item.i === widgetId);
                if (existingIndex !== -1) {
                    // Widget already exists, don't add duplicate
                    newLayouts[currentBp] = bpLayout;
                    return;
                }

                const defaultItem = (defaultLayouts[currentBp] as InternalLayout[])?.find(item => item.i === widgetId);
                if (defaultItem) {
                    const maxY = Math.max(...(bpLayout || []).map(l => (l.y || 0) + (l.h || 0)), 0);
                    newLayouts[currentBp] = [...(bpLayout || []), { ...defaultItem, y: maxY }] as InternalLayout[];
                } else {
                    newLayouts[currentBp] = bpLayout;
                }
            });
            setLayouts(normalizeLayoutsForSmallHeights(newLayouts));
        };

        // Helper to find child by key
        const getChild = (key: string) => {
            if (!children) return null;
            if (Array.isArray(children)) {
                return children.find((child: any) => child && child.key === key);
            }
            if (React.isValidElement(children) && children.key === key) {
                return children;
            }
            return null;
        };

        const visibleWidgetIds = React.useMemo(() => {
            if (!layouts) return [];

            const ids = new Set<string>();
            Object.values(layouts).forEach((layout) => {
                (layout || []).forEach((item) => ids.add(item.i));
            });

            if (ids.size === 0) {
                (defaultLayouts.lg || []).forEach((item) => ids.add(item.i));
            }

            return Array.from(ids).filter((id) => !hiddenWidgets.includes(id));
        }, [layouts, hiddenWidgets]);

        // Show skeleton until layout is ready to prevent flickering
        if (isLoading || !isLayoutReady || !layouts) return <Skeleton className="h-[800px] w-full" />;

        // Create layouts with static property based on editing state
        const layoutsWithStatic: Layouts = {};
        Object.keys(layouts).forEach(bp => {
            const bpLayout = layouts[bp as Breakpoint];
            if (bpLayout) {
                layoutsWithStatic[bp] = bpLayout.map(item => ({
                    ...item,
                    static: !isEditing,
                })) as InternalLayout[];
            }
        });

        return (
            <div className="space-y-4">
                {/* Hidden Widgets Section - Only visible in edit mode */}
                {isEditing && hiddenWidgets.length > 0 && (
                    <div className="space-y-4 mb-6">
                        <div className="flex items-center gap-2">
                            <div className="h-px bg-border flex-1"></div>
                            <h3 className="text-sm font-medium text-muted-foreground px-2 whitespace-nowrap">
                                Hidden Widgets
                            </h3>
                            <div className="h-px bg-border flex-1"></div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                            {hiddenWidgets.map((widgetId) => {
                                const child = getChild(widgetId);
                                if (!child) return null;

                                // Get better display name for widgets
                                const getDisplayName = (id: string) => {
                                    const names: Record<string, string> = {
                                        totalBalance: 'Total Balance',
                                        monthlyIncome: 'Monthly Income',
                                        monthlyExpenses: 'Monthly Expenses',
                                        debts: 'Debts',
                                        credits: 'Credits',
                                        deposits: 'Deposits',
                                        mortgages: 'Mortgages',
                                        recentTransactions: 'Recent Transactions',
                                        subscriptions: 'Subscriptions',
                                        spendingChart: 'Spending Chart',
                                        categoryChart: 'Category Chart',
                                        currencyExchange: 'Currency Exchange',
                                        investmentPortfolio: 'Investment Portfolio',
                                        investmentPerformance: 'Investment Performance',
                                        assetAllocation: 'Asset Allocation'
                                    };
                                    return names[id] || id.replace(/([A-Z])/g, ' $1').trim();
                                };

                                // Get widget icon/color for better visual indication
                                const getWidgetIcon = (id: string) => {
                                    const icons: Record<string, string> = {
                                        totalBalance: '💰',
                                        monthlyIncome: '📈',
                                        monthlyExpenses: '📉',
                                        debts: '💸',
                                        credits: '💳',
                                        deposits: '🏦',
                                        mortgages: '🏠',
                                        recentTransactions: '💳',
                                        subscriptions: '🔄',
                                        spendingChart: '📊',
                                        categoryChart: '🥧',
                                        currencyExchange: '💱',
                                        investmentPortfolio: '📁',
                                        investmentPerformance: '📈',
                                        assetAllocation: '🥧'
                                    };
                                    return icons[id] || '📋';
                                };

                                return (
                                    <div
                                        key={widgetId}
                                        className="group relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/20 bg-gradient-to-br from-muted/20 to-muted/5 hover:border-muted-foreground/40 hover:from-muted/30 hover:to-muted/10 transition-all duration-200 cursor-pointer"
                                        onClick={() => handleShowWidget(widgetId)}
                                    >
                                        <div className="p-4 flex flex-col items-center justify-center text-center min-h-[80px]">
                                            <div className="text-2xl mb-2 opacity-60 group-hover:opacity-80 transition-opacity">
                                                {getWidgetIcon(widgetId)}
                                            </div>
                                            <div className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2">
                                                {getDisplayName(widgetId)}
                                            </div>
                                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background rounded-md"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleShowWidget(widgetId);
                                            }}
                                        >
                                            <Eye className="h-3 w-3" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <ResponsiveGridLayout
                    className={`layout ${isEditing ? 'is-editing' : ''}`}
                    layouts={layoutsWithStatic}
                    breakpoints={BREAKPOINTS}
                    cols={COLS}
                    measureBeforeMount
                    rowHeight={currentBreakpoint === 'xs' ? 36 : currentBreakpoint === 'sm' ? 40 : 100}
                    isDraggable={isEditing}
                    isResizable={isEditing}
                    onLayoutChange={onLayoutChange}
                    onBreakpointChange={onBreakpointChange}
                    onWidthChange={(width: number) => {
                        const bp = getBreakpointFromWidth(width);
                        if (bp !== currentBreakpoint) {
                            setCurrentBreakpoint(bp);
                        }
                    }}
                    margin={currentBreakpoint === 'xs' ? [4, 4] : currentBreakpoint === 'sm' ? [6, 6] : [16, 16]}
                    containerPadding={[0, 0]}
                    draggableHandle=".drag-handle"
                    draggableCancel=".no-drag"
                    compactType="vertical"
                    preventCollision={false}
                    useCSSTransforms={true}
                    transformScale={1}
                >
                    {visibleWidgetIds.map((widgetId) => {
                        const child = getChild(widgetId);
                        if (!child) return null;

                        const layoutItem =
                            (layouts[currentBreakpoint] || layouts.lg || []).find((item) => item.i === widgetId) ||
                            (layouts.lg || []).find((item) => item.i === widgetId);

                        // Pass grid item dimensions to child
                        const childWithProps = React.isValidElement(child)
                            ? React.cloneElement(child as React.ReactElement, {
                                gridParams: { w: layoutItem?.w ?? 1, h: layoutItem?.h ?? 1, breakpoint: currentBreakpoint }
                            })
                            : child;

                        return (
                            <div key={widgetId} className={isEditing ? "border-2 border-dashed border-primary/50 rounded-lg relative bg-background/50" : "relative"}>
                                <div className="no-drag h-full w-full rounded-lg">
                                    {childWithProps}
                                    {isEditing && (
                                        <div
                                            className="absolute inset-0 z-40 bg-transparent"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                        />
                                    )}
                                </div>
                                {isEditing && (
                                    <>
                                        <div className="drag-handle absolute top-0 left-0 right-0 h-8 bg-primary/5 cursor-move rounded-t-lg z-[41] flex items-center justify-center">
                                            <div className="w-12 h-1.5 bg-primary/30 rounded-full" />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 absolute right-0.5 top-0 text-muted-foreground hover:text-destructive transition-colors z-[42]"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleHideWidget(widgetId);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>
            </div>
        );
    });
