"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { passwordSchema } from "@/lib/auth-rules";
import { Alert, Brand, Card, Field, Spinner, btn, cx, inputCls } from "@/components/ui";

/** Opened from the link in the reset email, which carries `userId` and `secret`. */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = use(searchParams);
  const userId = typeof params.userId === "string" ? params.userId : "";
  const secret = typeof params.secret === "string" ? params.secret : "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid password."); return; }
    if (password !== confirm) { setError("The two passwords do not match."); return; }

    setSaving(true);
    try {
      const res = await api<{ message: string }>("/api/auth/recovery", { method: "PUT", body: { userId, secret, password } });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The password could not be changed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const linkValid = userId !== "" && secret !== "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Brand size="lg" />
        </div>
        <Card className="p-6 sm:p-7">
          <h1 className="text-xl font-bold tracking-tight text-ink">Set a new password</h1>

          {!linkValid ? (
            <div className="mt-5">
              <Alert tone="error">This reset link is incomplete. Open the link from the email again, or request a new one.</Alert>
            </div>
          ) : done ? (
            <div className="mt-5">
              <Alert tone="success">{done}</Alert>
            </div>
          ) : (
            <form
              className="mt-6 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Repeat the new password" htmlFor="confirm-password">
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                />
              </Field>

              {error && <Alert tone="error">{error}</Alert>}

              <button type="submit" disabled={saving} className={cx(btn.primary, "w-full py-3")}>
                {saving ? (<><Spinner /> Saving…</>) : "Change password"}
              </button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-sm">
          <Link href={done || !linkValid ? "/" : "/forgot-password"} className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            {done ? "Go to sign in" : !linkValid ? "Back to sign in" : "Request a new link"}
          </Link>
        </p>
      </div>
    </div>
  );
}
