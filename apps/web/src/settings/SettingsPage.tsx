import {
  CATALOG_REFRESH_MINUTES,
  type CatalogRefreshMinutes,
  DEFAULT_CATALOG_REFRESH_MINUTES,
  type Settings,
} from "@pg_select1/shared";
import { type ReactNode, type SubmitEvent, useEffect, useState } from "react";

import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { describeError } from "@/lib/api";

import { fetchSettings, updateSettings } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; settings: Settings }
  | { kind: "failed"; message: string };

// The interval among the picker's that `minutes` is, the default for one that isn't, as only
// one set by hand in the database could be.
function choiceOf(minutes: number | string): CatalogRefreshMinutes {
  return (
    CATALOG_REFRESH_MINUTES.find((choice) => String(choice) === String(minutes)) ??
    DEFAULT_CATALOG_REFRESH_MINUTES
  );
}

// How an interval reads in the picker: in minutes up to an hour, then in hours.
function everyLabel(minutes: number): string {
  if (minutes === 60) return "Every hour";
  if (minutes === 1440) return "Every day";
  if (minutes > 60) return `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

/**
 * pg_select1's settings, for an admin to change: for now how often the API reads every
 * connection's tables, columns and functions again, for the SQL editor to complete.
 */
export function SettingsPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchSettings().then(
      (settings) => {
        if (!cancelled) setState({ kind: "loaded", settings });
      },
      (error: unknown) => {
        if (!cancelled) setState({ kind: "failed", message: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsLayout>
      {state.kind === "loading" && <Loading />}
      {state.kind === "failed" && (
        <p role="alert" className="animate-fade-in text-sm text-destructive">
          Couldn't load settings: {state.message}
        </p>
      )}
      {state.kind === "loaded" && (
        <CatalogSetting
          settings={state.settings}
          onSaved={(settings) => {
            setState({ kind: "loaded", settings });
          }}
        />
      )}
    </SettingsLayout>
  );
}

/** The Settings page's title over its settings, one card under another. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid max-w-xl gap-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">How pg_select1 runs, for everyone.</p>
      </div>
      {children}
    </div>
  );
}

/**
 * How often the catalog the SQL editor completes from is read, saved on its own and handed to
 * `onSaved` with the other settings as the API answers them.
 */
export function CatalogSetting({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}) {
  return (
    <ChoiceSetting
      id="catalog-refresh"
      title="SQL completion"
      description="The SQL editor completes each connection's tables, columns and functions from a catalog pg_select1 reads from every database as it starts, and then on this schedule. A connection added or changed completes only keywords until the next read."
      label="Read the catalog"
      hint="More often keeps completion closer to the databases, and asks more of them."
      choices={CATALOG_REFRESH_MINUTES.map((minutes) => ({
        value: String(minutes),
        label: everyLabel(minutes),
      }))}
      value={String(choiceOf(settings.catalogRefreshMinutes))}
      onSave={async (next) => {
        const saved = await updateSettings({ catalogRefreshMinutes: choiceOf(next) });
        onSaved(saved);
        return `The catalog is read ${everyLabel(saved.catalogRefreshMinutes).toLowerCase()}.`;
      }}
    />
  );
}

/**
 * One setting picked from a list, in a card of its own with its own Save, which is off until
 * another choice is picked. `onSave` saves the choice and answers what to say once it has; what
 * it throws is shown in its place.
 */
export function ChoiceSetting({
  id,
  title,
  description,
  label,
  hint,
  choices,
  value,
  onSave,
}: {
  id: string;
  title: string;
  description: string;
  label: string;
  hint?: string;
  choices: readonly { value: string; label: string }[];
  /** The choice that's saved now. */
  value: string;
  onSave: (value: string) => Promise<string>;
}) {
  const [picked, setPicked] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDone(await onSave(picked));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Select
              value={picked}
              onValueChange={(next) => {
                setPicked(next);
                setDone(null);
              }}
            >
              <SelectTrigger id={id} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          {error && (
            <p role="alert" className="animate-fade-in text-sm text-destructive">
              {error}
            </p>
          )}
          {done && <output className="block animate-fade-in text-sm text-success">{done}</output>}
          <div>
            <Button type="submit" disabled={busy || picked === value}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
