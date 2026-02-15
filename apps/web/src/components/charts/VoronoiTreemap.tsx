import React, { useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

// ─── Types ──────────────────────────────────────────────────────────────────────
type Point = [number, number];
type Polygon = Point[];

export interface VoronoiDataItem {
    name: string;
    /** Optional full name (e.g. "NVIDIA Corporation") */
    fullName?: string;
    value: number;
    /** Pre-formatted value string for display (e.g. "$1,823") */
    formattedValue?: string;
    color: string;
    percentage: number;
}

interface VoronoiTile extends VoronoiDataItem {
    polygon: Polygon;
    centroid: Point;
    area: number;
}

interface VoronoiTreemapProps {
    data: VoronoiDataItem[];
    className?: string;
    /** Size in internal SVG units (viewBox). Larger = more precise polygons. */
    resolution?: number;
    /** Corner rounding radius in SVG units */
    cornerRadius?: number;
    /** Show ticker labels on tiles */
    showLabels?: boolean;
    /** Show percentage on tiles */
    showPercentage?: boolean;
    /** Max items to show (extras are grouped into "Other"). Default 12. */
    maxItems?: number;
    onHover?: (item: VoronoiDataItem | null) => void;
    onClick?: (item: VoronoiDataItem) => void;
}

// ─── Polygon Maths ──────────────────────────────────────────────────────────────

/** Sutherland-Hodgman clip: keep the half where (p − linePoint)·normal ≥ 0 */
function clipByLine(polygon: Polygon, lp: Point, ln: Point): Polygon {
    if (polygon.length < 3) return [];
    const out: Polygon = [];
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
        const c = polygon[i];
        const nx = polygon[(i + 1) % n];
        const dc = (c[0] - lp[0]) * ln[0] + (c[1] - lp[1]) * ln[1];
        const dn = (nx[0] - lp[0]) * ln[0] + (nx[1] - lp[1]) * ln[1];
        if (dc >= 0) {
            out.push(c);
            if (dn < 0) {
                const t = dc / (dc - dn);
                out.push([c[0] + t * (nx[0] - c[0]), c[1] + t * (nx[1] - c[1])]);
            }
        } else if (dn >= 0) {
            const t = dc / (dc - dn);
            out.push([c[0] + t * (nx[0] - c[0]), c[1] + t * (nx[1] - c[1])]);
        }
    }
    return out;
}

/** Shoelace area */
function area(p: Polygon): number {
    if (p.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        a += p[i][0] * p[j][1] - p[j][0] * p[i][1];
    }
    return Math.abs(a) / 2;
}

/** Polygon centroid */
function centroid(p: Polygon): Point {
    if (p.length < 3) return [0, 0];
    let cx = 0,
        cy = 0,
        a = 0;
    for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        const cr = p[i][0] * p[j][1] - p[j][0] * p[i][1];
        cx += (p[i][0] + p[j][0]) * cr;
        cy += (p[i][1] + p[j][1]) * cr;
        a += cr;
    }
    a /= 2;
    if (Math.abs(a) < 1e-10) {
        return [p.reduce((s, v) => s + v[0], 0) / p.length, p.reduce((s, v) => s + v[1], 0) / p.length];
    }
    return [cx / (6 * a), cy / (6 * a)];
}

// ─── Power-Diagram Voronoi Treemap ──────────────────────────────────────────────

function computePowerCells(sites: Point[], weights: number[], w: number, h: number): Polygon[] {
    const box: Polygon = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
    ];
    return sites.map((si, i) => {
        let cell: Polygon = box.map((p) => [p[0], p[1]] as Point);
        for (let j = 0; j < sites.length; j++) {
            if (i === j) continue;
            const sj = sites[j];
            const dx = sj[0] - si[0];
            const dy = sj[1] - si[1];
            const d2 = dx * dx + dy * dy;
            if (d2 < 1e-12) continue;
            // Power bisector: parameter t along si→sj where the bisector crosses
            const t = 0.5 + (weights[i] - weights[j]) / (2 * d2);
            const lp: Point = [si[0] + t * dx, si[1] + t * dy];
            const ln: Point = [-dx, -dy]; // normal toward si
            cell = clipByLine(cell, lp, ln);
            if (cell.length < 3) return [];
        }
        return cell;
    });
}

/** Seeded LCG PRNG */
function rng(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function solve(values: number[], w: number, h: number, iters = 80): Polygon[] {
    const n = values.length;
    if (n === 0) return [];
    if (n === 1)
        return [
            [
                [0, 0],
                [w, 0],
                [w, h],
                [0, h],
            ],
        ];

    const tot = values.reduce((s, v) => s + v, 0);
    const totalArea = w * h;
    const target = values.map((v) => (v / tot) * totalArea);

    const rand = rng(42);
    const ga = Math.PI * (3 - Math.sqrt(5)); // golden angle

    // Sort by value (largest first) for initial placement
    const order = values
        .map((v, i) => ({ v, i }))
        .sort((a, b) => b.v - a.v);

    const sites: Point[] = new Array(n);
    for (let k = 0; k < n; k++) {
        const r = Math.sqrt((k + 0.5) / n) * Math.min(w, h) * 0.38;
        const theta = k * ga;
        sites[order[k].i] = [
            w / 2 + r * Math.cos(theta) + (rand() - 0.5) * w * 0.06,
            h / 2 + r * Math.sin(theta) + (rand() - 0.5) * h * 0.06,
        ];
    }

    // Clamp
    const margin = 4;
    for (let i = 0; i < n; i++) {
        sites[i][0] = Math.max(margin, Math.min(w - margin, sites[i][0]));
        sites[i][1] = Math.max(margin, Math.min(h - margin, sites[i][1]));
    }

    const weights = new Array(n).fill(0);

    for (let it = 0; it < iters; it++) {
        const cells = computePowerCells(sites, weights, w, h);
        const progress = it / iters;

        for (let i = 0; i < n; i++) {
            if (cells[i].length < 3) continue;
            const a = area(cells[i]);
            const c = centroid(cells[i]);

            // Lloyd relaxation
            const speed = 0.7 * (1 - progress * 0.4);
            sites[i][0] += (c[0] - sites[i][0]) * speed;
            sites[i][1] += (c[1] - sites[i][1]) * speed;

            // Weight adjustment for area matching
            if (a > 1e-6) {
                const ratio = target[i] / a;
                weights[i] += (ratio - 1) * 10;
            }

            sites[i][0] = Math.max(margin, Math.min(w - margin, sites[i][0]));
            sites[i][1] = Math.max(margin, Math.min(h - margin, sites[i][1]));
        }
    }

    return computePowerCells(sites, weights, w, h);
}

// ─── SVG Path with Rounded Corners ──────────────────────────────────────────────

function roundedPath(verts: Polygon, r: number): string {
    const n = verts.length;
    if (n < 3) return '';
    const parts: string[] = [];

    for (let i = 0; i < n; i++) {
        const prev = verts[(i - 1 + n) % n];
        const curr = verts[i];
        const next = verts[(i + 1) % n];

        let dx1 = prev[0] - curr[0],
            dy1 = prev[1] - curr[1];
        let dx2 = next[0] - curr[0],
            dy2 = next[1] - curr[1];
        const len1 = Math.hypot(dx1, dy1);
        const len2 = Math.hypot(dx2, dy2);
        if (len1 < 1e-6 || len2 < 1e-6) continue;

        const cr = Math.min(r, len1 / 3, len2 / 3);
        dx1 /= len1;
        dy1 /= len1;
        dx2 /= len2;
        dy2 /= len2;

        const p1x = curr[0] + dx1 * cr;
        const p1y = curr[1] + dy1 * cr;
        const p2x = curr[0] + dx2 * cr;
        const p2y = curr[1] + dy2 * cr;

        if (i === 0) parts.push(`M${p1x.toFixed(1)},${p1y.toFixed(1)}`);
        else parts.push(`L${p1x.toFixed(1)},${p1y.toFixed(1)}`);

        parts.push(`Q${curr[0].toFixed(1)},${curr[1].toFixed(1)},${p2x.toFixed(1)},${p2y.toFixed(1)}`);
    }

    parts.push('Z');
    return parts.join('');
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function VoronoiTreemap({
    data,
    className,
    resolution = 300,
    cornerRadius = 10,
    showLabels = true,
    showPercentage = true,
    maxItems = 12,
    onHover,
    onClick,
}: VoronoiTreemapProps) {
    const [hovered, setHovered] = useState<number | null>(null);
    const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const S = resolution;
    const PAD = 8; // padding so glow/shadow never clips

    // Cap data at maxItems, grouping the tail into "Other"
    const cappedData = useMemo(() => {
        if (data.length <= maxItems) return data;
        const top = data.slice(0, maxItems - 1);
        const rest = data.slice(maxItems - 1);
        const otherValue = rest.reduce((s, d) => s + d.value, 0);
        const otherPct = rest.reduce((s, d) => s + d.percentage, 0);
        top.push({
            name: 'Other',
            fullName: `${rest.length} more stocks`,
            value: otherValue,
            percentage: otherPct,
            color: '#666',
        });
        return top;
    }, [data, maxItems]);

    const tiles = useMemo<VoronoiTile[]>(() => {
        if (cappedData.length === 0) return [];
        const polys = solve(
            cappedData.map((d) => d.value),
            S,
            S,
        );
        return cappedData.map((d, i) => ({
            ...d,
            polygon: polys[i] ?? [],
            centroid: polys[i]?.length >= 3 ? centroid(polys[i]) : ([S / 2, S / 2] as Point),
            area: polys[i]?.length >= 3 ? area(polys[i]) : 0,
        }));
    }, [cappedData, S]);

    const enter = useCallback(
        (i: number) => {
            setHovered(i);
            onHover?.(tiles[i] ?? null);
        },
        [tiles, onHover],
    );

    const leave = useCallback(() => {
        setHovered(null);
        setMouse(null);
        onHover?.(null);
    }, [onHover]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setMouse({ x: e.clientX, y: e.clientY });
    }, []);

    if (tiles.length === 0) return null;

    const totalArea = S * S;
    const hoveredTile = hovered !== null ? tiles[hovered] : null;

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ position: 'relative', width: '100%', height: '100%', padding: PAD }}
            onMouseMove={handleMouseMove}
            onMouseLeave={leave}
        >
            <svg
                viewBox={`0 0 ${S} ${S}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'visible' }}
            >
                <defs>
                    <filter id="vtm-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="b" />
                        <feComposite in="SourceGraphic" in2="b" operator="over" />
                    </filter>
                    <filter id="vtm-text-shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.6" />
                    </filter>
                </defs>

                {tiles.map((t, i) => {
                    if (t.polygon.length < 3) return null;
                    const path = roundedPath(t.polygon, cornerRadius);
                    const isHot = hovered === i;
                    const frac = t.area / totalArea;
                    const canLabel = showLabels && frac > 0.05;
                    const canPct = showPercentage && frac > 0.07;

                    const cellSz = Math.sqrt(t.area);
                    const fs = Math.max(11, Math.min(22, cellSz * 0.17));

                    return (
                        <g
                            key={t.name}
                            onMouseEnter={() => enter(i)}
                            onMouseLeave={leave}
                            onClick={() => onClick?.(t)}
                            style={{ cursor: 'pointer' }}
                        >
                            <path
                                d={path}
                                fill={t.color}
                                fillOpacity={isHot ? 1 : 0.85}
                                stroke="rgba(255,255,255,0.22)"
                                strokeWidth={2.8}
                                strokeLinejoin="round"
                                style={{
                                    transition: 'fill-opacity 0.2s ease',
                                    filter: isHot ? 'url(#vtm-glow)' : undefined,
                                }}
                            />

                            {canLabel && (
                                <text
                                    x={t.centroid[0]}
                                    y={t.centroid[1] - (canPct ? fs * 0.4 : 0)}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="white"
                                    fontWeight="700"
                                    fontSize={fs}
                                    filter="url(#vtm-text-shadow)"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {t.name}
                                </text>
                            )}
                            {canPct && (
                                <text
                                    x={t.centroid[0]}
                                    y={t.centroid[1] + fs * 0.65}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="rgba(255,255,255,0.78)"
                                    fontWeight="500"
                                    fontSize={fs * 0.72}
                                    filter="url(#vtm-text-shadow)"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {t.percentage.toFixed(1)}%
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* HTML Tooltip via Portal — renders above everything */}
            {hoveredTile && mouse && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        left: mouse.x + 14,
                        top: mouse.y - 14,
                        pointerEvents: 'none',
                        zIndex: 99999,
                        transform: 'translateY(-100%)',
                    }}
                >
                    <div
                        style={{
                            background: 'rgba(15, 15, 20, 0.92)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10,
                            padding: '10px 14px',
                            minWidth: 140,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 3,
                                    backgroundColor: hoveredTile.color,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                                {hoveredTile.name}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, marginLeft: 'auto' }}>
                                {hoveredTile.percentage.toFixed(1)}%
                            </span>
                        </div>
                        {hoveredTile.fullName && (
                            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 4, lineHeight: 1.3 }}>
                                {hoveredTile.fullName}
                            </div>
                        )}
                        {hoveredTile.formattedValue && (
                            <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: 600 }}>
                                {hoveredTile.formattedValue}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
