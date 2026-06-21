"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading && user) {
      router.push("/student");
    } else if (mounted && !loading && !user) {
      router.push("/login");
    }
  }, [user, loading, mounted, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <div className="mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-400 bg-clip-text text-transparent mb-4">
            DFRFMS
          </h1>
          <p className="text-xl text-gray-300 font-light">
            Dormitory Fault Reporting & Facility Management System
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <span className="text-sm">Redirecting...</span>
        </div>
      </div>
    </div>
  );
}