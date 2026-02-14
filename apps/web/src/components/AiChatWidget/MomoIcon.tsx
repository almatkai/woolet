import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MomoIconProps {
    className?: string;
    isHovered?: boolean;
    isPressed?: boolean;
    isAngry?: boolean;
}

export function MomoIcon({
    className,
    isHovered = false,
    isPressed = false,
    isAngry = false,
}: MomoIconProps) {
    // Animation states
    const [leftEyeScale, setLeftEyeScale] = useState(1);
    const [rightEyeScale, setRightEyeScale] = useState(1);
    const [breathScale, setBreathScale] = useState(1);
    const [headTilt, setHeadTilt] = useState(0);
    const [headBob, setHeadBob] = useState(0);
    const [smileAmount, setSmileAmount] = useState(0);
    const [leftBrowRaise, setLeftBrowRaise] = useState(0);
    const [rightBrowRaise, setRightBrowRaise] = useState(0);
    const [eyeOffsetX, setEyeOffsetX] = useState(0);
    const [eyeOffsetY, setEyeOffsetY] = useState(0);

    const [excitement, setExcitement] = useState(0);
    const [curiosity, setCuriosity] = useState(0);
    const [blinkPhase, setBlinkPhase] = useState(0);
    const [pupilDilate, setPupilDilate] = useState(1);

    // Complex idle animation scheduler with more variety
    useEffect(() => {
        const animations = [
            // Double blink - rapid
            () => {
                setLeftEyeScale(0.1);
                setRightEyeScale(0.1);
                setTimeout(() => {
                    setLeftEyeScale(1);
                    setRightEyeScale(1);
                    setTimeout(() => {
                        setLeftEyeScale(0.1);
                        setRightEyeScale(0.1);
                        setTimeout(() => {
                            setLeftEyeScale(1);
                            setRightEyeScale(1);
                        }, 80);
                    }, 100);
                }, 80);
            },
            // Slow wink with smile
            () => {
                const isLeft = Math.random() > 0.5;
                setSmileAmount(1);
                if (isLeft) {
                    setLeftEyeScale(0.1);
                    setLeftBrowRaise(-1.5);
                    setTimeout(() => {
                        setLeftEyeScale(1);
                        setLeftBrowRaise(0);
                        setSmileAmount(0);
                    }, 400);
                } else {
                    setRightEyeScale(0.1);
                    setRightBrowRaise(-1.5);
                    setTimeout(() => {
                        setRightEyeScale(1);
                        setRightBrowRaise(0);
                        setSmileAmount(0);
                    }, 400);
                }
            },
            // Curious head tilt with eyebrow raise
            () => {
                const tilt = (Math.random() - 0.5) * 12;
                setHeadTilt(tilt);
                setCuriosity(1);
                if (tilt > 0) {
                    setLeftBrowRaise(-2);
                } else {
                    setRightBrowRaise(-2);
                }
                setTimeout(() => {
                    setHeadTilt(0);
                    setCuriosity(0);
                    setLeftBrowRaise(0);
                    setRightBrowRaise(0);
                }, 1200);
            },
            // Excitement bounce
            () => {
                setExcitement(1);
                setSmileAmount(1);
                setHeadBob(-2);
                setTimeout(() => setHeadBob(0), 150);
                setTimeout(() => setHeadBob(-2), 300);
                setTimeout(() => {
                    setHeadBob(0);
                    setExcitement(0);
                    setSmileAmount(0);
                }, 450);
            },

            // Pupil dilation (surprise/interest)
            () => {
                setPupilDilate(1.4);
                setTimeout(() => setPupilDilate(1), 800);
            },
            // Side glance with follow-through
            () => {
                const offsetX = (Math.random() - 0.5) * 2;
                const offsetY = (Math.random() - 0.5) * 1;
                setEyeOffsetX(offsetX);
                setEyeOffsetY(offsetY);
                setTimeout(() => {
                    setEyeOffsetX(offsetX * 0.5);
                    setEyeOffsetY(offsetY * 0.5);
                }, 400);
                setTimeout(() => {
                    setEyeOffsetX(0);
                    setEyeOffsetY(0);
                }, 800);
            },
            // Slow blink with breath hold
            () => {
                setBreathScale(0.98);
                setLeftEyeScale(0.1);
                setRightEyeScale(0.1);
                setTimeout(() => {
                    setBreathScale(1);
                    setLeftEyeScale(1);
                    setRightEyeScale(1);
                }, 600);
            },
            // Thoughtful look (eyes up)
            () => {
                setEyeOffsetY(-1);
                setSmileAmount(0.5);
                setTimeout(() => {
                    setEyeOffsetY(0);
                    setSmileAmount(0);
                }, 1000);
            },
            // Playful eye roll
            () => {
                setEyeOffsetY(-1);
                setTimeout(() => {
                    setEyeOffsetX(1);
                    setEyeOffsetY(0);
                }, 200);
                setTimeout(() => {
                    setEyeOffsetX(0);
                }, 600);
            },
            // Content sigh (eyes half closed)
            () => {
                setLeftEyeScale(0.6);
                setRightEyeScale(0.6);
                setSmileAmount(1);
                setTimeout(() => {
                    setLeftEyeScale(1);
                    setRightEyeScale(1);
                    setSmileAmount(0);
                }, 900);
            },
            // Confused look (eyebrows inwards)
            () => {
                setLeftBrowRaise(1.5);
                setRightBrowRaise(1.5);
                setHeadTilt(3);
                setTimeout(() => {
                    setLeftBrowRaise(0);
                    setRightBrowRaise(0);
                    setHeadTilt(0);
                }, 800);
            },
        ];

        // Breathing animation (constant subtle with variation)
        const breathingInterval = setInterval(() => {
            const breathIntensity = 1 + (Math.random() * 0.02);
            setBreathScale(breathIntensity);
            setTimeout(() => setBreathScale(1), 2000 + Math.random() * 1000);
        }, 4000);

        // Random idle animations with weighted probabilities
        const idleInterval = setInterval(() => {
            const rand = Math.random();
            let animIndex;
            if (rand < 0.3) {
                animIndex = 0; // Double blink - most common
            } else if (rand < 0.5) {
                animIndex = 2; // Curious tilt
            } else if (rand < 0.6) {
                animIndex = 3; // Excitement
            } else if (rand < 0.7) {
                animIndex = 5; // Side glance
            } else {
                animIndex = Math.floor(Math.random() * animations.length);
            }
            animations[animIndex]();
        }, 2500 + Math.random() * 3000);

        return () => {
            clearInterval(breathingInterval);
            clearInterval(idleInterval);
        };
    }, []);

    // Hover excitement effect
    useEffect(() => {
        // Use setTimeout to avoid synchronous setState in effect (React Compiler warning)
        const timer = setTimeout(() => {
            if (isHovered) {
                setExcitement(1);
                setSmileAmount(1);
                setPupilDilate(1.2);
            } else {
                setExcitement(0);
                setSmileAmount(0);
                setPupilDilate(1);
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [isHovered]);

    const safeSmile = Number.isFinite(smileAmount) ? smileAmount : 0;
    const safeLeftEyeScale = Number.isFinite(leftEyeScale) ? leftEyeScale : 1;
    const safeRightEyeScale = Number.isFinite(rightEyeScale) ? rightEyeScale : 1;
    const safeEyeOffsetX = Number.isFinite(eyeOffsetX) ? eyeOffsetX : 0;
    const safeEyeOffsetY = Number.isFinite(eyeOffsetY) ? eyeOffsetY : 0;
    const safePupilDilate = Number.isFinite(pupilDilate) ? pupilDilate : 1;
    const safeBreathScale = Number.isFinite(breathScale) ? breathScale : 1;
    const safeHeadTilt = Number.isFinite(headTilt) ? headTilt : 0;
    const safeHeadBob = Number.isFinite(headBob) ? headBob : 0;
    const safeExcitement = Number.isFinite(excitement) ? excitement : 0;
    const safeCuriosity = Number.isFinite(curiosity) ? curiosity : 0;
    const safeLeftBrowRaise = Number.isFinite(leftBrowRaise) ? leftBrowRaise : 0;
    const safeRightBrowRaise = Number.isFinite(rightBrowRaise) ? rightBrowRaise : 0;

    const mouthPath = safeSmile > 0
        ? `M7 ${16.5 - safeSmile * 0.5} Q12 ${19.5 + safeSmile} 17 ${16.5 - safeSmile * 0.5}`
        : "M8 17 Q12 18.5 16 17";

    const leftEye = {
        cx: 8.5 + safeEyeOffsetX,
        cy: 14 + safeEyeOffsetY,
        rx: Math.max(0, isHovered ? 1.5 : 1.3),
        ry: Math.max(0, (isHovered ? 1.7 : 1.3) * safeLeftEyeScale),
    };

    const rightEye = {
        cx: 15.5 + safeEyeOffsetX,
        cy: 14 + safeEyeOffsetY,
        rx: Math.max(0, isHovered ? 1.5 : 1.3),
        ry: Math.max(0, (isHovered ? 1.7 : 1.3) * safeRightEyeScale),
    };

    const leftPupil = {
        cx: 8.5 + safeEyeOffsetX * 1.5,
        cy: 14 + safeEyeOffsetY,
        r: 0.5 * safePupilDilate,
    };

    const rightPupil = {
        cx: 15.5 + safeEyeOffsetX * 1.5,
        cy: 14 + safeEyeOffsetY,
        r: 0.5 * safePupilDilate,
    };

    const safeLeftPupil = {
        ...leftPupil,
        r: Number.isFinite(leftPupil.r) ? leftPupil.r : 0.5,
    };

    const safeRightPupil = {
        ...rightPupil,
        r: Number.isFinite(rightPupil.r) ? rightPupil.r : 0.5,
    };

    const sparkleR = 0.7;
    const extraSparkleR = 0.4;
    const blushR = 1.4;

    return (
        <motion.div
            className={cn("relative", className)}
            animate={{
                scale: isPressed ? 0.85 : isHovered ? 1.15 : safeBreathScale,
                rotate: isPressed ? -8 : isHovered ? 8 + safeHeadTilt : safeHeadTilt,
                y: safeHeadBob + (safeExcitement * -1),
            }}
            transition={{
                type: "spring",
                stiffness: 400,
                damping: 15,
                mass: 0.8
            }}
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-full h-full"
            >
                {/* Wallet Body with subtle gradient effect via stroke */}
                <motion.rect
                    x="2" y="5" width="20" height="15" rx="3" ry="3"
                    animate={{
                        strokeWidth: isHovered ? 2 : 1.5,
                    }}
                    transition={{ duration: 0.2 }}
                />
                <motion.path
                    d="M2 8h20"
                    animate={{
                        strokeWidth: isHovered ? 2 : 1.5,
                    }}
                    transition={{ duration: 0.2 }}
                />

                {/* Left Eyebrow with more expressiveness */}
                <motion.path
                    d={isAngry ? "M6 12.5 Q8.5 13.5 11 12.5" : "M6 11.5 Q8.5 10.5 11 11.5"}
                    strokeWidth="1.2"
                    fill="none"
                    initial={{
                        y: safeLeftBrowRaise + (safeCuriosity * (safeHeadTilt > 0 ? -1 : 0.5)),
                        d: isAngry ? "M6 12.5 Q8.5 13.5 11 12.5" : "M6 11.5 Q8.5 10.5 11 11.5",
                    }}
                    animate={{
                        y: safeLeftBrowRaise + (safeCuriosity * (safeHeadTilt > 0 ? -1 : 0.5)),
                        d: isAngry ? "M6 12.5 Q8.5 13.5 11 12.5" : "M6 11.5 Q8.5 10.5 11 11.5",
                    }}
                    transition={{ duration: 0.12, type: "spring", stiffness: 300 }}
                />

                {/* Right Eyebrow with more expressiveness */}
                <motion.path
                    d={isAngry ? "M13 12.5 Q15.5 13.5 18 12.5" : "M13 11.5 Q15.5 10.5 18 11.5"}
                    strokeWidth="1.2"
                    fill="none"
                    initial={{
                        y: safeRightBrowRaise + (safeCuriosity * (safeHeadTilt < 0 ? -1 : 0.5)),
                        d: isAngry ? "M13 12.5 Q15.5 13.5 18 12.5" : "M13 11.5 Q15.5 10.5 18 11.5",
                    }}
                    animate={{
                        y: safeRightBrowRaise + (safeCuriosity * (safeHeadTilt < 0 ? -1 : 0.5)),
                        d: isAngry ? "M13 12.5 Q15.5 13.5 18 12.5" : "M13 11.5 Q15.5 10.5 18 11.5",
                    }}
                    transition={{ duration: 0.12, type: "spring", stiffness: 300 }}
                />

                {/* Left Eye with enhanced animation */}
                <motion.ellipse
                    cx={leftEye.cx}
                    cy={leftEye.cy}
                    rx={leftEye.rx}
                    ry={leftEye.ry}
                    fill="currentColor"
                    initial={leftEye}
                    animate={leftEye}
                    transition={{ duration: 0.06, type: "tween", ease: "easeOut" }}
                />
                {/* Left Pupil with dilation */}
                {safeLeftEyeScale > 0.3 && (
                    <motion.circle
                        cx={safeLeftPupil.cx}
                        cy={safeLeftPupil.cy}
                        r={safeLeftPupil.r}
                        fill="black"
                        initial={safeLeftPupil}
                        animate={safeLeftPupil}
                        transition={{ duration: 0.06, type: "spring", stiffness: 400 }}
                    />
                )}

                {/* Right Eye with enhanced animation */}
                <motion.ellipse
                    cx={rightEye.cx}
                    cy={rightEye.cy}
                    rx={rightEye.rx}
                    ry={rightEye.ry}
                    fill="currentColor"
                    initial={rightEye}
                    animate={rightEye}
                    transition={{ duration: 0.06, type: "tween", ease: "easeOut" }}
                />
                {/* Right Pupil with dilation */}
                {safeRightEyeScale > 0.3 && (
                    <motion.circle
                        cx={safeRightPupil.cx}
                        cy={safeRightPupil.cy}
                        r={safeRightPupil.r}
                        fill="black"
                        initial={safeRightPupil}
                        animate={safeRightPupil}
                        transition={{ duration: 0.06, type: "spring", stiffness: 400 }}
                    />
                )}

                {/* Eye sparkles with more intensity on hover */}
                {isHovered && safeLeftEyeScale > 0.5 && (
                    <>
                        <motion.circle
                            cx={9 + safeEyeOffsetX}
                            cy={13}
                            r={sparkleR}
                            fill="white"
                            opacity="0.95"
                            initial={{ scale: 1 }}
                            animate={{ scale: [1, 1.25, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            style={{ transformOrigin: 'center' }}
                        />
                        <motion.circle
                            cx={16 + safeEyeOffsetX}
                            cy={13}
                            r={sparkleR}
                            fill="white"
                            opacity="0.95"
                            initial={{ scale: 1 }}
                            animate={{ scale: [1, 1.25, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                            style={{ transformOrigin: 'center' }}
                        />
                        {/* Extra sparkle */}
                        <circle cx={7.5 + safeEyeOffsetX} cy="12.5" r={extraSparkleR} fill="white" opacity="0.7" />
                        <circle cx={17.5 + safeEyeOffsetX} cy="12.5" r={extraSparkleR} fill="white" opacity="0.7" />
                    </>
                )}

                {/* Mouth with more expressive curves */}
                <motion.path
                    d={isAngry ? "M9 18.5 Q12 16.5 15 18.5" : isPressed ? "M8 17 Q12 14 16 17" : isHovered ? "M6 15.5 Q12 21.5 18 15.5" : mouthPath}
                    strokeWidth="1.4"
                    fill="none"
                    initial={{
                        d: isAngry ? "M9 18.5 Q12 16.5 15 18.5" : isPressed ? "M8 17 Q12 14 16 17" : isHovered ? "M6 15.5 Q12 21.5 18 15.5" : mouthPath,
                        strokeWidth: isHovered ? 1.8 : 1.4,
                    }}
                    animate={{
                        d: isAngry ? "M9 18.5 Q12 16.5 15 18.5" : isPressed ? "M8 17 Q12 14 16 17" : isHovered ? "M6 15.5 Q12 21.5 18 15.5" : mouthPath,
                        strokeWidth: isHovered ? 1.8 : 1.4,
                    }}
                    transition={{ duration: 0.15, type: "spring", stiffness: 200 }}
                />

                {/* Enhanced blush on hover */}
                {isHovered && (
                    <>
                        <motion.circle
                            cx="5"
                            cy="15.5"
                            r={blushR}
                            fill="currentColor"
                            opacity="0.2"
                            initial={{ scale: 1 }}
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ transformOrigin: 'center' }}
                        />
                        <motion.circle
                            cx="19"
                            cy="15.5"
                            r={blushR}
                            fill="currentColor"
                            opacity="0.2"
                            initial={{ scale: 1 }}
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                            style={{ transformOrigin: 'center' }}
                        />
                    </>
                )}

                {/* Excitement lines when hovered */}
                {isHovered && (
                    <>
                        <motion.path
                            d="M3 14 L4 15"
                            strokeWidth="1"
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 1, repeat: Infinity }}
                        />
                        <motion.path
                            d="M21 14 L20 15"
                            strokeWidth="1"
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                        />
                    </>
                )}
            </svg>
        </motion.div>
    );
}
