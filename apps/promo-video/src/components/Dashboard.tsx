import { AbsoluteFill, interpolate, useCurrentFrame, SPRING_CONFIG_HARMONY, spring, useVideoConfig } from 'remotion';
import { LayoutDashboard, CreditCard, PieChart, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export const Dashboard: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const entrance = spring({
        frame,
        fps,
        config: SPRING_CONFIG_HARMONY,
    });

    const itemDelay = 5;
    const item1 = spring({ frame: frame - itemDelay * 0, fps, config: SPRING_CONFIG_HARMONY });
    const item2 = spring({ frame: frame - itemDelay * 1, fps, config: SPRING_CONFIG_HARMONY });
    const item3 = spring({ frame: frame - itemDelay * 2, fps, config: SPRING_CONFIG_HARMONY });

    return (
        <AbsoluteFill className="bg-slate-50 text-slate-900 p-8">
            <div className="flex h-full gap-8">
                {/* Sidebar */}
                <div style={{ transform: `translateX(${(entrance - 1) * 100}px)` }} className="w-64 bg-white rounded-3xl shadow-sm p-6 flex flex-col gap-4 border border-slate-100">
                    <div className="text-2xl font-bold text-blue-600 mb-8 flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg"></div> Woolet
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-blue-50 text-blue-600 rounded-xl font-medium cursor-pointer">
                        <LayoutDashboard size={20} /> Dashboard
                    </div>
                    <div className="flex items-center gap-3 p-3 text-slate-500 rounded-xl font-medium">
                        <CreditCard size={20} /> Transactions
                    </div>
                    <div className="flex items-center gap-3 p-3 text-slate-500 rounded-xl font-medium">
                        <PieChart size={20} /> Investments
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col gap-8">
                    {/* Header */}
                    <div style={{ opacity: entrance, transform: `translateY(${(1 - entrance) * 20}px)` }} className="flex justify-between items-center">
                        <h2 className="text-3xl font-bold">Dashboard</h2>
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-200"></div>
                        </div>
                    </div>

                    {/* Cards */}
                    <div className="grid grid-cols-3 gap-6">
                        <div style={{ opacity: item1, transform: `scale(${item1})` }} className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg">
                            <div className="text-slate-400 mb-2">Total Balance</div>
                            <div className="text-4xl font-bold mb-4">$124,500.00</div>
                            <div className="flex items-center text-green-400 text-sm gap-1">
                                <ArrowUpRight size={16} /> +2.4% this month
                            </div>
                        </div>
                        <div style={{ opacity: item2, transform: `scale(${item2})` }} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                            <div className="text-slate-500 mb-2">Income</div>
                            <div className="text-4xl font-bold text-slate-900 mb-4">$8,250</div>
                            <div className="flex items-center text-green-600 text-sm gap-1">
                                <ArrowUpRight size={16} /> +12% vs last month
                            </div>
                        </div>
                        <div style={{ opacity: item3, transform: `scale(${item3})` }} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                            <div className="text-slate-500 mb-2">Expenses</div>
                            <div className="text-4xl font-bold text-slate-900 mb-4">$3,400</div>
                            <div className="flex items-center text-red-500 text-sm gap-1">
                                <ArrowDownLeft size={16} /> -5% vs last month
                            </div>
                        </div>
                    </div>

                    {/* Chart Area Mock */}
                    <div style={{ opacity: item3, transform: `translateY(${(1 - item3) * 50}px)` }} className="bg-white flex-1 rounded-3xl shadow-sm border border-slate-100 p-8 flex items-end gap-4">
                        {[40, 60, 45, 70, 55, 80, 65, 90, 75, 50, 60, 85].map((h, i) => (
                            <div key={i} className="flex-1 bg-blue-100 rounded-t-xl relative overflow-hidden group hover:bg-blue-200 transition-colors" style={{ height: `${h}%` }}>
                                <div className="absolute bottom-0 left-0 w-full bg-blue-600 rounded-t-xl transition-all duration-1000" style={{ height: `${h * item3}%` }}></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    );
};
