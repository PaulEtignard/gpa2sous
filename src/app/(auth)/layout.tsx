import Link from "next/link";
import { Wallet } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5 text-primary" />
          Gpadesous
        </Link>
        {children}
      </div>
    </div>
  );
}
