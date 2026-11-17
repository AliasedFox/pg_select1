import { HealthPage } from "@/health/HealthPage";
import { usePath } from "@/router";

/** The app's shell: the header, and the page for the current path. */
export function App() {
  const path = usePath();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center border-b px-6">
        <span className="font-mono text-lg font-semibold tracking-tight">
          select<span className="text-slate">1</span>
        </span>
      </header>
      <main className="flex flex-1 items-start justify-center p-6">
        {path === "/" ? <HealthPage /> : <NotFound />}
      </main>
    </div>
  );
}

function NotFound() {
  return <p className="text-sm text-muted-foreground">There's no page here.</p>;
}
