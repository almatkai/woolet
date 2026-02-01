import { motion } from 'framer-motion';
import { Rectangles } from './ui/rectangles';
import { HeroBackground } from './ui/HeroBackground';

interface AuthLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
    return (
        <div className="min-h-screen w-full flex bg-background">
            {/* Left side - Hero Background animation showcase */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-background">
                {/* Hero Background */}
                <HeroBackground />

                {/* Content - centered */}
                <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
                    {/* Logo with Glow */}
                    <motion.div
                        className="mb-8"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                    >
                        <div className="relative group">
                            <div className="absolute inset-0 bg-white/20 blur-3xl rounded-full scale-150 group-hover:bg-white/30 transition-all duration-500" />
                            <img
                                src="/android-chrome-192x192.png"
                                alt="Woo-Let"
                                className="relative w-28 h-28 rounded-3xl shadow-2xl border border-white/10"
                            />
                        </div>
                    </motion.div>

                    <motion.h1
                        className="text-6xl font-bold text-white mb-4 text-center tracking-tight"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        Woo-Let
                    </motion.h1>

                    <motion.p
                        className="text-2xl text-slate-300 text-center max-w-lg mb-12 font-medium"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        Your all-in-one personal finance manager
                    </motion.p>

                    {/* Feature highlights */}
                    <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                        {[
                            { icon: '💰', text: 'Track Wealth' },
                            { icon: '📊', text: 'Analytics' },
                            { icon: '🎯', text: 'Money Goals' },
                            { icon: '🔒', text: 'Bank-grade' },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 hover:bg-white/5 transition-all duration-300"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 + i * 0.1 }}
                            >
                                <span className="text-2xl">{item.icon}</span>
                                <span className="text-white text-sm font-semibold tracking-wide uppercase">{item.text}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative bg-background overflow-hidden">
                {/* Decorative rectangles */}
                <Rectangles
                    mainRectSize={200}
                    mainRectOpacity={0.15}
                    numRects={5}
                    className="z-0"
                />
                {/* Mobile-only header */}
                <div className="absolute top-6 left-6 lg:hidden">
                    <div className="flex items-center gap-3">
                        <img
                            src="/android-chrome-192x192.png"
                            alt="Woo-Let"
                            className="w-10 h-10 rounded-xl"
                        />
                        <span className="text-xl font-bold text-white">Woo-Let</span>
                    </div>
                </div>

                <motion.div
                    className="relative z-10 w-full max-w-md mt-16 lg:mt-0"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {/* Form header */}
                    <div className="mb-8 text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
                        <p className="text-slate-400">{subtitle}</p>
                    </div>

                    {/* Form container */}
                    <div className="bg-card/80 backdrop-blur-xl rounded-2xl p-8 border border-border shadow-2xl">
                        {children}
                    </div>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <a
                            href="/"
                            className="text-sm text-slate-400 hover:text-white transition-colors duration-300 inline-flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to home
                        </a>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

export default AuthLayout;
