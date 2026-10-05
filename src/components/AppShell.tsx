import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { clsx } from "@/lib/clsx";

// Page frame, matching the prototype's `shell()`: sticky sidebar + main column on
// md+, slim top bar + fixed bottom tab bar below it.
export function AppShell({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: "wide" | "narrow" | "full";
}) {
  return (
    <>
      <AppHeader />
      <div className="mx-auto flex w-full gap-5 md:p-5">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-6 md:pb-10">
          <div
            className={clsx(
              "mx-auto w-full",
              width === "wide" && "max-w-5xl",
              width === "narrow" && "max-w-2xl"
            )}
          >
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </>
  );
}
