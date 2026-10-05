import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="text-5xl font-black text-primary">404</div>
        <h1 className="mt-3 text-xl font-bold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" className="btn-primary mt-5">
          Back to home
        </Link>
      </div>
    </AppShell>
  );
}
