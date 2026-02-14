import { motion } from 'framer-motion';
import { MomoIcon } from './MomoIcon';
import { cn } from '@/lib/utils';

interface MomoIconWrapperProps {
    height?: string;
    width?: string;
    className?: string;
    iconClassName?: string;
    isHovered?: boolean;
    isPressed?: boolean;
    isAngry?: boolean;
    layoutId?: string;
}

export function MomoIconWrapper({
    height = "h-10",
    width = "w-10",
    className,
    iconClassName,
    isHovered = false,
    isPressed = false,
    isAngry = false,
    layoutId,
}: MomoIconWrapperProps) {
    return (
        <motion.div
            layoutId={layoutId}
            className={cn(
                "flex items-center justify-center bg-purple-500 rounded-xl",
                height,
                width,
                className
            )}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
            <MomoIcon
                className={cn("text-white", iconClassName)}
                isHovered={isHovered}
                isPressed={isPressed}
                isAngry={isAngry}
            />
        </motion.div>
    );
}
