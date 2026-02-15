import React, { useEffect, useMemo, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipData {
    name: string;
    value: number;
    color?: string;
    [key: string]: any;
}

/** Compute relative luminance from a hex color (0 = black, 1 = white) */
function getLuminance(hex: string): number {
    const h = hex.replace('#', '');
    const normalized = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    if (normalized.length !== 6) return 0.5;
    const r = parseInt(normalized.substring(0, 2), 16) / 255;
    const g = parseInt(normalized.substring(2, 4), 16) / 255;
    const b = parseInt(normalized.substring(4, 6), 16) / 255;
    const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Ensure accent color is readable: brighten near-black colors in dark mode, darken near-white in light mode */
function getReadableAccent(color: string): string {
    if (!color || !color.startsWith('#')) return color;
    const isDark = document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('super-dark');
    const lum = getLuminance(color);
    if (isDark && lum < 0.08) return '#e2e8f0'; // near-black → swap to light gray
    if (!isDark && lum > 0.9) return '#334155'; // near-white → swap to dark gray
    return color;
}

const withAlpha = (color: string, alpha: number) => {
    if (!color) return `rgba(99, 102, 241, ${alpha})`;
    if (!color.startsWith('#')) return color;

    const hex = color.slice(1);
    const normalized = hex.length === 3
        ? hex.split('').map((c) => c + c).join('')
        : hex;
    if (normalized.length !== 6) return color;

    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface TooltipProProps {
    data?: TooltipData[];
    children: ReactNode;
    formatValue?: (value: number) => string;
    showPercentage?: boolean;
    className?: string;
}

interface UseTooltipProReturn {
    hoveredItem: TooltipData | null;
    selectedItem: TooltipData | null;
    showMobileTooltip: boolean;
    isTouchDevice: boolean;
    mousePos: { x: number; y: number };
    handleMouseMove: (event: React.MouseEvent) => void;
    handleMouseLeave: () => void;
    handleItemHover: (item: TooltipData | null) => void;
    handleItemClick: (item: TooltipData) => void;
    renderTooltip: () => React.ReactNode;
}

// Hook for using tooltip functionality
export function useTooltipPro(data: TooltipData[] = [], formatValue?: (value: number) => string, showPercentage = false): UseTooltipProReturn {
    const [hoveredItem, setHoveredItem] = useState<TooltipData | null>(null);
    const [selectedItem, setSelectedItem] = useState<TooltipData | null>(null);
    const [showMobileTooltip, setShowMobileTooltip] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const handle = setTimeout(() => {
            if (typeof window === 'undefined') return;
            const hasTouchPoints = navigator.maxTouchPoints > 0;
            const hasCoarsePointer = typeof window.matchMedia === 'function'
                ? window.matchMedia('(any-pointer: coarse)').matches
                : false;
            const noHover = typeof window.matchMedia === 'function'
                ? window.matchMedia('(hover: none)').matches
                : false;
            setIsTouchDevice(hasTouchPoints && (hasCoarsePointer || noHover));
            setPortalTarget(document.body);
        }, 0);
        return () => clearTimeout(handle);
    }, []);

    const total = useMemo(() => {
        return data.reduce((sum, item) => sum + (item.value || 0), 0);
    }, [data]);

    const defaultFormatValue = useMemo(() => {
        return (amount: number) =>
            new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 2,
            }).format(amount || 0);
    }, []);

    const valueFormatter = formatValue || defaultFormatValue;

    const handleMouseMove = (event: React.MouseEvent) => {
        if (isTouchDevice) return;
        const nextX = Math.min(event.clientX + 12, window.innerWidth - 140);
        const nextY = Math.min(event.clientY + 12, window.innerHeight - 84);
        setMousePos({
            x: Math.max(8, nextX),
            y: Math.max(8, nextY),
        });
    };

    const handleMouseLeave = () => {
        if (isTouchDevice) return;
        setHoveredItem(null);
    };

    const handleItemHover = (item: TooltipData | null) => {
        if (isTouchDevice) return;
        setHoveredItem(item);
    };

    const handleItemClick = (item: TooltipData) => {
        if (!isTouchDevice) return;
        setSelectedItem(item);
        setShowMobileTooltip(true);
    };

    // Close mobile tooltip when clicking elsewhere
    useEffect(() => {
        const handleClickOutside = () => {
            setShowMobileTooltip(false);
        };

        if (showMobileTooltip) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [showMobileTooltip]);

    const renderTooltip = () => {
        if (!portalTarget) return null;

        return createPortal(
            <>
                {/* Custom cursor-following tooltip */}
                {!isTouchDevice && hoveredItem && (() => {
                    const accent = hoveredItem.color || '#6366f1';
                    const readableAccent = getReadableAccent(accent);
                    return (
                        <div
                            className="fixed rounded-xl border bg-background/70 backdrop-blur-xl px-2.5 py-1.5 z-[9999] pointer-events-none shadow-2xl ring-1 ring-white/10 min-w-[110px]"
                            style={{
                                left: mousePos.x,
                                top: mousePos.y,
                                borderColor: withAlpha(readableAccent, 0.7),
                                boxShadow: `0 0 0 1px ${withAlpha(readableAccent, 0.25)}`,
                            }}
                        >
                            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5 line-clamp-1 flex items-center gap-1">
                                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                                {hoveredItem.name}
                            </div>
                            <div className="text-sm font-bold" style={{ color: readableAccent }}>
                                {valueFormatter(hoveredItem.value)}
                            </div>
                            {showPercentage && total > 0 && (
                                <div className="text-[8px] text-muted-foreground mt-0.5">
                                    {((hoveredItem.value / total) * 100).toFixed(1)}%
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Mobile tooltip */}
                {isTouchDevice && showMobileTooltip && selectedItem && (() => {
                    const accent = selectedItem.color || '#6366f1';
                    const readableAccent = getReadableAccent(accent);
                    return (
                        <div
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl border bg-background/70 backdrop-blur-xl px-4 py-2 z-[9999] shadow-2xl ring-1 ring-white/10 whitespace-nowrap"
                            style={{ borderColor: withAlpha(readableAccent, 0.7) }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="font-bold text-sm flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                                {selectedItem.name}
                            </div>
                            <div className="text-sm font-medium" style={{ color: readableAccent }}>
                                {valueFormatter(selectedItem.value)}
                            </div>
                            {showPercentage && total > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    {((selectedItem.value / total) * 100).toFixed(1)}%
                                </div>
                            )}
                        </div>
                    );
                })()}
            </>,
            portalTarget
        );
    };

    return {
        hoveredItem,
        selectedItem,
        showMobileTooltip,
        isTouchDevice,
        mousePos,
        handleMouseMove,
        handleMouseLeave,
        handleItemHover,
        handleItemClick,
        renderTooltip,
    };
}

// Legacy component wrapper (kept for compatibility)
export function TooltipPro({
    data = [],
    children,
    formatValue,
    showPercentage = false,
    className = ""
}: TooltipProProps) {
    const tooltip = useTooltipPro(data, formatValue, showPercentage);

    return (
        <div
            className={`relative ${className}`}
            onMouseMove={tooltip.handleMouseMove}
            onMouseLeave={tooltip.handleMouseLeave}
        >
            {children}
            {tooltip.renderTooltip()}
        </div>
    );
}
