"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection, addDoc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
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
  createdAt: any;
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
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">DFRFMS</h1>
          <p className="text-xs text-gray-400">
            Student — {userProfile?.name || user?.email} &nbsp;·&nbsp;
            {userProfile?.dormitory || "General"} / Room {userProfile?.roomNumber || "N/A"}
          </p>
        </div>
        <button
          onClick={() => signOut(auth).then(() => router.push("/login"))}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Sign Out
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {fetchError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-lg">
            {fetchError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "My Reports", value: stats.total, color: "text-white" },
            { label: "Open", value: stats.open, color: "text-red-400" },
            { label: "In Progress", value: stats.inProgress, color: "text-yellow-400" },
            { label: "Resolved", value: stats.resolved, color: "text-green-400" },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["submit", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
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
                <label className="text-sm text-gray-400 block mb-1">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Broken light switch in bathroom"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none"
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
                  <label className="text-sm text-gray-400 block mb-1">Urgency</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe the issue in detail..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Photo (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-300 text-sm focus:outline-none file:mr-3 file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:text-xs"
                />
              </div>

              {/* Priority preview */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-400">Calculated Priority</span>
                <span className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${PRIORITY_COLORS[calcPriority(category, urgency)]}`}>
                  {calcPriority(category, urgency)}
                </span>
              </div>

              {successMsg && (
                <p className={`text-sm ${successMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                  {successMsg}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition text-sm"
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            <div className="mb-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-gray-500">No reports yet.</p>
                <button
                  onClick={() => setActiveTab("submit")}
                  className="mt-4 text-blue-400 text-sm hover:underline"
                >
                  Submit your first report →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-medium text-white">{r.title}</h3>
                        <p className="text-gray-400 text-sm mt-1">{r.description}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="text-xs text-gray-500 capitalize bg-gray-800 px-2 py-1 rounded">
                            {r.category}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full capitalize ${PRIORITY_COLORS[r.priority] || ""}`}>
                            {r.priority}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_COLORS[r.status] || ""}`}>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}