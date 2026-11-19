import { AuthContainer } from '@/components/auth/auth-container';
import { AuthShell } from '@/components/auth/auth-shell';
export default function LoginPage() {
  return <AuthShell><AuthContainer defaultTab="signin" /></AuthShell>;
}
