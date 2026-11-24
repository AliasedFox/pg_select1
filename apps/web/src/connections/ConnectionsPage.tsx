import type { Connection, TestConnectionResult } from "@pg_select1/shared";
import { MoreHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeError } from "@/lib/api";

import { fetchConnections, testConnection, updateConnection } from "./api";
import { DeleteConnectionDialog, EditConnectionDialog } from "./ConnectionDialogs";
import { ConnectionForm, TestResult } from "./ConnectionForm";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; connections: Connection[] }
  | { kind: "failed"; message: string };

// The one dialog open at a time. Adding isn't one: its form is under the list.
type Open =
  | { kind: "none" }
  | { kind: "edit"; connection: Connection }
  | { kind: "delete"; connection: Connection };

// The last test run from a row's menu, shown above the table.
type Tested =
  | { kind: "testing"; name: string }
  | { kind: "done"; name: string; result: TestConnectionResult };

/**
 * Lists every connection for an admin, to change them, test them, make them visible to
 * everyone or hide them again, and delete them, with the form to add one under the list.
 */
export function ConnectionsPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState<Open>({ kind: "none" });
  const [tested, setTested] = useState<Tested | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchConnections().then(
      (connections) => {
        if (!cancelled) setState({ kind: "loaded", connections });
      },
      (error: unknown) => {
        if (!cancelled) setState({ kind: "failed", message: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function changeConnections(change: (connections: Connection[]) => Connection[]) {
    setState((current) =>
      current.kind === "loaded"
        ? { kind: "loaded", connections: change(current.connections) }
        : current,
    );
  }

  function saved(connection: Connection) {
    changeConnections((connections) =>
      [...connections.filter((c) => c.id !== connection.id), connection].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }

  async function test(connection: Connection) {
    setActionError(null);
    setTested({ kind: "testing", name: connection.name });
    try {
      const result = await testConnection(connection.id);
      setTested({ kind: "done", name: connection.name, result });
    } catch (error) {
      setTested(null);
      setActionError(describeError(error));
    }
  }

  async function toggleVisible(connection: Connection) {
    setActionError(null);
    try {
      saved(await updateConnection(connection.id, { visible: !connection.visible }));
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) setOpen({ kind: "none" });
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold">Connections</h1>
        <p className="text-sm text-muted-foreground">
          The Postgres databases pg_select1 explores. A new one is hidden, for admins only, until
          you make it visible to everyone.
        </p>
      </div>

      {actionError && (
        <p role="alert" className="animate-fade-in text-sm text-destructive">
          {actionError}
        </p>
      )}
      {tested?.kind === "testing" && (
        <p className="text-sm text-muted-foreground">Testing {tested.name}…</p>
      )}
      {tested?.kind === "done" && (
        <div className="flex animate-fade-in items-baseline gap-2">
          <span className="font-mono text-sm">{tested.name}</span>
          <TestResult result={tested.result} />
        </div>
      )}
      {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state.kind === "failed" && (
        <p role="alert" className="animate-fade-in text-sm text-destructive">
          Couldn't load connections: {state.message}
        </p>
      )}
      {state.kind === "loaded" && state.connections.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No connections yet. Add the first database to explore below.
        </div>
      )}
      {state.kind === "loaded" && state.connections.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Database</TableHead>
                <TableHead>SSL</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell className="font-mono font-medium">{connection.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {connection.username}@{connection.host}:{connection.port}/{connection.database}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{connection.sslMode}</TableCell>
                  <TableCell>
                    {connection.visible ? (
                      <Badge variant="outline">
                        <span className="size-1.5 rounded-full bg-success" aria-hidden />
                        visible
                      </Badge>
                    ) : (
                      <Badge variant="secondary">hidden</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${connection.name}`}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setOpen({ kind: "edit", connection });
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void test(connection)}>
                          Test connection
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void toggleVisible(connection)}>
                          {connection.visible ? "Hide" : "Make visible"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            setOpen({ kind: "delete", connection });
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <section aria-labelledby="add-connection" className="mt-4 grid gap-4 rounded-lg border p-6">
        <div>
          <h2 id="add-connection" className="font-semibold">
            Add a connection
          </h2>
          <p className="text-sm text-muted-foreground">
            A Postgres database for pg_select1 to explore. Its password is encrypted, and nobody can
            see it again once it's saved.
          </p>
        </div>
        <ConnectionForm label="Add a connection" onSaved={saved} />
      </section>

      {open.kind === "edit" && (
        <EditConnectionDialog
          connection={open.connection}
          onOpenChange={closeDialog}
          onSaved={saved}
        />
      )}
      {open.kind === "delete" && (
        <DeleteConnectionDialog
          connection={open.connection}
          onOpenChange={closeDialog}
          onDeleted={(id) => {
            changeConnections((connections) => connections.filter((c) => c.id !== id));
          }}
        />
      )}
    </div>
  );
}
