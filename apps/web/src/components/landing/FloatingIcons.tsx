import React from 'react';
import { motion } from 'motion/react';
import { DollarSign, Landmark, Banknote, Coins, TrendingUp, Wallet } from 'lucide-react';

const icons = [
    { Icon: DollarSign, size: 80, top: '10%', left: '15%', blur: 'blur-[1px]', opacity: 0.15, delay: 0 },
    { Icon: Landmark, size: 120, top: '25%', left: '80%', blur: 'blur-[2px]', opacity: 0.12, delay: 1 },
    { Icon: Banknote, size: 100, top: '60%', left: '10%', blur: 'blur-[1px]', opacity: 0.14, delay: 2 },
    { Icon: Coins, size: 70, top: '15%', left: '70%', blur: 'blur-[1px]', opacity: 0.18, delay: 0.5 },
    { Icon: TrendingUp, size: 140, top: '75%', left: '85%', blur: 'blur-[2px]', opacity: 0.1, delay: 1.5 },
    { Icon: Wallet, size: 90, top: '45%', left: '5%', blur: 'blur-[1px]', opacity: 0.13, delay: 2.5 },
    { Icon: DollarSign, size: 75, top: '85%', left: '20%', blur: 'blur-[1px]', opacity: 0.16, delay: 3 },
    { Icon: Banknote, size: 110, top: '40%', left: '90%', blur: 'blur-[2px]', opacity: 0.14, delay: 0.8 },
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
                    }}
                    initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
                    animate={{
                        opacity: item.opacity,
                        scale: 1,
                        y: [0, -30, 0],
                        rotate: [0, 360],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        repeatType: "loop",
                        delay: item.delay,
                        ease: "linear",
                    }}
                >
                    <item.Icon size={item.size} />
                </motion.div>
            ))}
        </div>
    );
}

export default FloatingIcons;
