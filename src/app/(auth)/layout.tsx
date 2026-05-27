import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-md">
        {/* Logo */}
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2.5"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "hsl(217 91% 60%)" }}
          >
            <span className="text-[13px] font-bold leading-none text-white">G</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Gpadesous</span>
        </Link>

        {children}
      </div>
    </div>
  );
}
