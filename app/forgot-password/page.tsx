"use client";
import { useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { Alert, Brand, Card, Field, Spinner, btn, cx, inputCls } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setMessage("");
    setSending(true);
    try {
      const res = await api<{ message: string }>("/api/auth/recovery", { method: "POST", body: { email } });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The request could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Brand size="lg" />
        </div>
        <Card className="p-6 sm:p-7">
          <h1 className="text-xl font-bold tracking-tight text-ink">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted">
            Enter the email address of your account. If it is registered, a link to set a new password is sent to it.
          </p>

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Email address" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </Field>

            {message && <Alert tone="success">{message}</Alert>}
            {error && <Alert tone="error">{error}</Alert>}

            <button type="submit" disabled={sending || !email} className={cx(btn.primary, "w-full py-3")}>
              {sending ? (<><Spinner /> Sending…</>) : "Send reset link"}
            </button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
