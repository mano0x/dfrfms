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

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-500/20 text-red-400 border border-red-500/30",
  "in-progress": "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  resolved: "bg-green-500/20 text-green-400 border border-green-500/30",
  closed: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-600/20 text-red-300 border border-red-600/30",
  high: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
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
    if (!loading && (!user || role !== "technician")) router.push("/login");
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
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-900/80 border-b border-gray-800/50 backdrop-blur px-6 py-5 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">DFRFMS</h1>
            <p className="text-xs text-gray-400 mt-1">
              Technician · {userProfile?.name || user?.email}
              {userProfile?.specialization && ` • ${userProfile.specialization}`}
            </p>
          </div>
          <button
            onClick={() => signOut(auth).then(() => router.push("/login"))}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Assigned to Me", value: stats.assigned, color: "from-blue-600 to-cyan-600", icon: "📌" },
            { label: "Open", value: stats.open, color: "from-red-600 to-orange-600", icon: "🔴" },
            { label: "In Progress", value: stats.inProgress, color: "from-yellow-600 to-amber-600", icon: "⏳" },
            { label: "Resolved", value: stats.resolved, color: "from-green-600 to-emerald-600", icon: "✓" },
          ].map((s) => (
            <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-lg p-4 shadow-lg hover:shadow-xl transition`}>
              <p className="text-white/80 text-xs font-medium mb-2">{s.label}</p>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-white">{s.value}</p>
                <span className="text-2xl">{s.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-800">
          {(["assigned", "all"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              {tab === "assigned" ? "My Assignments" : "All Reports"}
            </button>
          ))}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="ml-auto bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Report Cards */}
        {filtered.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <p className="text-gray-500">
              {activeTab === "assigned"
                ? "No reports assigned to you yet. Ask the admin to assign reports."
                : "No reports found."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
              >
                {/* Card Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-gray-800/30 transition"
                  onClick={() =>
                    setExpandedId(expandedId === r.id ? null : r.id)
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-white">{r.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_COLORS[r.priority] || ""}`}>
                          {r.priority}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mt-1">
                        {r.dormitory} / Room {r.roomNumber} · {r.studentName}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <span className="text-xs text-gray-500 capitalize bg-gray-800 px-2 py-1 rounded">
                          {r.category}
                        </span>
                        {r.assignedTo && (
                          <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded">
                            → {r.assignedTo}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_COLORS[r.status] || ""}`}>
                        {r.status}
                      </span>
                      <p className="text-gray-500 text-xs mt-2">
                        {r.createdAt?.toDate?.()?.toLocaleDateString() || "—"}
                      </p>
                      <p className="text-gray-600 text-xs mt-1">
                        {expandedId === r.id ? "▲ collapse" : "▼ expand"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === r.id && (
                  <div className="border-t border-gray-800 p-5 space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Description</p>
                      <p className="text-gray-300 text-sm">{r.description}</p>
                    </div>

                    {r.photoURL && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase mb-2">Photo</p>
                        <img
                          src={r.photoURL}
                          alt="fault"
                          className="rounded-lg max-h-48 object-cover border border-gray-700"
                        />
                      </div>
                    )}

                    {/* Status Update */}
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-2">Update Status</p>
                      <div className="flex gap-2 flex-wrap">
                        {["open", "in-progress", "resolved", "closed"].map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(r.id, s)}
                            disabled={r.status === s || saving === r.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                              r.status === s
                                ? "bg-blue-600 text-white"
                                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
                            } disabled:opacity-50`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Resolution Note */}
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-2">Resolution Note</p>
                      {r.resolutionNote && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 mb-3">
                          <p className="text-green-300 text-sm">{r.resolutionNote}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          value={noteInputs[r.id] || ""}
                          onChange={(e) =>
                            setNoteInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          placeholder="Add resolution note..."
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => saveNote(r.id)}
                          disabled={saving === r.id || !noteInputs[r.id]?.trim()}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition"
                        >
                          {saving === r.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}