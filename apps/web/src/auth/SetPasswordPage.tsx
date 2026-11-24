import { type SubmitEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, describeError } from "@/lib/api";
import { navigate } from "@/router";

import { setPassword } from "./api";

/** Better Auth's default, which the API enforces too. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Lets someone set their password from an invite or set-password link (`/set-password?token=`),
 * then sends them to sign in.
 */
export function SetPasswordPage({ token }: { token: string | null }) {
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setPassword(token, password);
      navigate("/sign-in?password=set");
    } catch (failure) {
      // Better Auth answers 400 for a token that has expired, been used or been replaced.
      const badLink = failure instanceof ApiError && failure.status === 400;
      setError(
        badLink && !/password/i.test(failure.message)
          ? "This link has expired or was already used. Ask an admin for a new one."
          : describeError(failure),
      );
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set your password</CardTitle>
        <CardDescription>At least {MIN_PASSWORD_LENGTH} characters.</CardDescription>
      </CardHeader>
      <CardContent>
        {token ? (
          <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={password}
                onChange={(e) => {
                  setPasswordValue(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                }}
              />
            </div>
            {error && (
              <p role="alert" className="animate-fade-in text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Set password"}
            </Button>
          </form>
        ) : (
          <p role="alert" className="animate-fade-in text-sm text-destructive">
            This link is missing its token. Ask an admin for a new one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
