import React from 'react';
import { motion } from 'framer-motion';
import { 
    DollarSign, 
    Landmark, 
    Banknote, 
    Coins, 
    TrendingUp, 
    Wallet
} from 'lucide-react';

const icons = [
    { 
        Icon: DollarSign, 
        size: 60, 
        top: '15%', 
        left: '10%', 
        blur: 'blur-3xl', 
        opacity: 0.05, 
        floatY: [0, -15, 0], 
        duration: 20, 
        delay: 0 
    },
    { 
        Icon: Landmark, 
        size: 80, 
        top: '20%', 
        left: '85%', 
        blur: 'blur-2xl', 
        opacity: 0.08, 
        floatY: [0, 20, 0], 
        duration: 25, 
        delay: 2 
    },
    { 
        Icon: Banknote, 
        size: 70, 
        top: '65%', 
        left: '5%', 
        blur: 'blur-2xl', 
        opacity: 0.07, 
        floatY: [0, -25, 0], 
        duration: 22, 
        delay: 1 
    },
    { 
        Icon: Coins, 
        size: 50, 
        top: '10%', 
        left: '65%', 
        blur: 'blur-xl', 
        opacity: 0.1, 
        floatY: [0, 15, 0], 
        duration: 18, 
        delay: 3 
    },
    { 
        Icon: TrendingUp, 
        size: 90, 
        top: '80%', 
        left: '90%', 
        blur: 'blur-2xl', 
        opacity: 0.06, 
        floatY: [0, -20, 0], 
        duration: 28, 
        delay: 0.5 
    },
    { 
        Icon: Wallet, 
        size: 65, 
        top: '45%', 
        left: '8%', 
        blur: 'blur-xl', 
        opacity: 0.09, 
        floatY: [0, 25, 0], 
        duration: 24, 
        delay: 4 
    },
    { 
        Icon: DollarSign, 
        size: 55, 
        top: '85%', 
        left: '15%', 
        blur: 'blur-xl', 
        opacity: 0.11, 
        floatY: [0, -18, 0], 
        duration: 21, 
        delay: 2.5 
    },
    { 
        Icon: Banknote, 
        size: 75, 
        top: '40%', 
        left: '88%', 
        blur: 'blur-2xl', 
        opacity: 0.08, 
        floatY: [0, 18, 0], 
        duration: 26, 
        delay: 1.5 
    },
];

export function FloatingIcons() {
    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {icons.map((item, index) => (
                <motion.div
                    key={index}
                    className={`absolute text-foreground ${item.blur}`}
                    style={{
                        top: item.top,
                        left: item.left,
                        opacity: item.opacity,
                        transform: 'translate(-50%, -50%)',
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ 
                        opacity: [0, item.opacity, item.opacity, 0],
                        scale: [0, 1, 1, 0],
                        y: item.floatY,
                    }}
                    transition={{
                        opacity: {
                            duration: item.duration,
                            repeat: Infinity,
                            repeatType: "loop",
                            delay: item.delay,
                            times: [0, 0.1, 0.9, 1],
                        },
                        scale: {
                            duration: item.duration,
                            repeat: Infinity,
                            repeatType: "loop",
                            delay: item.delay,
                            times: [0, 0.1, 0.9, 1],
                        },
                        y: {
                            duration: item.duration,
                            repeat: Infinity,
                            repeatType: "loop",
                            delay: item.delay,
                            ease: "easeInOut",
                        }
                    }}
                >
                    <item.Icon size={item.size} />
                </motion.div>
            ))}
        </div>
    );
}

export default FloatingIcons;
