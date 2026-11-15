"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { LoadingScreen } from "@/components/ui";

export default function HomePage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
    else if (role === "admin") router.push("/admin");
    else if (role === "technician") router.push("/technician");
    else router.push("/student");
  }, [user, role, loading, router]);

  return <LoadingScreen label="Redirecting…" />;
}
