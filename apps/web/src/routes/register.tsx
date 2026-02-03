import { AuthLayout } from '../components/AuthLayout';
import { CustomSignUpForm } from '../components/CustomSignUpForm';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate } from '@tanstack/react-router';

export function RegisterPage() {
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
