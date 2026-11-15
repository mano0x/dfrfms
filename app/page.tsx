"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Brand, Icon, LoadingScreen, ROLES } from "@/components/ui";

export default function HomePage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  // Already signed in: go straight to the right dashboard.
  useEffect(() => {
    if (loading || !user || !role) return;
    router.push(`/${role}`);
  }, [user, role, loading, router]);

  if (loading || (user && role)) return <LoadingScreen label="Checking your session…" />;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
        <Brand size="lg" />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="ui-fade-up text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Who are you signing in as?</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Choose your role to continue to the sign-in page. Each role opens its own dashboard.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {ROLES.map(({ value, label, tagline, points, icon: I }, i) => (
            <li key={value} className="ui-fade-up" style={{ animationDelay: `${80 + i * 60}ms` }}>
              <Link
                href={`/login?role=${value}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-pop focus:outline-none focus-visible:ring-4 focus-visible:ring-ring"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand-ink transition group-hover:bg-brand group-hover:text-on-brand">
                  <I width={22} height={22} />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-ink">{label}</h2>
                <p className="mt-1 text-sm text-muted">{tagline}</p>
                <ul className="mt-5 space-y-2 text-sm text-ink-2">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Icon.Check width={16} height={16} className="mt-0.5 shrink-0 text-ink" />
                      {p}
                    </li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-brand">
                  Continue as {label.toLowerCase()}
                  <span aria-hidden className="transition group-hover:translate-x-1">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="px-4 pb-8 text-center text-xs text-muted">
        Dormitory Fault Reporting &amp; Facility Management System
      </footer>
    </div>
  );
}
