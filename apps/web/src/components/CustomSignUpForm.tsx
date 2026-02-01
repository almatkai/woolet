import { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from '@tanstack/react-router';

export function CustomSignUpForm() {
    const { signUp, setActive, isLoaded } = useSignUp();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoaded) return;

        setIsLoading(true);
        setErrors({});

        try {
            await signUp.create({
                firstName: formData.firstName,
                lastName: formData.lastName,
                emailAddress: formData.email,
                password: formData.password,
            });

            // Send email verification code
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

            // For now, we'll auto-verify and sign in
            // In production, you'd redirect to a verification page
            if (signUp.createdSessionId) {
                await setActive({ session: signUp.createdSessionId });
                navigate({ to: '/' });
            }
        } catch (err: any) {
            console.error('Sign up error:', err);
            const errorMessages: Record<string, string> = {};

            if (err.errors) {
                err.errors.forEach((error: any) => {
                    const field = error.meta?.paramName || 'general';
                    errorMessages[field] = error.message;
                });
            } else {
                errorMessages.general = 'An error occurred. Please try again.';
            }

            setErrors(errorMessages);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        if (!isLoaded) return;
        setIsGoogleLoading(true);

        try {
            await signUp.authenticateWithRedirect({
                strategy: 'oauth_google',
                redirectUrl: '/sso-callback',
                redirectUrlComplete: '/',
            });
        } catch (err) {
            console.error('Google sign up error:', err);
            setIsGoogleLoading(false);
        }
    };

    return (
        <div className="w-full">
            {/* Google Sign Up */}
            <motion.button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={isGoogleLoading || isLoading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-foreground/[0.03] hover:bg-foreground/[0.05] border border-border hover:border-white/30 text-foreground rounded-xl font-medium transition-all duration-300 mb-6 group disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: isGoogleLoading ? 1 : 1.01 }}
                whileTap={{ scale: isGoogleLoading ? 1 : 0.99 }}
            >
                {isGoogleLoading ? (
                    <svg className="animate-spin h-5 w-5 text-foreground" viewBox="0 0 24 24">
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                )}
                <span>{isGoogleLoading ? 'Connecting...' : 'Continue with Google'}</span>
            </motion.button>

            {/* Divider */}
            <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-card text-muted-foreground">or</span>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                    {/* First Name */}
                    <div className="relative">
                        <motion.input
                            type="text"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            onFocus={() => setFocusedField('firstName')}
                            onBlur={() => setFocusedField(null)}
                            className="w-full px-4 py-3.5 bg-white/[0.03] border border-border rounded-xl text-foreground placeholder-transparent focus:border-white/40 focus:ring-2 focus:ring-white/10 transition-all duration-300 peer"
                            placeholder="First name"
                            animate={{
                                borderColor: focusedField === 'firstName' ? 'rgba(255,255,255,0.4)' : 'var(--border)',
                            }}
                        />
                        <label
                            className={`absolute left-4 transition-all duration-300 pointer-events-none ${formData.firstName || focusedField === 'firstName'
                                ? '-top-2.5 text-xs bg-[#0A0E10] px-2 text-foreground'
                                : 'top-3.5 text-sm text-muted-foreground'
                                }`}
                        >
                            First name
                        </label>
                        <AnimatePresence>
                            {errors.firstName && (
                                <motion.p
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-red-400 text-xs mt-1.5"
                                >
                                    {errors.firstName}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Last Name */}
                    <div className="relative">
                        <motion.input
                            type="text"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            onFocus={() => setFocusedField('lastName')}
                            onBlur={() => setFocusedField(null)}
                            className="w-full px-4 py-3.5 bg-white/[0.03] border border-border rounded-xl text-foreground placeholder-transparent focus:border-white/40 focus:ring-2 focus:ring-white/10 transition-all duration-300 peer"
                            placeholder="Last name"
                            animate={{
                                borderColor: focusedField === 'lastName' ? 'rgba(255,255,255,0.4)' : 'var(--border)',
                            }}
                        />
                        <label
                            className={`absolute left-4 transition-all duration-300 pointer-events-none ${formData.lastName || focusedField === 'lastName'
                                ? '-top-2.5 text-xs bg-[#0A0E10] px-2 text-foreground'
                                : 'top-3.5 text-sm text-muted-foreground'
                                }`}
                        >
                            Last name
                        </label>
                        <AnimatePresence>
                            {errors.lastName && (
                                <motion.p
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-red-400 text-xs mt-1.5"
                                >
                                    {errors.lastName}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Email */}
                <div className="relative">
                    <motion.input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full px-4 py-3.5 bg-white/[0.03] border border-border rounded-xl text-foreground placeholder-transparent focus:border-white/40 focus:ring-2 focus:ring-white/10 transition-all duration-300 peer"
                        placeholder="Email address"
                        required
                        animate={{
                            borderColor: focusedField === 'email' ? 'rgba(255,255,255,0.4)' : 'var(--border)',
                        }}
                    />
                    <label
                        className={`absolute left-4 transition-all duration-300 pointer-events-none ${formData.email || focusedField === 'email'
                            ? '-top-2.5 text-xs bg-[#0A0E10] px-2 text-foreground'
                            : 'top-3.5 text-sm text-muted-foreground'
                            }`}
                    >
                        Email address
                    </label>
                    <AnimatePresence>
                        {errors.email_address && (
                            <motion.p
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-red-400 text-xs mt-1.5"
                            >
                                {errors.email_address}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>

                {/* Password */}
                <div className="relative">
                    <motion.input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full px-4 py-3.5 bg-white/[0.03] border border-border rounded-xl text-foreground placeholder-transparent focus:border-white/40 focus:ring-2 focus:ring-white/10 transition-all duration-300 peer"
                        placeholder="Password"
                        required
                        animate={{
                            borderColor: focusedField === 'password' ? 'rgba(255,255,255,0.4)' : 'var(--border)',
                        }}
                    />
                    <label
                        className={`absolute left-4 transition-all duration-300 pointer-events-none ${formData.password || focusedField === 'password'
                            ? '-top-2.5 text-xs bg-[#0A0E10] px-2 text-foreground'
                            : 'top-3.5 text-sm text-muted-foreground'
                            }`}
                    >
                        Password
                    </label>
                    <AnimatePresence>
                        {errors.password && (
                            <motion.p
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="text-red-400 text-xs mt-1.5"
                            >
                                {errors.password}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>

                {/* General Error */}
                <AnimatePresence>
                    {errors.general && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
                        >
                            <p className="text-red-400 text-sm">{errors.general}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Submit Button */}
                <motion.button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-foreground text-background rounded-xl font-bold text-base hover:bg-slate-100 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
                    whileHover={{ scale: isLoading ? 1 : 1.01 }}
                    whileTap={{ scale: isLoading ? 1 : 0.99 }}
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            <span>Creating account...</span>
                        </>
                    ) : (
                        <>
                            <span>Continue</span>
                            <svg
                                className="w-5 h-5 transform group-hover:translate-x-1 transition-transform duration-200"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                        </>
                    )}
                </motion.button>

                {/* Sign In Link */}
                <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <a href="/login" className="text-foreground hover:text-slate-300 font-medium transition-colors">
                        Sign in
                    </a>
                </p>
            </form>
        </div>
    );
}
