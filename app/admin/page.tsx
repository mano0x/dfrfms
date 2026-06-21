"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection, getDocs, updateDoc, doc, query, orderBy, addDoc, serverTimestamp
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

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
  const [createMsg, setCreateMsg] = useState("");

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) router.push("/login");
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
    if (!newName || !newEmail) { setCreateMsg("Name and email are required."); return; }
    await addDoc(collection(db, "users"), {
      name: newName,
      email: newEmail,
      role: newRole,
      dormitory: newDorm || null,
      roomNumber: newRoom || null,
      specialization: newSpec || null,
      createdAt: serverTimestamp(),
    });
    setCreateMsg(`✓ User "${newName}" created successfully.`);
    setNewName(""); setNewEmail(""); setNewDorm(""); setNewRoom(""); setNewSpec("");
    fetchData();
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
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-900/80 border-b border-gray-800/50 backdrop-blur px-6 py-5 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">DFRFMS</h1>
            <p className="text-xs text-gray-400 mt-1">Administrator Dashboard</p>
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
            { label: "Total Reports", value: stats.total, color: "from-blue-600 to-cyan-600", icon: "📊" },
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
          {(["reports", "users", "create-user"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 capitalize ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }`}
            >
              {tab === "create-user" ? "Create User" : tab}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {activeTab === "reports" && (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, student, room..."
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 flex-1 min-w-[200px]"
              />
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
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-left">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Room</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-500 py-8">
                        No reports found.
                      </td>
                    </tr>
                  )}
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{r.title}</p>
                        <p className="text-gray-500 text-xs">{r.studentName}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {r.dormitory} / {r.roomNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${PRIORITY_COLORS[r.priority] || ""}`}>
                          {r.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={r.assignedTo || ""}
                          onChange={(e) => assignTech(r.id, e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="">Unassigned</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_COLORS[r.status] || ""}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-white">{u.name}</td>
                    <td className="px-4 py-3 text-gray-300">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                        u.role === "admin" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" :
                        u.role === "technician" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" :
                        "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {u.role === "student" && `${u.dormitory} / Room ${u.roomNumber}`}
                      {u.role === "technician" && u.specialization}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create User Tab */}
        {activeTab === "create-user" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-lg">
            <h2 className="text-lg font-semibold mb-6">Create New User</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Full Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Jonas Petraitis" />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Email</label>
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="user@example.com" />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none">
                  <option value="student">Student</option>
                  <option value="technician">Technician</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {newRole === "student" && (
                <>
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Dormitory</label>
                    <input value={newDorm} onChange={(e) => setNewDorm(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Dormitory A" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Room Number</label>
                    <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="204" />
                  </div>
                </>
              )}
              {newRole === "technician" && (
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Specialization</label>
                  <input value={newSpec} onChange={(e) => setNewSpec(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Electrical / Plumbing / HVAC" />
                </div>
              )}
              {createMsg && (
                <p className={`text-sm ${createMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                  {createMsg}
                </p>
              )}
              <button onClick={handleCreateUser}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition text-sm">
                Create User
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}