"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection, getDocs, updateDoc, doc, query, where,
  orderBy, addDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  AppShell, EmptyState, Icon, LoadingScreen, PageHeader, PriorityBadge, STATUSES, STATUS_BAR,
  Spinner, StatGrid, StatusBadge, Tabs, Tag, btn, categoryLabel, cx, inputCls, selectCls,
} from "@/components/ui";

type Report = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  dormitory: string;
  roomNumber: string;
  studentName: string;
  assignedTo?: string;
  resolutionNote?: string;
  createdAt: any;
  updatedAt: any;
  photoURL?: string;
};

export default function TechnicianDashboard() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assigned" | "all">("assigned");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== "technician")) router.push("/");
  }, [user, role, loading]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setDataLoading(true);
    // Get technician profile
    const uSnap = await getDocs(
      query(collection(db, "users"), where("email", "==", user!.email))
    );
    let profile = null;
    if (!uSnap.empty) {
      profile = uSnap.docs[0].data();
      setUserProfile(profile);
    }

    // Get all reports (we filter client-side by assignedTo)
    const rSnap = await getDocs(
      query(collection(db, "fault_reports"), orderBy("createdAt", "desc"))
    );
    setReports(rSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
    setDataLoading(false);
  };

  const updateStatus = async (reportId: string, status: string) => {
    setSaving(reportId);
    await updateDoc(doc(db, "fault_reports", reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status } : r))
    );
    setSaving(null);
  };

  const saveNote = async (reportId: string) => {
    const note = noteInputs[reportId];
    if (!note?.trim()) return;
    setSaving(reportId);
    await updateDoc(doc(db, "fault_reports", reportId), {
      resolutionNote: note,
      updatedAt: serverTimestamp(),
    });
    // Log to status_log
    await addDoc(collection(db, "status_log"), {
      reportId,
      technicianName: userProfile?.name || user!.email,
      note,
      timestamp: serverTimestamp(),
    });
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, resolutionNote: note } : r))
    );
    setSaving(null);
  };

  const assignedReports = reports.filter(
    (r) => r.assignedTo === userProfile?.name
  );

  const displayReports =
    activeTab === "assigned" ? assignedReports : reports;

  const filtered = displayReports.filter(
    (r) => filterStatus === "all" || r.status === filterStatus
  );

  const stats = {
    assigned: assignedReports.length,
    inProgress: assignedReports.filter((r) => r.status === "in-progress").length,
    resolved: assignedReports.filter((r) => r.status === "resolved").length,
    open: assignedReports.filter((r) => r.status === "open").length,
  };

  if (loading || dataLoading) {
    return <LoadingScreen label="Loading your work queue…" />;
  }

  const displayName = userProfile?.name || user?.email || "Technician";

  return (
    <AppShell
      role="technician"
      name={displayName}
      detail={userProfile?.specialization || undefined}
      onSignOut={() => signOut(auth).then(() => router.push("/"))}
    >
      <PageHeader
        title="Work queue"
        subtitle={
          stats.assigned === 0
            ? "No jobs are assigned to you right now."
            : `${stats.assigned - stats.resolved} of your ${stats.assigned} assigned job${stats.assigned === 1 ? "" : "s"} still need attention.`
        }
      />

      <StatGrid
        items={[
          { label: "Assigned to me", value: stats.assigned, tone: "solid", icon: <Icon.Pin width={16} height={16} /> },
          { label: "Open", value: stats.open, tone: "plain", icon: <Icon.Alert width={16} height={16} /> },
          { label: "In progress", value: stats.inProgress, tone: "plain", icon: <Icon.Clock width={16} height={16} /> },
          { label: "Resolved", value: stats.resolved, tone: "plain", icon: <Icon.Check width={16} height={16} /> },
        ]}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: "assigned", label: "My assignments", icon: <Icon.Wrench width={16} height={16} />, count: assignedReports.length },
            { value: "all", label: "All reports", icon: <Icon.Clipboard width={16} height={16} />, count: reports.length },
          ]}
        />
        <select
          aria-label="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={cx(selectCls, "w-auto min-w-44")}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={activeTab === "assigned" ? "No assignments yet" : "No reports found"}
          body={
            activeTab === "assigned"
              ? "Reports appear here once an administrator assigns them to you."
              : "Try a different status filter."
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const open = expandedId === r.id;
            const busy = saving === r.id;
            return (
              <li
                key={r.id}
                className={cx(
                  "relative overflow-hidden rounded-xl border bg-surface shadow-card transition",
                  "before:absolute before:inset-y-0 before:left-0 before:w-1",
                  STATUS_BAR[r.status],
                  open ? "border-line-strong shadow-pop" : "border-line hover:border-line-strong"
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpandedId(open ? null : r.id)}
                  className="flex w-full items-start gap-4 p-4 pl-5 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring sm:p-5 sm:pl-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{r.title}</h3>
                      <PriorityBadge priority={r.priority} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                      <Icon.Pin width={14} height={14} />
                      {r.dormitory} · Room {r.roomNumber}
                      <span aria-hidden>·</span>
                      {r.studentName}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Tag>{categoryLabel(r.category)}</Tag>
                      {r.assignedTo && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-ink">
                          <Icon.Wrench width={12} height={12} /> {r.assignedTo}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-muted">{r.createdAt?.toDate?.()?.toLocaleDateString() || "—"}</span>
                    <Icon.ChevronDown
                      width={18}
                      height={18}
                      className={cx("text-muted transition-transform", open && "rotate-180")}
                    />
                  </div>
                </button>

                {open && (
                  <div className="ui-fade-up grid gap-6 border-t border-line px-5 py-5 sm:px-6 md:grid-cols-[1fr_1fr]">
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Description</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{r.description}</p>
                      </div>
                      {r.photoURL && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Photo</p>
                          <a href={r.photoURL} target="_blank" rel="noreferrer" className="mt-2 block">
                            <img
                              src={r.photoURL}
                              alt={`Photo of ${r.title}`}
                              className="max-h-56 w-full rounded-lg border border-line bg-surface-2 object-contain"
                            />
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="space-y-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Update status</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {STATUSES.map((s) => {
                            const current = r.status === s.value;
                            return (
                              <button
                                key={s.value}
                                onClick={() => updateStatus(r.id, s.value)}
                                disabled={current || busy}
                                className={cx(
                                  "rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed",
                                  current
                                    ? "border-brand bg-brand text-on-brand"
                                    : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
                                )}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Resolution note</p>
                        {r.resolutionNote && (
                          <div className="mt-2 rounded-lg border border-line-strong bg-surface-2 px-3.5 py-3 text-sm text-ink">
                            {r.resolutionNote}
                          </div>
                        )}
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveNote(r.id);
                          }}
                        >
                          <input
                            aria-label="Resolution note"
                            value={noteInputs[r.id] || ""}
                            onChange={(e) =>
                              setNoteInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder={r.resolutionNote ? "Replace the note…" : "What was done to fix it?"}
                            className={inputCls}
                          />
                          <button
                            type="submit"
                            disabled={busy || !noteInputs[r.id]?.trim()}
                            className={cx(btn.primary, "shrink-0")}
                          >
                            {busy ? <Spinner /> : "Save"}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
