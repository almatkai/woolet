import { Composition, Series } from 'remotion';
import { Intro } from './components/Intro';
import { Dashboard } from './components/Dashboard';
import { Investments } from './components/Investments';
import { Transactions } from './components/Transactions';
import { Outro } from './components/Outro';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="PromoVideo"
                component={MainVideo}
                durationInFrames={600}
                fps={30}
                width={1920}
                height={1080}
            />
        </>
    );
};

const MainVideo: React.FC = () => {
    return (
        <Series>
            <Series.Sequence durationInFrames={90}>
                <Intro />
            </Series.Sequence>
            <Series.Sequence durationInFrames={120}>
                <Dashboard />
            </Series.Sequence>
            <Series.Sequence durationInFrames={120}>
                <Investments />
            </Series.Sequence>
            <Series.Sequence durationInFrames={150}>
                <Transactions />
            </Series.Sequence>
            <Series.Sequence durationInFrames={120}>
                <Outro />
            </Series.Sequence>
        </Series>
    );
};
