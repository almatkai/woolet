import React from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import SlideArrowButton from '@/components/ui/slide-arrow-button';
import { BlurText } from '@/components/ui/blur-text';
import { useTheme } from '@/components/theme-provider';
import { Sun, Moon, Eclipse } from 'lucide-react';

function ThemeButtons() {
    const { theme, setTheme } = useTheme();
    const themeOrder: Array<'light'|'dark'|'super-dark'> = ['light', 'dark', 'super-dark'];

    return (
        <div className="flex items-center gap-1">
            <button
                aria-label="Light theme"
                onClick={() => setTheme('light')}
                className={`p-1 rounded-md ${theme === 'light' ? 'bg-white/10 shadow-sm' : 'hover:bg-white/5'}`}>
                <Sun className="h-4 w-4" />
            </button>
            <button
                aria-label="Dark theme"
                onClick={() => setTheme('dark')}
                className={`p-1 rounded-md ${theme === 'dark' ? 'bg-white/10 shadow-sm' : 'hover:bg-white/5'}`}>
                <Moon className="h-4 w-4" />
            </button>
            <button
                aria-label="Super dark theme"
                onClick={() => setTheme('super-dark')}
                className={`p-1 rounded-md ${theme === 'super-dark' ? 'bg-white/10 shadow-sm' : 'hover:bg-white/5'}`}>
                <Eclipse className="h-4 w-4" />
            </button>
        </div>
    )
}

export function HeroSection() {
    return (
        <section className="relative min-h-[80vh] flex flex-col items-center justify-center px-4 py-16 overflow-hidden bg-background">
            {/* Stylish Sign In Button + Theme Switcher - Top Right */}
            <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
                {/* Theme Switcher */}
                <div className="flex items-center gap-1 rounded-md bg-muted/10 p-1">
                    <ThemeButtons />
                </div>

                {/* Sign In */}
                <div>
                    <SignInButton mode="modal">
                        <button className="group relative px-6 py-2 text-foreground font-medium transition-colors hover:text-primary overflow-visible">
                            Sign In
                            {/* Bottom-center growing line on hover */}
                            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 bg-primary transition-all duration-300 ease-out group-hover:w-full"></span>
                        </button>
                    </SignInButton>
                </div>
            </div>

            <div className="relative z-10 text-center w-full max-w-5xl mx-auto flex flex-col items-center">
                {/* Main Headline Effect */}
                <div className="flex items-center justify-center mb-12 py-10">
                    <BlurText
                        text="Woolet "
                        className="text-7xl md:text-9xl font-bold text-foreground dark:text-white tracking-tighter"
                        delay={50}
                        animateBy="letters"
                        direction="top"
                    />
                </div>

                {/* Subtitle */}
                <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed -mt-8">
                    The all-in-one platform for managing your spending, tracking debts, monitoring investments,
                    and keeping your financial products organized.
                </p>

                {/* CTA Button */}
                <div className="flex justify-center items-center">
                    <SignInButton mode="modal">
                        <div>
                            <SlideArrowButton text="Get Started" primaryColor="#000000" />
                        </div>
                    </SignInButton>
                </div>

                {/* Trust indicators - with hover effects */}
                <div className="mt-16 flex flex-wrap justify-center items-center gap-8 text-muted-foreground text-sm font-medium">
                    <div className="flex items-center gap-2 transition-all duration-300 hover:text-foreground hover:scale-110 cursor-default">
                        <span>Free to start</span>
                    </div>
                    <div className="flex items-center gap-2 transition-all duration-300 hover:text-foreground hover:scale-110 cursor-default">
                        <span>No credit card required</span>
                    </div>
                    <div className="flex items-center gap-2 transition-all duration-300 hover:text-foreground hover:scale-110 cursor-default">
                        <span>Secure & Private</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default HeroSection;
