import React from 'react';
import { motion } from 'motion/react';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { SignInButton } from '@clerk/clerk-react';
import SlideArrowButton from '@/components/ui/slide-arrow-button';

export function CTASection() {
    return (
        <section className="py-24 px-4 relative overflow-hidden bg-background border-t border-border/50">
            <motion.div
                className="max-w-4xl mx-auto text-center relative z-10"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
            >
                <h2 className="text-3xl md:text-5xl font-bold mb-6 text-foreground">
                    Ready to Take Control of Your Financial Future?
                </h2>

                <div className="mb-10">
                    <TextGenerateEffect
                        words="Join thousands of users who have transformed the way they manage money."
                        className="text-lg md:text-xl text-muted-foreground font-normal"
                        staggerDelay={0.05}
                    />
                </div>

                <div className="flex justify-center items-center mb-12">
                    <SignInButton mode="modal">
                        <div>
                            <SlideArrowButton text="Get Started" primaryColor="#000000" />
                        </div>
                    </SignInButton>
                </div>

                <p className="mt-8 text-sm text-muted-foreground">
                    No credit card required • Free forever for basic features • Cancel anytime
                </p>
            </motion.div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-border/50 max-w-4xl mx-auto">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <img src="/assets/woolet -icon.png" alt="Woolet" className="size-6 rounded" />
                        <span className="font-semibold text-foreground">Woolet</span>
                        <span>© {new Date().getFullYear()}</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
                        <a href="#" className="hover:text-foreground transition-colors">Terms</a>
                        <a href="#" className="hover:text-foreground transition-colors">Contact</a>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default CTASection;
