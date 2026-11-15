"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { allowedNextStatuses, isAssignedTo, isOverdue, type Status } from "@/lib/maintenance";
import { changeStatus, saveResolutionNote, type Actor } from "@/lib/reports";
import { TargetBadge, Timeline } from "@/components/Timeline";
import {
  Alert, AppShell, EmptyState, Icon, LoadingScreen, PageHeader, PriorityBadge, STATUSES, STATUS_BAR,
  Spinner, StatGrid, StatusBadge, Tabs, Tag, btn, categoryLabel, cx, inputCls, selectCls, selectInlineCls, statusLabel,
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
  studentId: string;
  assignedTo?: string | null;
  assignedToId?: string | null;
  resolutionNote?: string;
  createdAt: any;
  updatedAt: any;
  photoURL?: string;
};

export default function TechnicianDashboard() {
  const { user, role, loading, signOut } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assigned" | "all">("assigned");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

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

    // Get all reports (we filter client-side by assignment)
    const rSnap = await getDocs(
      query(collection(db, "fault_reports"), orderBy("createdAt", "desc"))
    );
    setReports(rSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
    setDataLoading(false);
  };

  const actor = (): Actor => ({
    uid: user!.uid,
    name: userProfile?.name || user!.email || "Technician",
    role: "technician",
  });

  // Run one change on a report, showing a message on that report if it fails.
  const run = async (reportId: string, action: () => Promise<void>) => {
    setSaving(reportId);
    setActionError(null);
    try {
      await action();
      setHistoryVersion((v) => v + 1);
    } catch (err) {
      console.error("Report update failed:", err);
      setActionError({
        id: reportId,
        message: err instanceof Error && !("code" in err) ? err.message : "The change could not be saved. Please try again.",
      });
    } finally {
      setSaving(null);
    }
  };

  const updateStatus = (report: Report, status: Status) =>
    run(report.id, async () => {
      await changeStatus(report, status, actor());
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status } : r)));
    });

  const saveNote = (report: Report) =>
    run(report.id, async () => {
      const saved = await saveResolutionNote(report, noteInputs[report.id] || "", actor());
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, resolutionNote: saved } : r)));
      setNoteInputs((prev) => ({ ...prev, [report.id]: "" }));
    });

  const me = { uid: user?.uid, name: userProfile?.name };
  const assignedReports = reports.filter((r) => isAssignedTo(r, me));

  const displayReports =
    activeTab === "assigned" ? assignedReports : reports;

  const filtered = displayReports.filter(
    (r) => filterStatus === "all" || r.status === filterStatus
  );

  const createdDate = (r: Report): Date | null => r.createdAt?.toDate?.() ?? null;

  const stats = {
    assigned: assignedReports.length,
    inProgress: assignedReports.filter((r) => r.status === "in-progress").length,
    resolved: assignedReports.filter((r) => r.status === "resolved").length,
    overdue: assignedReports.filter((r) => isOverdue(createdDate(r), r.priority, r.status)).length,
  };

  if (loading || dataLoading) {
    return <LoadingScreen label="Loading your work queue…" />;
  }

  const displayName = userProfile?.name || user?.email || "Technician";
  const active = assignedReports.filter((r) => r.status === "open" || r.status === "in-progress").length;

  return (
    <AppShell
      role="technician"
      name={displayName}
      detail={userProfile?.specialization || undefined}
      onSignOut={() => signOut().then(() => router.push("/"))}
    >
      <PageHeader
        title="Work queue"
        subtitle={
          stats.assigned === 0
            ? "No jobs are assigned to you right now."
            : `${active} of your ${stats.assigned} assigned job${stats.assigned === 1 ? "" : "s"} still need attention.`
        }
      />

      <StatGrid
        items={[
          { label: "Assigned to me", value: stats.assigned, tone: "solid", icon: <Icon.Pin width={16} height={16} /> },
          { label: "In progress", value: stats.inProgress, tone: "plain", icon: <Icon.Clock width={16} height={16} /> },
          { label: "Overdue", value: stats.overdue, tone: "plain", icon: <Icon.Alert width={16} height={16} /> },
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
          className={cx(selectInlineCls, "min-w-44")}
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
            const mine = isAssignedTo(r, me);
            const nextStatuses = allowedNextStatuses("technician", r.status);
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
                      <TargetBadge createdAt={createdDate(r)} priority={r.priority} status={r.status} />
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
                    <span className="text-xs text-muted">{createdDate(r)?.toLocaleDateString() || "—"}</span>
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
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">History</p>
                        <Timeline reportId={r.id} refreshKey={historyVersion} />
                      </div>
                    </div>

                    <div className="space-y-5">
                      {actionError?.id === r.id && <Alert tone="error">{actionError.message}</Alert>}

                      {!mine ? (
                        <Alert tone="info">
                          {r.assignedTo
                            ? `This report is assigned to ${r.assignedTo}. Only the assigned technician can update it.`
                            : "This report is not assigned yet. An administrator assigns reports to technicians."}
                        </Alert>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Update status</p>
                            <p className="mt-2 text-sm text-ink-2">
                              Current status: <span className="font-medium text-ink">{statusLabel(r.status)}</span>
                            </p>
                            {nextStatuses.length === 0 ? (
                              <p className="mt-2 text-sm text-muted">
                                {r.status === "closed"
                                  ? "This report is closed. Only an administrator can reopen it."
                                  : "No further status changes are available to you."}
                              </p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {nextStatuses.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => updateStatus(r, s)}
                                    disabled={busy}
                                    className={btn.secondary}
                                  >
                                    {r.status === "resolved" && s === "in-progress" ? "Resume work" : `Mark as ${statusLabel(s).toLowerCase()}`}
                                  </button>
                                ))}
                              </div>
                            )}
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
                                saveNote(r);
                              }}
                            >
                              <input
                                aria-label="Resolution note"
                                value={noteInputs[r.id] || ""}
                                onChange={(e) =>
                                  setNoteInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                maxLength={1000}
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
                        </>
                      )}
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
