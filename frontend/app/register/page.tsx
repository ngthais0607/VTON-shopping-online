import { AuthContainer } from '@/components/auth/auth-container';
import { AuthShell } from '@/components/auth/auth-shell';
export default function RegisterPage() {
  return <AuthShell><AuthContainer defaultTab="signup" /></AuthShell>;
}
