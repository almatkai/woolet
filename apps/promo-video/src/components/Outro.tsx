import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const Outro: React.FC = () => {
    const frame = useCurrentFrame();

    const scale = interpolate(frame, [0, 30], [0.9, 1], { extrapolateRight: 'clamp' });
    const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill className="bg-slate-900 flex flex-col items-center justify-center text-white">
            <div style={{ opacity, transform: `scale(${scale})` }} className="text-center">
                <h1 className="text-9xl font-bold mb-8 bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">Woo-Let</h1>
                <p className="text-4xl mb-12">Take control of your wealth.</p>
                <div className="bg-white text-slate-900 px-12 py-4 rounded-full text-3xl font-bold">
                    Get Started Today
                </div>
            </div>
        </AbsoluteFill>
    );
};
