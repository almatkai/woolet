import { AuthLayout } from '../components/AuthLayout';
import { CustomSignUpForm } from '../components/CustomSignUpForm';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import posthog from 'posthog-js';

export function RegisterPage() {
    useEffect(() => {
        posthog.capture('auth_signup_page_opened');
    }, []);

    return (
        <AuthLayout
            title="Create Account"
            subtitle="Start managing your finances today"
        >
            <SignedIn>
                <Navigate to="/" />
            </SignedIn>
            <SignedOut>
                <CustomSignUpForm />
            </SignedOut>
        </AuthLayout>
    );
}

export default RegisterPage;
