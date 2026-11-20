import type { HealthResponse } from "@pg_select1/shared";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { fetchHealth } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; health: HealthResponse }
  | { kind: "failed"; message: string };

/** Shows whether pg_select1's API and its database are up, from `GET /health`. */
export function HealthPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchHealth().then(
      (health) => {
        if (!cancelled) setState({ kind: "loaded", health });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            kind: "failed",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Health</CardTitle>
        <CardDescription>Whether pg_select1 and its own database are up.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "loading" && <p className="text-sm text-muted-foreground">Checking…</p>}
        {state.kind === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            Couldn't reach the API: {state.message}
          </p>
        )}
        {state.kind === "loaded" && <HealthDetails health={state.health} />}
      </CardContent>
    </Card>
  );
}

function HealthDetails({ health }: { health: HealthResponse }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
      <dt className="text-muted-foreground">API</dt>
      <dd>
        <StatusBadge ok={health.status === "ok"} />
      </dd>
      <dt className="text-muted-foreground">Database</dt>
      <dd className="flex items-center gap-2">
        <StatusBadge ok={health.database.ok} />
        {health.database.latencyMs !== null && (
          <span className="font-mono text-xs text-muted-foreground">
            {health.database.latencyMs} ms
          </span>
        )}
      </dd>
      <dt className="text-muted-foreground">Version</dt>
      <dd className="font-mono">{health.version}</dd>
      <dt className="text-muted-foreground">Checked</dt>
      <dd className="font-mono">{new Date(health.time).toLocaleTimeString()}</dd>
    </dl>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge className={cn("text-white", ok ? "bg-success" : "bg-destructive")}>
      {ok ? "ok" : "down"}
    </Badge>
  );
}
