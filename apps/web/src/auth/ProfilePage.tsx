import { type Me, MIN_PASSWORD_LENGTH } from "@pg_select1/shared";
import { type SubmitEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, describeError } from "@/lib/api";

import { changePassword, updateMe } from "./api";
import { useSession } from "./session";

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="animate-fade-in text-sm text-destructive">
      {message}
    </p>
  );
}

function FormDone({ message }: { message: string | null }) {
  if (!message) return null;
  return <output className="block animate-fade-in text-sm text-success">{message}</output>;
}

/**
 * The signed-in user's own page: their email, which they can't change, their name, which they
 * can, and their password, which they change by giving the current one.
 */
export function ProfilePage({ user }: { user: Me }) {
  return (
    <div className="grid max-w-xl gap-6">
      <div>
        <h1 className="text-lg font-semibold">Your profile</h1>
        <p className="text-sm text-muted-foreground">How you sign in, and the name others see.</p>
      </div>
      <DetailsCard user={user} />
      <PasswordCard />
    </div>
  );
}

function DetailsCard({ user }: { user: Me }) {
  const { refresh } = useSession();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unchanged = name.trim() === user.name;

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const saved = await updateMe({ name });
      setName(saved.name);
      // The header and its menu show the name from the session, so ask for it again.
      await refresh();
      setDone("Your name is saved.");
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              readOnly
              value={user.email}
              aria-describedby="profile-email-hint"
              className="bg-muted text-muted-foreground"
            />
            <p id="profile-email-hint" className="text-xs text-muted-foreground">
              You sign in with it, so it can't be changed.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              autoComplete="name"
              required
              maxLength={200}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDone(null);
              }}
            />
          </div>
          <FormError message={error} />
          <FormDone message={done} />
          <div>
            <Button type="submit" disabled={busy || unchanged}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    if (password !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, password);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setDone("Your password is changed, and you're signed out everywhere else.");
    } catch (failure) {
      // Better Auth answers 400 "Invalid password" when the current one is wrong.
      const wrongCurrent =
        failure instanceof ApiError &&
        failure.status === 400 &&
        /invalid password/i.test(failure.message);
      setError(wrongCurrent ? "Your current password is wrong." : describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          At least {MIN_PASSWORD_LENGTH} characters. Changing it signs you out everywhere else.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
              }}
            />
          </div>
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
                setPassword(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
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
          <FormError message={error} />
          <FormDone message={done} />
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
