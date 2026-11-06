"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection, addDoc, getDocs, query, where, serverTimestamp, updateDoc, doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type Report = {
  id: string;
  title: string;
  category: string;
  priority: string;
  urgency?: string;
  status: string;
  studentId: string;
  description: string;
  dormitory: string;
  roomNumber: string;
  createdAt: any;
  assignedTo?: string | null;
  resolutionNote?: string;
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

function calcPriority(category: string, urgency: string): string {
  if (urgency === "emergency") return "critical";
  if (urgency === "urgent") return category === "electrical" || category === "plumbing" ? "high" : "medium";
  return "low";
}

export default function StudentDashboard() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [reports, setReports] = useState<Report[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("electrical");
  const [urgency, setUrgency] = useState("normal");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("electrical");
  const [editUrgency, setEditUrgency] = useState("normal");
  const [editDescription, setEditDescription] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== "student")) router.push("/login");
  }, [user, role, loading]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setDataLoading(true);
      setFetchError(null);

      // 1. Fetch user profile matching the email safely
      const uSnap = await getDocs(query(collection(db, "users"), where("email", "==", user!.email)));
      if (!uSnap.empty) {
        setUserProfile(uSnap.docs[0].data());
      }

      // 2. Fetch reports with a simple single-field query (NO complex index needed!)
      const simpleQuery = query(
        collection(db, "fault_reports"), 
        where("studentId", "==", user!.uid)
      );
      
      const rSnap = await getDocs(simpleQuery);
      const fetchedReports = rSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Report));
      
      // 3. Sort purely inside the browser's JavaScript memory
      fetchedReports.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA; // Descending order: newest first
      });

      setReports(fetchedReports);
    } catch (err: any) {
      console.error("Dashboard core fetching error: ", err);
      setFetchError("Failed to synchronize account info.");
    } finally {
      setDataLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title || !description) { setSuccessMsg("❌ Title and description are required."); return; }
    setSubmitting(true);
    setSuccessMsg("");
    try {
      let photoURL = "";
      if (photo) {
        const storageRef = ref(storage, `fault-photos/${user!.uid}/${Date.now()}_${photo.name}`);
        await uploadBytes(storageRef, photo);
        photoURL = await getDownloadURL(storageRef);
      }

      const priority = calcPriority(category, urgency);

      await addDoc(collection(db, "fault_reports"), {
        title,
        category,
        urgency,
        priority,
        description,
        photoURL,
        status: "open",
        studentId: user!.uid,
        studentName: userProfile?.name || user!.email,
        dormitory: userProfile?.dormitory || "Unknown",
        roomNumber: userProfile?.roomNumber || "Unknown",
        assignedTo: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMsg("✓ Report submitted successfully!");
      setTitle(""); setCategory("electrical"); setUrgency("normal");
      setDescription(""); setPhoto(null);
      fetchData();
      setTimeout(() => setActiveTab("history"), 1500);
    } catch (e) {
      setSuccessMsg("❌ Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const canEditReport = (report: Report) =>
    report.status === "open" && !report.assignedTo && report.studentId === user?.uid;

  const openReport = (report: Report) => {
    setSelectedReport(report);
    setEditing(false);
    setEditError("");
    setEditTitle(report.title);
    setEditCategory(report.category);
    setEditUrgency(report.urgency || "normal");
    setEditDescription(report.description);
    setEditPhoto(null);
  };

  const handleEditSave = async () => {
    if (!selectedReport || !user || !canEditReport(selectedReport)) {
      setEditError("This report can no longer be edited.");
      return;
    }
    if (!editTitle.trim() || !editDescription.trim()) {
      setEditError("Title and description are required.");
      return;
    }

    setSavingEdit(true);
    setEditError("");
    try {
      let photoURL = selectedReport.photoURL || "";
      if (editPhoto) {
        const storageRef = ref(storage, `fault-photos/${user.uid}/${Date.now()}_${editPhoto.name}`);
        await uploadBytes(storageRef, editPhoto);
        photoURL = await getDownloadURL(storageRef);
      }

      const changes = {
        title: editTitle.trim(),
        category: editCategory,
        urgency: editUrgency,
        priority: calcPriority(editCategory, editUrgency),
        description: editDescription.trim(),
        photoURL,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, "fault_reports", selectedReport.id), changes);

      const updatedReport: Report = {
        ...selectedReport,
        title: changes.title,
        category: changes.category,
        urgency: changes.urgency,
        priority: changes.priority,
        description: changes.description,
        photoURL: changes.photoURL,
      };
      setReports((current) =>
        current.map((report) => report.id === selectedReport.id ? updatedReport : report)
      );
      setSelectedReport(updatedReport);
      setEditing(false);
      setEditPhoto(null);
    } catch (error) {
      console.error("Report update failed:", error);
      setEditError("Could not save your changes. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const filtered = reports.filter(
    (r) => filterStatus === "all" || r.status === filterStatus
  );

  const stats = {
    total: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    inProgress: reports.filter((r) => r.status === "in-progress").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-2">
        <p className="text-gray-400 text-sm">Loading Student Workspace...</p>
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-900/80 border-b border-gray-800/50 backdrop-blur px-6 py-5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">DFRFMS</h1>
            <p className="text-xs text-gray-400 mt-1">
              Student · {userProfile?.name || user?.email} • {userProfile?.dormitory || "General"} / Room {userProfile?.roomNumber || "N/A"}
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        {fetchError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-300 text-xs p-4 rounded-lg">
            {fetchError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "My Reports", value: stats.total, color: "from-blue-600 to-cyan-600", icon: "📋" },
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
          {(["submit", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              {tab === "submit" ? "Submit Report" : "My Reports"}
            </button>
          ))}
        </div>

        {/* Submit Tab */}
        {activeTab === "submit" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-6">New Fault Report</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 font-medium block mb-2">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Broken light switch in bathroom"
                  className="w-full bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-300 font-medium block mb-2">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  >
                    <option value="electrical">Electrical</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="hvac">HVAC / Heating</option>
                    <option value="structural">Structural</option>
                    <option value="internet">Internet / Network</option>
                    <option value="furniture">Furniture</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-medium block mb-2">Urgency</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-300 font-medium block mb-2">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe the issue in detail..."
                  className="w-full bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none transition"
                />
              </div>

              <div>
                <label className="text-sm text-gray-300 font-medium block mb-2">Photo (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                  className="w-full bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-3 text-gray-300 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 file:mr-3 file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-4 file:py-2 file:text-xs file:font-medium hover:file:bg-blue-700 transition cursor-pointer"
                />
              </div>

              {/* Priority preview */}
              <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-300 font-medium">Calculated Priority</span>
                <span className={`text-xs px-3 py-1 rounded-full capitalize font-semibold ${PRIORITY_COLORS[calcPriority(category, urgency)]}`}>
                  {calcPriority(category, urgency)}
                </span>
              </div>

              {successMsg && (
                <p className={`text-sm font-medium ${successMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                  {successMsg}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition duration-200 shadow-lg hover:shadow-xl"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Submitting...
                  </span>
                ) : (
                  "Submit Report"
                )}
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            <div className="mb-4 flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-gray-800/50 border border-gray-700 hover:border-gray-600 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-gray-400">No reports yet.</p>
                <button
                  onClick={() => setActiveTab("submit")}
                  className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium transition"
                >
                  Submit your first report →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openReport(r)}
                    className="w-full text-left bg-gray-900/50 border border-gray-800 hover:border-blue-500/50 rounded-xl p-5 transition group focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    aria-label={`View details for ${r.title}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white group-hover:text-blue-300 transition">{r.title}</h3>
                        <p className="text-gray-400 text-sm mt-1">{r.description}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-md font-medium">
                            {r.category}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-md font-semibold ${PRIORITY_COLORS[r.priority] || ""}`}>
                            {r.priority}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-md font-semibold block ${STATUS_COLORS[r.status] || ""}`}>
                          {r.status}
                        </span>
                        <p className="text-gray-500 text-xs mt-2">
                          {r.createdAt?.toDate?.()?.toLocaleDateString() || "—"}
                        </p>
                      </div>
                    </div>
                    {r.photoURL && (
                      <img
                        src={r.photoURL}
                        alt="fault photo"
                        className="mt-4 rounded-lg max-h-48 object-cover border border-gray-700"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedReport && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setSelectedReport(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-details-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Report details</p>
                <h2 id="report-details-title" className="mt-1 text-xl font-bold text-white">
                  {selectedReport.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="rounded-lg px-2 py-1 text-xl text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label="Close report details"
              >
                ×
              </button>
            </div>

            {canEditReport(selectedReport) && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Edit report
              </button>
            )}

            {editing ? (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Title *</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">Category</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="electrical">Electrical</option>
                      <option value="plumbing">Plumbing</option>
                      <option value="hvac">HVAC / Heating</option>
                      <option value="structural">Structural</option>
                      <option value="internet">Internet / Network</option>
                      <option value="furniture">Furniture</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">Urgency</label>
                    <select
                      value={editUrgency}
                      onChange={(e) => setEditUrgency(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Description *</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={5}
                    className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Replace photograph</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditPhoto(e.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-gray-300"
                  />
                </div>
                {editError && <p className="text-sm text-red-400">{editError}</p>}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setEditError(""); }}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleEditSave}
                    disabled={savingEdit}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingEdit ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Report ID</p>
                <p className="mt-1 break-all text-sm text-gray-200">{selectedReport.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Submitted</p>
                <p className="mt-1 text-sm text-gray-200">
                  {selectedReport.createdAt?.toDate?.()?.toLocaleString() || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Category</p>
                <p className="mt-1 capitalize text-sm text-gray-200">{selectedReport.category}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Priority</p>
                <span className={`mt-1 inline-block rounded-md px-2.5 py-1 text-xs font-semibold ${PRIORITY_COLORS[selectedReport.priority] || ""}`}>
                  {selectedReport.priority}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span className={`mt-1 inline-block rounded-md px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[selectedReport.status] || ""}`}>
                  {selectedReport.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500">Assigned technician</p>
                <p className="mt-1 text-sm text-gray-200">{selectedReport.assignedTo || "Not assigned"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Location</p>
                <p className="mt-1 text-sm text-gray-200">
                  {selectedReport.dormitory || "—"} / Room {selectedReport.roomNumber || "—"}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs text-gray-500">Description</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-200">{selectedReport.description}</p>
            </div>

            <div className="mt-6 rounded-lg border border-gray-800 bg-gray-950/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Maintenance progress</p>
              <p className="mt-2 text-sm text-gray-200">
                Current status: <span className="capitalize">{selectedReport.status}</span>
              </p>
              <p className="mt-2 text-sm text-gray-400">
                {selectedReport.resolutionNote || "No technician notes have been added yet."}
              </p>
            </div>

            {selectedReport.photoURL && (
              <div className="mt-6">
                <p className="text-xs text-gray-500">Photograph</p>
                <img
                  src={selectedReport.photoURL}
                  alt={`Photograph for ${selectedReport.title}`}
                  className="mt-2 max-h-80 w-full rounded-lg border border-gray-700 object-contain"
                />
              </div>
            )}
              </>
                                                                                                                                                        )}
          </section>
        </div>
      )}
    </div>
  );
}