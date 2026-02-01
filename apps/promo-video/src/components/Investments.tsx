import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { TrendingUp, DollarSign } from 'lucide-react';

export const Investments: React.FC = () => {
    const frame = useCurrentFrame();
    const { width } = useVideoConfig();

    // Mock Chart Data Points
    const points = [
        100, 120, 115, 140, 135, 160, 150, 180, 200, 190, 220, 250
    ];

    // Create path from points
    const maxVal = Math.max(...points);
    const minVal = Math.min(...points);

    const pathD = points.map((p, i) => {
        const x = (i / (points.length - 1)) * 1400; // specific width for chart area
        const y = 600 - ((p - minVal) / (maxVal - minVal)) * 400;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    const progress = interpolate(frame, [0, 60], [0, 1], { extrapolateRight: 'clamp' });
    const dashOffset = interpolate(frame, [0, 60], [2000, 0], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill className="bg-slate-50 p-12">
            <h2 className="text-5xl font-bold text-slate-800 mb-12 flex items-center gap-4">
                <TrendingUp size={48} className="text-green-500" /> Investment Portfolio
            </h2>

            <div className="flex gap-12 h-full">
                {/* Chart Area */}
                <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 p-8 relative overflow-hidden">
                    <div className="absolute top-8 left-8">
                        <div className="text-slate-500 text-xl font-medium">Portfolio Value</div>
                        <div className="text-6xl font-bold text-slate-900 mt-2">$42,593.20</div>
                        <div className="text-green-500 font-medium mt-1">+15.4% All Time</div>
                    </div>

                    <div className="absolute bottom-0 left-0 w-full h-[600px] flex items-end justify-center">
                        <svg width="1400" height="600" className="opacity-90">
                            {/* Area gradient */}
                            <defs>
                                <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d={`${pathD} L 1400 600 L 0 600 Z`} fill="url(#gradient)" opacity={progress} />
                            {/* Line */}
                            <path d={pathD} fill="none" stroke="#16a34a" strokeWidth="6" strokeLinecap="round" strokeDasharray="2000" strokeDashoffset={dashOffset} />
                        </svg>
                    </div>
                </div>

                {/* Assets List */}
                <div className="w-96 flex flex-col gap-6">
                    {[
                        { sym: 'AAPL', name: 'Apple Inc.', price: '$185.92', change: '+1.2%', up: true },
                        { sym: 'NVDA', name: 'NVIDIA Corp.', price: '$485.09', change: '+3.4%', up: true },
                        { sym: 'TSLA', name: 'Tesla Inc.', price: '$235.40', change: '-0.8%', up: false },
                        { sym: 'BTC', name: 'Bitcoin', price: '$42,390', change: '+5.1%', up: true },
                    ].map((stock, i) => (
                        <div key={i} style={{ opacity: interpolate(frame, [30 + i * 10, 50 + i * 10], [0, 1]), transform: `translateX(${interpolate(frame, [30 + i * 10, 50 + i * 10], [50, 0])}px)` }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex gap-4 items-center">
                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-600 text-xs">{stock.sym}</div>
                                <div>
                                    <div className="font-bold text-slate-900">{stock.name}</div>
                                    <div className="text-slate-400 text-sm">Stock</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold">{stock.price}</div>
                                <div className={`text-sm ${stock.up ? 'text-green-500' : 'text-red-500'}`}>{stock.change}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </AbsoluteFill>
    );
};
