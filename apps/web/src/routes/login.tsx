import { AuthLayout } from '../components/AuthLayout';
import { CustomSignInForm } from '../components/CustomSignInForm';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate } from '@tanstack/react-router';

export function LoginPage() {
    return (
        <AuthLayout
            title="Welcome Back"
            subtitle="Sign in to continue to your account"
        >
            {/* If already signed in, navigate to the app root */}
            <SignedIn>
                <Navigate to="/" />
            </SignedIn>

            {/* Only show the sign-in form to signed-out users */}
            <SignedOut>
                <CustomSignInForm />
            </SignedOut>
        </AuthLayout>
    );
}

export default LoginPage;
