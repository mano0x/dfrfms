"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection, getDocs, updateDoc, doc, query, orderBy, setDoc, serverTimestamp
} from "firebase/firestore";
import { auth, db, getAccountCreationAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  Alert, AppShell, Card, Field, Icon, LoadingScreen, PRIORITIES, PageHeader, PriorityBadge,
  STATUSES, Spinner, StatGrid, StatusBadge, Tabs, btn, cx, inputCls, selectCls,
} from "@/components/ui";

type Report = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  dormitory: string;
  roomNumber: string;
  studentName: string;
  description: string;
  createdAt: any;
  assignedTo?: string;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  dormitory?: string;
  roomNumber?: string;
  specialization?: string;
};

const ROLE_TONE: Record<string, string> = {
  admin: "bg-ink text-on-brand ring-ink",
  technician: "bg-surface-2 text-ink ring-line-strong",
  student: "bg-transparent text-ink-2 ring-line",
};

const tableSelect =
  "ui-select rounded-md border border-line bg-surface py-1.5 pl-2.5 text-xs font-medium text-ink transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-ring";

export default function AdminDashboard() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "create-user">("reports");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [dataLoading, setDataLoading] = useState(true);

  // Create user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("student");
  const [newDorm, setNewDorm] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [newSpec, setNewSpec] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) router.push("/");
  }, [user, role, loading]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setDataLoading(true);
    const [rSnap, uSnap] = await Promise.all([
      getDocs(query(collection(db, "fault_reports"), orderBy("createdAt", "desc"))),
      getDocs(collection(db, "users")),
    ]);
    setReports(rSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
    setUsers(uSnap.docs.map((d) => ({ id: d.id, ...d.data() } as UserRecord)));
    setDataLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "fault_reports", id), { status, updatedAt: serverTimestamp() });
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const assignTech = async (reportId: string, techName: string) => {
    await updateDoc(doc(db, "fault_reports", reportId), {
      assignedTo: techName,
      status: "in-progress",
      updatedAt: serverTimestamp(),
    });
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, assignedTo: techName, status: "in-progress" } : r))
    );
  };

  const handleCreateUser = async () => {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name || !email) { setCreateMsg("Name and email are required."); return; }
    if (newPassword.length < 6) { setCreateMsg("The starting password must be at least 6 characters."); return; }

    setCreating(true);
    setCreateMsg("");
    const creationAuth = getAccountCreationAuth();
    try {
      // 1. Create the sign-in account on a separate auth instance so the
      //    admin stays signed in.
      const cred = await createUserWithEmailAndPassword(creationAuth, email, newPassword);

      // 2. Save the profile under the account's UID — this is the document
      //    the login page and AuthContext read to find the user's role.
      //    Written with the admin's own session, as required by the rules.
      await setDoc(doc(db, "users", cred.user.uid), {
        name,
        email,
        role: newRole,
        dormitory: newRole === "student" ? newDorm || null : null,
        roomNumber: newRole === "student" ? newRoom || null : null,
        specialization: newRole === "technician" ? newSpec || null : null,
        createdAt: serverTimestamp(),
      });

      setCreateMsg(`✓ User "${name}" created. They can now sign in with ${email}.`);
      setNewName(""); setNewEmail(""); setNewDorm(""); setNewRoom(""); setNewSpec(""); setNewPassword("");
      fetchData();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setCreateMsg(
        code === "auth/email-already-in-use" ? "An account with this email already exists." :
        code === "auth/invalid-email" ? "That email address is not valid." :
        code === "auth/weak-password" ? "The starting password is too weak (at least 6 characters)." :
        code === "auth/operation-not-allowed" ? "Email/password sign-in is not enabled in Firebase Authentication." :
        code === "permission-denied" ? "The account was created, but saving the profile was blocked by the security rules." :
        "Could not create the user. Please try again."
      );
    } finally {
      await signOut(creationAuth).catch(() => {});
      setCreating(false);
    }
  };

  const technicians = users.filter((u) => u.role === "technician");

  const filtered = reports.filter((r) => {
    const matchSearch =
      r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.studentName?.toLowerCase().includes(search.toLowerCase()) ||
      r.roomNumber?.includes(search);
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchPriority = filterPriority === "all" || r.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const stats = {
    total: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    inProgress: reports.filter((r) => r.status === "in-progress").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  if (loading || dataLoading) {
    return <LoadingScreen label="Loading the admin console…" />;
  }

  const unassigned = reports.filter((r) => !r.assignedTo && r.status === "open").length;
  const filtersActive = search || filterStatus !== "all" || filterPriority !== "all";

  return (
    <AppShell
      role="admin"
      name={user?.email || "Administrator"}
      detail="Administrator"
      onSignOut={() => signOut(auth).then(() => router.push("/"))}
    >
      <PageHeader
        title="Admin console"
        subtitle={
          unassigned > 0
            ? `${unassigned} open report${unassigned === 1 ? "" : "s"} waiting for a technician.`
            : "Every open report has a technician assigned."
        }
        action={
          activeTab !== "create-user" && (
            <button className={btn.primary} onClick={() => setActiveTab("create-user")}>
              <Icon.UserPlus width={16} height={16} /> Add user
            </button>
          )
        }
      />

      <StatGrid
        items={[
          { label: "Total reports", value: stats.total, tone: "solid", icon: <Icon.Chart width={16} height={16} /> },
          { label: "Open", value: stats.open, tone: "plain", icon: <Icon.Alert width={16} height={16} /> },
          { label: "In progress", value: stats.inProgress, tone: "plain", icon: <Icon.Clock width={16} height={16} /> },
          { label: "Resolved", value: stats.resolved, tone: "plain", icon: <Icon.Check width={16} height={16} /> },
        ]}
      />

      <div className="mb-5">
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: "reports", label: "Reports", icon: <Icon.Clipboard width={16} height={16} />, count: reports.length },
            { value: "users", label: "Users", icon: <Icon.Users width={16} height={16} />, count: users.length },
            { value: "create-user", label: "Create user", icon: <Icon.UserPlus width={16} height={16} /> },
          ]}
        />
      </div>

      {/* Reports */}
      {activeTab === "reports" && (
        <div className="ui-fade-up">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
              <input
                aria-label="Search reports"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, student or room…"
                className={cx(inputCls, "pl-10")}
              />
            </div>
            <select aria-label="Filter by status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cx(selectCls, "w-auto min-w-40")}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select aria-label="Filter by priority" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={cx(selectCls, "w-auto min-w-40")}>
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {filtersActive && (
              <button
                className={btn.ghost}
                onClick={() => { setSearch(""); setFilterStatus("all"); setFilterPriority("all"); }}
              >
                <Icon.X width={16} height={16} /> Clear
              </button>
            )}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/70 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Report</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Change status</th>
                    <th className="px-4 py-3">Technician</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-muted">
                        No reports match your filters.
                      </td>
                    </tr>
                  )}
                  {filtered.map((r) => (
                    <tr key={r.id} className="transition hover:bg-surface-2/50">
                      <td className="max-w-[280px] px-4 py-3">
                        <p className="truncate font-medium text-ink">{r.title}</p>
                        <p className="truncate text-xs text-muted">
                          {r.studentName} · {r.createdAt?.toDate?.()?.toLocaleDateString() || "—"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-2">
                        {r.dormitory} · {r.roomNumber}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Status for ${r.title}`}
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          className={tableSelect}
                        >
                          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Technician for ${r.title}`}
                          value={r.assignedTo || ""}
                          onChange={(e) => assignTech(r.id, e.target.value)}
                          className={cx(tableSelect, !r.assignedTo && "border-dashed text-muted")}
                        >
                          <option value="">Unassigned</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
              Showing {filtered.length} of {reports.length} reports
            </div>
          </Card>
        </div>
      )}

      {/* Users */}
      {activeTab === "users" && (
        <Card className="ui-fade-up overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/70 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="transition hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink-2">
                          {(u.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                        </span>
                        <span className="font-medium text-ink">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset", ROLE_TONE[u.role] ?? ROLE_TONE.student)}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {u.role === "student" && `${u.dormitory} · Room ${u.roomNumber}`}
                      {u.role === "technician" && u.specialization}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create user */}
      {activeTab === "create-user" && (
        <div className="ui-fade-up grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
          <Card className="p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-ink">Create a user profile</h2>
            <p className="mt-1 text-sm text-muted">The profile decides which dashboard the person sees after signing in.</p>
            <form
              className="mt-6 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateUser();
              }}
            >
              <Field label="Role">
                <div role="radiogroup" className="grid grid-cols-3 gap-2">
                  {[
                    { value: "student", label: "Student" },
                    { value: "technician", label: "Technician" },
                    { value: "admin", label: "Admin" },
                  ].map((r) => (
                    <label
                      key={r.value}
                      className={cx(
                        "cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-semibold transition focus-within:ring-4 focus-within:ring-ring",
                        newRole === r.value ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-ink-2 hover:border-line-strong"
                      )}
                    >
                      <input type="radio" name="role" value={r.value} checked={newRole === r.value} onChange={() => setNewRole(r.value)} className="sr-only" />
                      {r.label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Full name" required htmlFor="new-name">
                <input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} placeholder="Jonas Petraitis" />
              </Field>
              <Field label="Email" required htmlFor="new-email">
                <input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} placeholder="user@example.com" />
              </Field>
              <Field label="Starting password" required htmlFor="new-password" hint="At least 6 characters. Share it with the user privately.">
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </Field>
              {newRole === "student" && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Dormitory" htmlFor="new-dorm">
                    <input id="new-dorm" value={newDorm} onChange={(e) => setNewDorm(e.target.value)} className={inputCls} placeholder="Dormitory A" />
                  </Field>
                  <Field label="Room number" htmlFor="new-room">
                    <input id="new-room" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} className={inputCls} placeholder="204" />
                  </Field>
                </div>
              )}
              {newRole === "technician" && (
                <Field label="Specialization" htmlFor="new-spec">
                  <input id="new-spec" value={newSpec} onChange={(e) => setNewSpec(e.target.value)} className={inputCls} placeholder="Electrical / Plumbing / HVAC" />
                </Field>
              )}
              {createMsg && (
                <Alert tone={createMsg.startsWith("✓") ? "success" : "error"}>
                  {createMsg.replace(/^✓\s*/, "")}
                </Alert>
              )}
              <button type="submit" disabled={creating} className={cx(btn.primary, "w-full py-3")}>
                {creating ? (<><Spinner /> Creating…</>) : (<><Icon.UserPlus width={16} height={16} /> Create user</>)}
              </button>
            </form>
          </Card>
          <Card className="h-fit p-5">
            <div className="flex items-center gap-2 text-ink">
              <Icon.Shield width={16} height={16} />
              <p className="text-sm font-semibold">About user profiles</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              This creates the person&apos;s sign-in account (email and starting password) in Firebase
              Authentication and saves their profile under the same account ID. The role decides which
              dashboard they see after signing in.
            </p>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
