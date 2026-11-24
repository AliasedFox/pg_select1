import {
  type Connection,
  type SslMode,
  sslMode,
  sslModes,
  type TestConnectionResult,
} from "@pg_select1/shared";
import { type SubmitEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { describeError } from "@/lib/api";

import { createConnection, testSettings, updateConnection } from "./api";
import { parseConnectionUrl, suggestName } from "./url";

// What each SSL mode does, for its picker.
const sslDescriptions: Record<SslMode, string> = {
  disable: "No encryption, as on a local database",
  require: "Encrypted, without checking the server's certificate",
  "verify-full": "Encrypted, with the certificate checked against the host",
};

interface Fields {
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
  visible: boolean;
}

function fieldsOf(connection: Connection | undefined): Fields {
  return {
    name: connection?.name ?? "",
    host: connection?.host ?? "",
    port: String(connection?.port ?? 5432),
    database: connection?.database ?? "",
    username: connection?.username ?? "",
    password: "",
    sslMode: connection?.sslMode ?? "require",
    visible: connection?.visible ?? false,
  };
}

/** Shows a message for something that failed, or nothing. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="animate-fade-in text-sm text-destructive">
      {message}
    </p>
  );
}

/** Shows how testing a connection went: the server's version, or why it failed. */
export function TestResult({ result }: { result: TestConnectionResult }) {
  if (result.ok) {
    return (
      <output className="block animate-fade-in text-sm text-success">
        Connected to PostgreSQL {result.serverVersion} in {result.latencyMs} ms.
      </output>
    );
  }
  return (
    <p role="alert" className="animate-fade-in text-sm text-destructive">
      Couldn't connect: {result.error}
    </p>
  );
}

/**
 * The fields of a connection, to add one, or to change `connection` when given, handing the
 * saved one to `onSaved`. A URL pasted at the top fills in the fields, and **Test connection**
 * tries them as they are, before they're saved. Editing leaves the password blank, which keeps
 * the saved one; adding empties the form again for the next connection.
 */
export function ConnectionForm({
  connection,
  label,
  onSaved,
}: {
  connection?: Connection;
  /** The form's accessible name, such as the heading it sits under. */
  label: string;
  onSaved: (connection: Connection) => void;
}) {
  const id = useId();
  const [fields, setFields] = useState<Fields>(() => fieldsOf(connection));
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestConnectionResult | null>(null);

  function change(changes: Partial<Fields>) {
    setFields((current) => ({ ...current, ...changes }));
    // A test said how the fields were, not how they are now.
    setResult(null);
  }

  function onUrlChange(text: string) {
    setUrl(text);
    const parsed = parseConnectionUrl(text);
    if (!parsed) return;
    const name = fields.name || (parsed.database ? suggestName(parsed.database) : "");
    change({ ...parsed, name });
  }

  const target = {
    host: fields.host,
    port: Number(fields.port),
    database: fields.database,
    username: fields.username,
    sslMode: fields.sslMode,
    password: fields.password,
  };

  async function onTest() {
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      setResult(await testSettings({ ...target, connectionId: connection?.id }));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = { ...target, name: fields.name, visible: fields.visible };
      const saved = connection
        ? await updateConnection(connection.id, input)
        : await createConnection(input);
      if (!connection) {
        setFields(fieldsOf(undefined));
        setUrl("");
        setResult(null);
      }
      onSaved(saved);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label={label} className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-url`}>Connection URL</Label>
        <Input
          id={`${id}-url`}
          placeholder="postgresql://user:password@host:5432/database"
          autoComplete="off"
          className="font-mono text-xs"
          value={url}
          onChange={(e) => {
            onUrlChange(e.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Optional. Paste one to fill in the fields below; it isn't saved as it is.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          required
          className="font-mono"
          value={fields.name}
          onChange={(e) => {
            change({ name: e.target.value });
          }}
        />
        <p className="text-xs text-muted-foreground">
          Lowercase letters, digits and _. Queries across connections use it as a schema.
        </p>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-host`}>Host</Label>
          <Input
            id={`${id}-host`}
            required
            value={fields.host}
            onChange={(e) => {
              change({ host: e.target.value });
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-port`}>Port</Label>
          <Input
            id={`${id}-port`}
            type="number"
            required
            min={1}
            max={65535}
            value={fields.port}
            onChange={(e) => {
              change({ port: e.target.value });
            }}
          />
        </div>
        <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
          As pg_select1's server reaches it. From inside Docker, your machine is
          host.docker.internal.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-database`}>Database</Label>
        <Input
          id={`${id}-database`}
          required
          value={fields.database}
          onChange={(e) => {
            change({ database: e.target.value });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-username`}>User</Label>
          <Input
            id={`${id}-username`}
            required
            autoComplete="off"
            value={fields.username}
            onChange={(e) => {
              change({ username: e.target.value });
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-password`}>Password</Label>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="new-password"
            placeholder={connection?.hasPassword ? "Unchanged" : undefined}
            value={fields.password}
            onChange={(e) => {
              change({ password: e.target.value });
            }}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-ssl`}>SSL</Label>
        <Select
          value={fields.sslMode}
          onValueChange={(next) => {
            change({ sslMode: sslMode.parse(next) });
          }}
        >
          <SelectTrigger id={`${id}-ssl`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sslModes.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{sslDescriptions[fields.sslMode]}</p>
      </div>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-visible`}>Visible to everyone</Label>
          <p className="text-xs text-muted-foreground">
            Hidden, only admins can use it. Visible, everyone signed in can query it.
          </p>
        </div>
        <Switch
          id={`${id}-visible`}
          checked={fields.visible}
          onCheckedChange={(visible) => {
            setFields((current) => ({ ...current, visible }));
          }}
        />
      </div>
      {result && <TestResult result={result} />}
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={testing} onClick={() => void onTest()}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : connection ? "Save" : "Add connection"}
        </Button>
      </div>
    </form>
  );
}
