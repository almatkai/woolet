import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { ArrowDownLeft, ArrowUpRight, ShoppingBag, Coffee, Home, Zap } from 'lucide-react';

export const Transactions: React.FC = () => {
    const frame = useCurrentFrame();

    // Scrolling effect
    const scrollY = interpolate(frame, [0, 150], [0, -600], { extrapolateRight: 'clamp' });

    const transactions = [
        { title: 'Grocery Store', cat: 'Food', amount: '-$125.40', icon: ShoppingBag, color: 'text-orange-500', bg: 'bg-orange-50' },
        { title: 'Starbucks', cat: 'Dining', amount: '-$5.60', icon: Coffee, color: 'text-brown-500', bg: 'bg-yellow-50' },
        { title: 'Salary Deposit', cat: 'Income', amount: '+$4,250.00', icon: ArrowDownLeft, color: 'text-green-500', bg: 'bg-green-50', income: true },
        { title: 'Electric Bill', cat: 'Utilities', amount: '-$145.00', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-50' },
        { title: 'Rent Payment', cat: 'Housing', amount: '-$2,100.00', icon: Home, color: 'text-blue-500', bg: 'bg-blue-50' },
        { title: 'Netflix', cat: 'Entertainment', amount: '-$15.99', icon: Zap, color: 'text-red-500', bg: 'bg-red-50' },
        { title: 'Uber', cat: 'Transport', amount: '-$24.50', icon: ShoppingBag, color: 'text-slate-500', bg: 'bg-slate-50' },
        { title: 'Spotify', cat: 'Entertainment', amount: '-$9.99', icon: Zap, color: 'text-green-500', bg: 'bg-green-50' },
        { title: 'Freelance Work', cat: 'Income', amount: '+$850.00', icon: ArrowDownLeft, color: 'text-green-500', bg: 'bg-green-50', income: true },
    ];

    return (
        <AbsoluteFill className="bg-slate-50 flex items-center justify-center">
            <div className="w-[600px] h-[800px] bg-white rounded-[3rem] shadow-2xl border-8 border-slate-900 overflow-hidden relative">
                {/* Mock Phone Status Bar */}
                <div className="absolute top-0 w-full h-8 bg-slate-900 z-10"></div>

                <div className="pt-12 px-8 pb-8">
                    <h2 className="text-3xl font-bold mb-6">Recent Activity</h2>

                    <div className="h-[700px] overflow-hidden relative">
                        <div style={{ transform: `translateY(${scrollY}px)` }} className="flex flex-col gap-4">
                            {[...transactions, ...transactions].map((t, i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-50 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 ${t.bg} rounded-full flex items-center justify-center ${t.color}`}>
                                            <t.icon size={20} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">{t.title}</div>
                                            <div className="text-sm text-slate-500">{t.cat}</div>
                                        </div>
                                    </div>
                                    <div className={`font-bold ${t.income ? 'text-green-600' : 'text-slate-900'}`}>{t.amount}</div>
                                </div>
                            ))}
                        </div>
                        {/* Gradient overlay for fade out */}
                        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    );
};
