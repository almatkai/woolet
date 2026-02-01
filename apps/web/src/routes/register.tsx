import { AuthLayout } from '../components/AuthLayout';
import { CustomSignUpForm } from '../components/CustomSignUpForm';

export function RegisterPage() {
    return (
        <AuthLayout
            title="Create Account"
            subtitle="Start managing your finances today"
        >
            <CustomSignUpForm />
        </AuthLayout>
    );
}

export default RegisterPage;
