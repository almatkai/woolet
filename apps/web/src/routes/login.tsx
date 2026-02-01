import { AuthLayout } from '../components/AuthLayout';
import { CustomSignInForm } from '../components/CustomSignInForm';

export function LoginPage() {
    return (
        <AuthLayout
            title="Welcome Back"
            subtitle="Sign in to continue to your account"
        >
            <CustomSignInForm />
        </AuthLayout>
    );
}

export default LoginPage;
