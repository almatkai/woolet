import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Wallet } from 'lucide-react';

export const Intro: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const opacity = interpolate(frame, [0, 30], [0, 1], {
        extrapolateRight: 'clamp',
    });

    const scale = interpolate(frame, [0, 30], [0.8, 1], {
        extrapolateRight: 'clamp',
    });

    const textY = interpolate(frame, [20, 50], [20, 0], {
        extrapolateRight: 'clamp',
    });
    const textOpacity = interpolate(frame, [20, 50], [0, 1], {
        extrapolateRight: 'clamp',
    });

    return (
        <AbsoluteFill className="bg-slate-950 flex flex-col items-center justify-center text-white">
            <div style={{ opacity, transform: `scale(${scale})` }} className="flex flex-col items-center mb-8">
                <div className="bg-blue-600 p-8 rounded-3xl shadow-2xl shadow-blue-500/20 mb-6">
                    <Wallet size={120} className="text-white" />
                </div>
            </div>
            <div style={{ opacity: textOpacity, transform: `translateY(${textY}px)` }} className="text-center">
                <h1 className="text-8xl font-bold tracking-tight mb-4">Woolet</h1>
                <p className="text-3xl text-slate-400 font-medium tracking-wide">Your finance, simpler.</p>
            </div>
        </AbsoluteFill>
    );
};
