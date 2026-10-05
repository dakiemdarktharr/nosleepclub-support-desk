import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginPanel } from "@/components/identity-ui";

export default function LoginPage() {
  return (
    <main className="login-page">
      <Link href="/" className="back-link"><ArrowLeft size={18} />Màn hình chính</Link>
      <LoginPanel />
    </main>
  );
}
