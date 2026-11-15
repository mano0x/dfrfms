"use client";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Alert, Brand, Field, Icon, Spinner, btn, cx, inputCls } from "@/components/ui";

const FEATURES = [
  {
    icon: Icon.Clipboard,
    title: "Report in under a minute",
    body: "Describe the fault, add a photo, and the priority is calculated for you.",
  },
  {
    icon: Icon.Wrench,
    title: "Technicians stay on track",
    body: "Assigned jobs, status updates and resolution notes in one queue.",
  },
  {
    icon: Icon.Chart,
    title: "Full oversight for admins",
    body: "Search every report, assign work and manage dormitory users.",
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (!snap.exists()) throw new Error("User record not found.");

      const role = snap.data().role;
      if (role === "admin") router.push("/admin");
      else if (role === "technician") router.push("/technician");
      else router.push("/student");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#0f1b3d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#2f5bea] opacity-40 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <Icon.Logo width={24} height={24} strokeWidth={2} />
          </span>
          <div className="leading-tight">
            <p className="text-xl font-bold tracking-tight">DFRFMS</p>
            <p className="text-sm text-white/60">Dormitory Facility Management</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Report it once.
            <br />
            <span className="text-[#9db4ff]">Track it until it&apos;s fixed.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: I, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <I />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm text-white/65">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/45">Dormitory Fault Reporting &amp; Facility Management System</p>
      </aside>

      {/* Sign-in form */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="ui-fade-up w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Brand size="lg" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">Use your campus account to open your dashboard.</p>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <Field label="Email address" htmlFor="email">
              <div className="relative">
                <Icon.Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cx(inputCls, "pl-10")}
                  placeholder="you@example.com"
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Icon.Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cx(inputCls, "pl-10")}
                  placeholder="••••••••"
                />
              </div>
            </Field>

            {error && <Alert tone="error">{error}</Alert>}

            <button type="submit" disabled={loading} className={cx(btn.primary, "w-full py-3")}>
              {loading ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="mt-8 flex items-center gap-2 text-xs text-muted">
            <Icon.Shield width={14} height={14} />
            Accounts are created by your dormitory administrator.
          </p>
        </div>
      </main>
    </div>
  );
}
