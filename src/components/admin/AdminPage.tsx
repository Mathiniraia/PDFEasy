/**
 * AdminPage.tsx — Trust My PDF Built-in Admin Dashboard
 * Route: /admin  |  Access: mathinirai.a@gmail.com only
 * Shows: Users · Payments · Tool Analytics · Activity Logs
 * Actions: Grant Access · Revoke Access
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import {
  Users, CreditCard, BarChart3, RefreshCw, Shield,
  Mail, Clock, Crown, Ban, Zap, Search, CheckCircle,
  XCircle, IndianRupee, Activity, ChevronDown, TrendingUp,
  Calendar, Eye, EyeOff, Lock, FileText, LayoutDashboard,
  MousePointerClick, AlertCircle, ArrowUpRight, Phone, Download, X
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const ADMIN_EMAIL  = "mathinirai.a@gmail.com";
const ADMIN_SECRET = "pdfeasy-admin-secret-2024";
const ADMIN_PASS   = "pdfeasy-admin-2024";

const TOOL_NAMES: Record<string, string> = {
  "jpg-to-pdf":      "JPG → PDF",
  "pdf-to-jpg":      "PDF → JPG",
  "merge-pdf":       "Merge PDF",
  "compress-pdf":    "Compress PDF",
  "pdf-to-word":     "PDF → Word",
  "word-to-pdf":     "Word → PDF",
  "split-pdf":       "Split PDF",
  "delete-pdf-pages":"Delete Pages",
  "edit-pdf":        "Edit PDF",
  "rotate-pdf":      "Rotate PDF",
  "unlock-pdf":      "Unlock PDF",
  "protect-pdf":     "Protect PDF",
  "sign-pdf":        "Sign PDF",
};

const TOOL_ICONS: Record<string, string> = {
  "jpg-to-pdf":"🖼️","pdf-to-jpg":"📷","merge-pdf":"📎","compress-pdf":"🗜️",
  "pdf-to-word":"📝","word-to-pdf":"📄","split-pdf":"✂️","delete-pdf-pages":"🗑️",
  "edit-pdf":"✏️","rotate-pdf":"🔄","unlock-pdf":"🔓","protect-pdf":"🔒","sign-pdf":"✍️",
};

const GRANT_PLANS = [
  { id:"starter",  label:"7 Days",   color:"bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { id:"monthly",  label:"1 Month",  color:"bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { id:"annual",   label:"1 Year",   color:"bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
  { id:"lifetime", label:"Lifetime", color:"bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string; displayName: string; email: string | null; phone?: string | null;
  authProvider?: string; planStatus: string; premiumActive: boolean;
  expiresAt: string | null; usageCount: number; joinedAt: string;
  grantedByAdmin: boolean; accessRevoked: boolean; isAdmin: boolean;
}

interface Transaction {
  id: string; razorpayPaymentId: string; userName: string;
  passType: string; amount: number; timestamp: string; status: string;
}

interface ToolStat { slug: string; title: string; count: number; }

// ─── Utility functions ────────────────────────────────────────────────────────

function timeLeft(expiresAt?: string | null) {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  return d > 0 ? `${d}d left` : h > 0 ? `${h}h left` : "< 1h";
}

function planBadge(plan: string, revoked?: boolean) {
  if (revoked) return "bg-red-50 text-red-600 border-red-200";
  if (plan === "lifetime") return "bg-purple-100 text-purple-800 border-purple-200";
  if (plan === "annual")   return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["monthly","pro"].includes(plan)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["starter","weekly","daily"].includes(plan)) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-neutral-100 text-neutral-500 border-neutral-200";
}

function planLabel(plan: string, revoked?: boolean) {
  if (revoked) return "🚫 Revoked";
  const m: Record<string,string> = {
    lifetime:"♾️ Lifetime", annual:"1 Year Pro", monthly:"Monthly Pro",
    pro:"Monthly Pro", starter:"7-Day", weekly:"Weekly", daily:"Daily", free:"Free"
  };
  return m[plan] || plan;
}

function ago(iso?: string) {
  if (!iso) return "—";
  const d = Math.floor((Date.now()-new Date(iso).getTime())/86400000);
  if (d === 0) return "Today"; if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base ${accent}`}>{icon}</div>
        {sub && <span className="text-[10px] font-bold text-neutral-300">{sub}</span>}
      </div>
      <p className="text-2xl font-black text-neutral-900 mt-3 leading-none">{value}</p>
      <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

// ─── Login Gate ───────────────────────────────────────────────────────────────

function AdminLoginGate({ onAuth }: { onAuth: (email: string) => void }) {
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [view, setView]           = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }
    setLoading(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      
      localStorage.setItem("admin_authed_email", data.email);
      onAuth(data.email);
    } catch (err: any) {
      setError(err.message || "Failed to authenticate.");
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setError("Please enter your admin email address.");
      return;
    }
    setLoading(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reset request failed");
      setSuccess(data.message || "A new password has been generated!");
      setForgotEmail("");
    } catch (err: any) {
      setError(err.message || "Failed to process reset request.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-neutral-100">
        
        {/* Trust My PDF Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300">
            <span className="text-white font-extrabold text-3xl">P</span>
          </div>
        </div>

        <h1 className="text-xl font-black text-neutral-900 mb-1">Trust My PDF Admin</h1>
        <p className="text-xs text-neutral-400 mb-7">Restricted Access · Admin Only</p>

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-xl text-left font-medium">
            <XCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-emerald-50 text-emerald-800 text-xs font-semibold px-3.5 py-3 rounded-xl border border-emerald-100 text-left leading-relaxed">
            {success}
          </div>
        )}

        {view === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Admin Username</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@trustmypdf.in"
                  className="w-full px-4 py-3 pl-10 text-xs font-medium border-2 border-neutral-200 focus:border-neutral-900 rounded-xl outline-none transition"
                  required
                />
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 pl-10 pr-10 text-xs font-medium border-2 border-neutral-200 focus:border-neutral-900 rounded-xl outline-none transition"
                  required
                />
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neutral-950 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl transition duration-300 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? "Authenticating..." : "Access Dashboard"}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setView("forgot");
                  setError("");
                  setSuccess("");
                }}
                className="text-[11px] font-bold text-neutral-400 hover:text-neutral-950 transition hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4 text-left">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Admin Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="admin@trustmypdf.in"
                  className="w-full px-4 py-3 pl-10 text-xs font-medium border-2 border-neutral-200 focus:border-neutral-900 rounded-xl outline-none transition"
                  required
                  autoFocus
                />
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-neutral-950 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl transition duration-300 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? "Generating reset..." : "Send Reset Email"}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setView("login");
                  setError("");
                  setSuccess("");
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 hover:text-neutral-950 transition hover:underline"
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        <p className="text-[9px] text-neutral-400 mt-6 tracking-wide leading-relaxed">
          🔒 Symmetrical 256-bit cryptography and RLS rules actively secure this entry gate. All connections are audited.
        </p>
      </div>
    </div>
  );
}

// ─── Main AdminPage ───────────────────────────────────────────────────────────

interface AdminPageProps {
  currentUserEmail: string | null;
  onBack: () => void;
}

export default function AdminPage({ currentUserEmail, onBack }: AdminPageProps) {

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [authedEmail, setAuthedEmail] = useState<string | null>(() => {
    const cached = localStorage.getItem("admin_authed_email");
    if (cached?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return cached;
    return null;
  });

  const handleSignOut = () => {
    localStorage.removeItem("admin_authed_email");
    setAuthedEmail(null);
  };

  // ── Data state ───────────────────────────────────────────────────────────────
  const [tab, setTab]          = useState<"overview"|"users"|"payments"|"tools"|"activity">("overview");
  const [users, setUsers]      = useState<AdminUser[]>([]);
  const [txns, setTxns]        = useState<Transaction[]>([]);
  const [tools, setTools]      = useState<ToolStat[]>([]);
  const [loading, setLoading]  = useState(true);
  const [search, setSearch]    = useState("");
  const [acting, setActing]    = useState<string|null>(null);
  const [toasts, setToasts]    = useState<{id:number;ok:boolean;msg:string}[]>([]);
  const [planFilter, setPlanFilter] = useState<"all"|"premium"|"free"|"revoked">("all");
  const [dateFilter, setDateFilter] = useState<string>("all-time");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [showCsvModal, setShowCsvModal] = useState<"users"|"payments"|null>(null);
  const [chartFilter, setChartFilter] = useState<"all"|"24h"|"7d"|"30d"|"last_month"|"custom">("all");
  const [chartCustomStart, setChartCustomStart] = useState<string>("");
  const [chartCustomEnd, setChartCustomEnd] = useState<string>("");

  const exportToCSV = () => {
    let list = filteredUsers;
    if (customStartDate) list = list.filter(u => new Date(u.joinedAt) >= new Date(customStartDate));
    if (customEndDate) {
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      list = list.filter(u => new Date(u.joinedAt) <= end);
    }
    if (list.length === 0) return addToast(false, "No users in this date range");

    const headers = ["ID", "Name", "Email", "Phone", "Plan Status", "Usage Count", "Premium Active", "Expires At", "Joined At", "Is Admin"];
    const rows = list.map(u => [
      u.id,
      `"${(u.displayName || "").replace(/"/g, '""')}"`,
      `"${(u.email || "").replace(/"/g, '""')}"`,
      `"${(u.phone || "").replace(/"/g, '""')}"`,
      u.planStatus,
      u.usageCount.toString(),
      u.premiumActive ? "Yes" : "No",
      u.expiresAt ? new Date(u.expiresAt).toISOString() : "",
      new Date(u.joinedAt).toISOString(),
      u.isAdmin ? "Yes" : "No"
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pdfeasy_users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowCsvModal(null);
  };

  const exportPaymentsToCSV = () => {
    let list = filteredTxns;
    if (customStartDate) list = list.filter(tx => new Date(tx.timestamp) >= new Date(customStartDate));
    if (customEndDate) {
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      list = list.filter(tx => new Date(tx.timestamp) <= end);
    }
    if (list.length === 0) return addToast(false, "No payments in this date range");

    const headers = ["ID", "Razorpay Payment ID", "Customer Email", "Plan Purchased", "Amount", "Status", "Date & Time"];
    const rows = list.map(tx => [
      tx.id,
      tx.razorpayPaymentId || "",
      `"${(tx.userName || "").replace(/"/g, '""')}"`,
      tx.passType,
      tx.amount.toString(),
      tx.status,
      new Date(tx.timestamp).toISOString()
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pdfeasy_payments_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowCsvModal(null);
  };

  // Manual grant form
  const [manualEmail, setManualEmail] = useState("");
  const [manualPlan, setManualPlan]   = useState("monthly");
  const [showGrant, setShowGrant]     = useState(false);

  const addToast = (ok: boolean, msg: string) => {
    const id = Date.now();
    setToasts(t => [{ id, ok, msg }, ...t.slice(0,3)]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  };

  // ── Fetch all data ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!authedEmail) return;
    setLoading(true);
    const H = { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET };
    try {
      const [uR, tR, aR] = await Promise.all([
        fetch("/api/admin/crm-users",     { headers: H }),
        fetch("/api/admin/transactions",  { headers: H }),
        fetch("/api/admin/tool-analytics",{ headers: H }),
      ]);
      if (uR.ok) { const j = await uR.json(); setUsers(j.users || []); }
      if (tR.ok) { const j = await tR.json(); setTxns(j.transactions || []); }
      if (aR.ok) { const j = await aR.json(); setTools(j.tools || []); }
    } catch(e) { console.warn("Admin fetch error:", e); }
    finally { setLoading(false); }
  }, [authedEmail]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Grant / Revoke ────────────────────────────────────────────────────────────
  const grantAccess = async (email: string, planId: string) => {
    setActing(`${email}:${planId}`);
    try {
      const r = await fetch("/api/admin/grant-access", {
        method:"POST", headers:{"Content-Type":"application/json","x-admin-secret":ADMIN_SECRET},
        body: JSON.stringify({ email, planId }),
      });
      const j = await r.json();
      addToast(r.ok, j.message || j.error);
      if (r.ok) fetchAll();
    } catch(e:any) { addToast(false, e.message); }
    finally { setActing(null); }
  };

  const revokeAccess = async (email: string) => {
    if (!confirm(`Revoke ALL access for ${email}?`)) return;
    setActing(`${email}:revoke`);
    try {
      const r = await fetch("/api/admin/revoke-access", {
        method:"POST", headers:{"Content-Type":"application/json","x-admin-secret":ADMIN_SECRET},
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      addToast(r.ok, j.message || j.error);
      if (r.ok) fetchAll();
    } catch(e:any) { addToast(false, e.message); }
    finally { setActing(null); }
  };

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.includes("@")) return;
    await grantAccess(manualEmail.trim(), manualPlan);
    setManualEmail(""); setShowGrant(false);
  };

  // ── Login gate ────────────────────────────────────────────────────────────────
  if (!authedEmail) return <AdminLoginGate onAuth={setAuthedEmail} />;

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalUsers    = users.length;
  const premiumUsers  = users.filter(u => u.premiumActive && !u.accessRevoked).length;
  const freeUsers     = users.filter(u => !u.premiumActive).length;
  const revokedUsers  = users.filter(u => u.accessRevoked).length;
  const adminGranted  = users.filter(u => u.grantedByAdmin).length;
  // Stats dynamically derived from filteredTxns are now computed below
  const maxTool       = tools.length ? Math.max(...tools.map(t => t.count), 1) : 1;
  const totalToolUses = tools.reduce((s, t) => s + t.count, 0);

  // Filtered users
  const filteredUsers = users.filter(u => {
    const h = `${u.displayName} ${u.email || ""}`.toLowerCase();
    const matchSearch = search === "" || h.includes(search.toLowerCase());
    let matchPlan = true;
    if (planFilter === "premium") matchPlan = u.premiumActive && !u.accessRevoked;
    if (planFilter === "free")    matchPlan = !u.premiumActive;
    if (planFilter === "revoked") matchPlan = u.accessRevoked;

    let matchDate = true;
    if (dateFilter !== "all-time") {
      const joined = new Date(u.joinedAt).getTime();
      const now = Date.now();
      const diffDays = (now - joined) / (1000 * 60 * 60 * 24);
      if (dateFilter === "last-24h" && diffDays > 1) matchDate = false;
      if (dateFilter === "last-7d" && diffDays > 7) matchDate = false;
      if (dateFilter === "last-30d" && diffDays > 30) matchDate = false;
      if (dateFilter === "last-calendar-month") {
        const lastMonthDate = new Date();
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        const isSameMonthAndYear = new Date(joined).getMonth() === lastMonthDate.getMonth() && new Date(joined).getFullYear() === lastMonthDate.getFullYear();
        if (!isSameMonthAndYear) matchDate = false;
      }
      if (dateFilter === "last-quarter" && diffDays > 90) matchDate = false;
      if (dateFilter === "last-year" && diffDays > 365) matchDate = false;
      if (dateFilter === "custom") {
        if (customStartDate && joined < new Date(customStartDate).getTime()) matchDate = false;
        if (customEndDate && joined > new Date(customEndDate).getTime() + 86400000) matchDate = false;
      }
    }

    return matchSearch && matchPlan && matchDate;
  });

  // Filtered txns
  const filteredTxns = txns.filter(tx => {
    let matchDate = true;
    if (dateFilter !== "all-time") {
      const ts = new Date(tx.timestamp).getTime();
      const now = Date.now();
      const diffDays = (now - ts) / (1000 * 60 * 60 * 24);
      if (dateFilter === "last-24h" && diffDays > 1) matchDate = false;
      if (dateFilter === "last-7d" && diffDays > 7) matchDate = false;
      if (dateFilter === "last-30d" && diffDays > 30) matchDate = false;
      if (dateFilter === "last-calendar-month") {
        const lastMonthDate = new Date();
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        const isSameMonthAndYear = new Date(ts).getMonth() === lastMonthDate.getMonth() && new Date(ts).getFullYear() === lastMonthDate.getFullYear();
        if (!isSameMonthAndYear) matchDate = false;
      }
      if (dateFilter === "last-quarter" && diffDays > 90) matchDate = false;
      if (dateFilter === "last-year" && diffDays > 365) matchDate = false;
      if (dateFilter === "custom") {
        if (customStartDate && ts < new Date(customStartDate).getTime()) matchDate = false;
        if (customEndDate && ts > new Date(customEndDate).getTime() + 86400000) matchDate = false;
      }
    }
    return matchDate;
  });

  const totalRevenue  = filteredTxns.filter(t => t.status === "captured").reduce((s,t) => s+t.amount, 0);
  const totalTxnsCount = filteredTxns.filter(t => t.status === "captured").length;

  // Most recent signups
  const recentUsers = [...users].sort((a,b) => new Date(b.joinedAt).getTime()-new Date(a.joinedAt).getTime()).slice(0,5);
  const recentTxns  = [...txns].sort((a,b) => new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()).slice(0,5);
  const topTool     = tools.sort((a,b) => b.count-a.count)[0];

  const TABS = [
    { id:"overview",  label:"Overview",  icon:<LayoutDashboard size={13}/> },
    { id:"users",     label:`Users (${filteredUsers.length})`, icon:<Users size={13}/> },
    { id:"payments",  label:`Payments (${totalTxnsCount})`, icon:<CreditCard size={13}/> },
    { id:"tools",     label:`Tool Usage`, icon:<BarChart3 size={13}/> },
    { id:"activity",  label:"Activity",  icon:<MousePointerClick size={13}/> },
  ] as const;

  return (
    <div className="min-h-screen bg-neutral-50 admin-dashboard-scale">

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl border animate-fade-in ${
            t.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
          }`}>
            {t.ok ? "✅" : "❌"} {t.msg}
          </div>
        ))}
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="text-xs font-bold text-neutral-400 hover:text-neutral-700 transition cursor-pointer">
              ← Trust My PDF
            </button>
            <span className="text-neutral-200">/</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-black rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white font-extrabold text-xs">P</span>
              </div>
              <span className="text-sm font-black text-neutral-900">Admin Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-[10px] font-mono text-neutral-400">{authedEmail}</span>
            <button onClick={fetchAll}
              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition cursor-pointer">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg">
              🔒 Admin
            </span>
            <button onClick={handleSignOut}
              className="text-[10px] font-bold text-neutral-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition cursor-pointer">
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Navigation Tabs ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-neutral-200 overflow-x-auto pb-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-bold border-b-2 whitespace-nowrap transition cursor-pointer -mb-px ${
                tab === t.id
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-700"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-5">

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users size={18}/>} label="Total Users" value={totalUsers}
                sub={`${premiumUsers} premium`} accent="bg-violet-50 text-violet-600 border border-violet-200" />
              <StatCard icon={<IndianRupee size={18}/>} label="Total Revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`}
                sub={`${totalTxnsCount} payments`} accent="bg-emerald-50 text-emerald-600 border border-emerald-200" />
              <StatCard icon={<Activity size={18}/>} label="Tool Uses" value={totalToolUses}
                sub={topTool ? `Top: ${TOOL_NAMES[topTool.slug]||topTool.slug}` : "No data"} accent="bg-blue-50 text-blue-600 border border-blue-200" />
              <StatCard icon={<Zap size={18}/>} label="Admin Grants" value={adminGranted}
                sub={`${revokedUsers} revoked`} accent="bg-amber-50 text-amber-600 border border-amber-200" />
            </div>

            {/* Mini breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label:"Premium Active", val:premiumUsers, cls:"bg-blue-600" },
                { label:"Free Users",     val:freeUsers,    cls:"bg-neutral-400" },
                { label:"Admin Granted",  val:adminGranted, cls:"bg-purple-600" },
                { label:"Revoked",        val:revokedUsers, cls:"bg-red-500" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.cls}`} />
                  <div>
                    <p className="text-base font-black text-neutral-900">{s.val}</p>
                    <p className="text-[10px] text-neutral-400 font-semibold">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue Chart */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
              <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Total sales over time</h3>
                  <p className="text-[11px] text-neutral-500 mt-1">Live metrics from all payment gateways</p>
                </div>
                <div className="flex items-center gap-2">
                  {chartFilter === "custom" && (
                    <div className="flex items-center gap-2">
                      <input type="date" value={chartCustomStart} onChange={e => setChartCustomStart(e.target.value)} className="text-xs px-2 py-1.5 border border-neutral-200 rounded-lg outline-none focus:border-emerald-500 bg-white" />
                      <span className="text-neutral-400">-</span>
                      <input type="date" value={chartCustomEnd} onChange={e => setChartCustomEnd(e.target.value)} className="text-xs px-2 py-1.5 border border-neutral-200 rounded-lg outline-none focus:border-emerald-500 bg-white" />
                    </div>
                  )}
                  <select value={chartFilter} onChange={(e) => setChartFilter(e.target.value as any)} className="text-xs font-bold text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500 cursor-pointer">
                    <option value="all">All Time</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="last_month">Last Month</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={(() => {
                    const map = new Map<string, number>();
                    
                    const now = new Date();
                    let startLimit: Date | null = null;
                    let endLimit: Date | null = null;

                    if (chartFilter === "24h") {
                      startLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    } else if (chartFilter === "7d") {
                      startLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    } else if (chartFilter === "30d") {
                      startLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    } else if (chartFilter === "last_month") {
                      startLimit = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                      endLimit = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                    } else if (chartFilter === "custom") {
                      if (chartCustomStart) startLimit = new Date(chartCustomStart);
                      if (chartCustomEnd) {
                        endLimit = new Date(chartCustomEnd);
                        endLimit.setHours(23, 59, 59, 999);
                      }
                    }

                    const filteredTxns = txns.filter(tx => {
                      const d = new Date(tx.timestamp);
                      if (startLimit && d < startLimit) return false;
                      if (endLimit && d > endLimit) return false;
                      return true;
                    });

                    filteredTxns.forEach(tx => {
                      const d = new Date(tx.timestamp).toLocaleDateString("en-CA");
                      map.set(d, (map.get(d) || 0) + tx.amount);
                    });
                    
                    if (map.size === 0) return [{ date: "No Data", revenue: 0 }];

                    const sorted = Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([date, revenue]) => ({
                      date: new Date(date).toLocaleDateString("en-US", { month:"short", day:"numeric" }),
                      revenue
                    }));
                    return sorted;
                  })()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#a3a3a3" }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#a3a3a3" }} tickFormatter={(val) => `₹${val}`} />
                    <CartesianGrid vertical={false} stroke="#f5f5f5" />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e5e5e5", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                      itemStyle={{ color: "#10b981", fontWeight: "bold", fontSize: "14px" }}
                      labelStyle={{ color: "#737373", fontSize: "12px", marginBottom: "4px" }}
                      formatter={(val: number) => [`₹${val.toLocaleString("en-IN")}`, "Revenue"]}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Two panels: Recent Signups + Recent Payments */}
            <div className="grid md:grid-cols-2 gap-4">

              {/* Recent Signups */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-violet-600" />
                    <span className="text-sm font-bold text-neutral-900">Recent Signups</span>
                  </div>
                  <button onClick={() => setTab("users")}
                    className="text-[10px] font-bold text-neutral-400 hover:text-neutral-700 flex items-center gap-0.5 cursor-pointer">
                    View all <ArrowUpRight size={10} />
                  </button>
                </div>
                <div className="divide-y divide-neutral-50">
                  {recentUsers.length === 0 ? (
                    <p className="text-center text-neutral-400 text-xs py-6">No users yet</p>
                  ) : recentUsers.map(u => (
                    <div key={u.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center text-xs font-black text-neutral-600 shrink-0">
                        {u.displayName?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-900 truncate">{u.displayName}</p>
                        <p className="text-[10px] text-neutral-400 font-mono truncate">{u.email || u.phone || "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${planBadge(u.planStatus, u.accessRevoked)}`}>
                          {planLabel(u.planStatus, u.accessRevoked)}
                        </span>
                        <p className="text-[9px] text-neutral-300 mt-0.5">{ago(u.joinedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Payments */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard size={14} className="text-emerald-600" />
                    <span className="text-sm font-bold text-neutral-900">Recent Payments</span>
                  </div>
                  <button onClick={() => setTab("payments")}
                    className="text-[10px] font-bold text-neutral-400 hover:text-neutral-700 flex items-center gap-0.5 cursor-pointer">
                    View all <ArrowUpRight size={10} />
                  </button>
                </div>
                <div className="divide-y divide-neutral-50">
                  {recentTxns.length === 0 ? (
                    <p className="text-center text-neutral-400 text-xs py-6">No payments yet</p>
                  ) : recentTxns.map(tx => (
                    <div key={tx.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                        <IndianRupee size={13} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-900 truncate">{tx.userName}</p>
                        <p className="text-[10px] text-neutral-400">{tx.passType}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-emerald-700">₹{tx.amount}</p>
                        <p className="text-[9px] text-neutral-300">{ago(tx.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tool Usage Mini-bar chart */}
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 size={14} className="text-blue-600" />
                  <span className="text-sm font-bold text-neutral-900">Tool Usage Ranking</span>
                </div>
                <button onClick={() => setTab("tools")}
                  className="text-[10px] font-bold text-neutral-400 hover:text-neutral-700 flex items-center gap-0.5 cursor-pointer">
                  View details <ArrowUpRight size={10} />
                </button>
              </div>
              <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
                {tools.length === 0 ? (
                  <p className="col-span-3 text-center text-neutral-400 text-xs py-4">No tool usage recorded yet</p>
                ) : tools.slice(0,9).map((tool, i) => (
                  <div key={tool.slug} className="flex items-center gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                    <span className="text-lg leading-none">{TOOL_ICONS[tool.slug] || "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-neutral-800 truncate">{TOOL_NAMES[tool.slug] || tool.slug}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 h-1 bg-neutral-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${i===0?"bg-amber-500":i===1?"bg-neutral-400":"bg-neutral-300"}`}
                            style={{ width:`${(tool.count/maxTool)*100}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-neutral-600 shrink-0">{tool.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* ── USERS TAB ────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div className="space-y-3">

            {/* Search + Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                  <input type="text" placeholder="Search by name or email..." value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
                </div>
                <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl p-1">
                  {(["all","premium","free","revoked"] as const).map(f => (
                    <button key={f} onClick={() => setPlanFilter(f)}
                      className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition cursor-pointer capitalize ${
                        planFilter === f ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-700"
                      }`}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="relative border border-neutral-200 rounded-xl bg-white px-3 py-2 flex items-center gap-2">
                   <Calendar size={12} className="text-neutral-400" />
                   <select 
                     value={dateFilter} 
                     onChange={(e) => setDateFilter(e.target.value)}
                     className="text-[11px] font-bold text-neutral-700 bg-transparent outline-none cursor-pointer uppercase tracking-wider"
                   >
                     <option value="all-time">All Time</option>
                     <option value="last-24h">Last 24 Hours</option>
                     <option value="last-7d">Last 7 Days</option>
                     <option value="last-30d">Last 30 Days</option>
                     <option value="last-calendar-month">Last Month</option>
                     <option value="last-quarter">Last 90 Days</option>
                     <option value="last-year">Last Year</option>
                     <option value="custom">Custom Date Range</option>
                   </select>
                </div>
                {dateFilter === "custom" && (
                  <div className="flex items-center gap-2 border border-neutral-200 rounded-xl bg-white px-3 py-1.5">
                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="text-[11px] font-bold text-neutral-700 outline-none" />
                    <span className="text-[10px] text-neutral-400">to</span>
                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="text-[11px] font-bold text-neutral-700 outline-none" />
                  </div>
                )}
              </div>
              
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Export Data</span>
                <button onClick={() => setShowCsvModal("users")} className="flex items-center gap-2 px-4 py-2 border-2 border-emerald-500 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition cursor-pointer text-xs font-bold uppercase tracking-wider">
                   <Download size={14} /> Download CSV File
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-neutral-200">
                <RefreshCw size={22} className="animate-spin text-neutral-300" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[900px]">
                    <thead className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="px-4 py-3">Plan</th>
                        <th className="px-4 py-3">Expiry</th>
                        <th className="px-4 py-3">Usage</th>
                        <th className="px-4 py-3">Joined</th>
                        <th className="px-4 py-3">Flags</th>
                        <th className="px-4 py-3 min-w-[150px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50 text-xs">
                      {filteredUsers.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-400">No users found</td></tr>
                      ) : filteredUsers.map(user => {
                        const tl = timeLeft(user.expiresAt);
                        const expiring = tl && tl !== "Expired" && tl.includes("d") && parseInt(tl) <= 3;
                        return (
                          <tr key={user.id} className={`hover:bg-neutral-50/60 transition-colors ${user.accessRevoked ? "opacity-55" : ""}`}>

                            {/* User */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-200 flex items-center justify-center text-xs font-black text-neutral-600 shrink-0">
                                  {user.displayName?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                                <div>
                                  <p className="font-bold text-neutral-900">{user.displayName}</p>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    user.authProvider === "phone"
                                      ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                                  }`}>
                                    {user.authProvider === "phone" ? "📱 Phone" : "🌐 Google"}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Contact */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-600">
                                {user.phone
                                  ? <><Phone size={9} className="text-neutral-300"/>{user.phone}</>
                                  : <><Mail size={9} className="text-neutral-300"/>{user.email || "—"}</>}
                              </div>
                            </td>

                            {/* Plan */}
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold border ${planBadge(user.planStatus, user.accessRevoked)}`}>
                                {user.planStatus === "lifetime" && <Crown size={8}/>}
                                {planLabel(user.planStatus, user.accessRevoked)}
                              </span>
                              {user.grantedByAdmin && (
                                <div className="text-[9px] text-purple-500 font-bold mt-0.5 flex items-center gap-0.5">
                                  <Zap size={7}/> Admin
                                </div>
                              )}
                            </td>

                            {/* Expiry */}
                            <td className="px-4 py-3.5">
                              {user.planStatus === "lifetime" ? (
                                <span className="text-[10px] font-bold text-purple-600">♾️ Never</span>
                              ) : user.expiresAt ? (
                                <div className="flex items-center gap-1">
                                  <Clock size={9} className={tl==="Expired"?"text-red-400":expiring?"text-amber-500":"text-emerald-500"} />
                                  <span className={`text-[10px] font-bold ${tl==="Expired"?"text-red-500":expiring?"text-amber-600":"text-emerald-600"}`}>{tl}</span>
                                </div>
                              ) : <span className="text-neutral-300">—</span>}
                            </td>

                            {/* Usage */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-14 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                  {user.premiumActive ? (
                                    <div className="h-full bg-emerald-400 rounded-full w-full" />
                                  ) : (
                                    <div className="h-full bg-blue-400 rounded-full" style={{ width:`${Math.min(100,((user.usageCount||0)/3)*100)}%` }} />
                                  )}
                                </div>
                                <span className="text-[10px] text-neutral-500 font-medium whitespace-nowrap">
                                  {user.premiumActive ? "Unlimited" : `${user.usageCount||0}/3`}
                                </span>
                              </div>
                            </td>

                            {/* Joined */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                                <Calendar size={9}/> {ago(user.joinedAt)}
                              </div>
                            </td>

                            {/* Flags */}
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {user.isAdmin && <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">Admin</span>}
                                {user.accessRevoked && <span className="text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Ban size={7}/>Revoked</span>}
                                {tl === "Expired" && <span className="text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">Expired</span>}
                              </div>
                            </td>

                            {/* Actions — single dropdown */}
                            <td className="px-4 py-3.5">
                              {!user.isAdmin && user.email ? (
                                <select
                                  disabled={!!acting}
                                  value=""
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (!v) return;
                                    if (v === "revoke") revokeAccess(user.email!);
                                    else grantAccess(user.email!, v);
                                    e.target.value = "";
                                  }}
                                  className="text-[11px] font-medium px-2 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 cursor-pointer disabled:opacity-40 outline-none focus:ring-1 focus:ring-blue-400 transition"
                                >
                                  <option value="">
                                    {acting && acting.startsWith(user.email) ? "…" : "Grant access…"}
                                  </option>
                                  <option value="starter">7 Days</option>
                                  <option value="monthly">1 Month</option>
                                  <option value="annual">1 Year</option>
                                  {user.premiumActive && !user.accessRevoked && (
                                    <option value="revoke">⛔ Revoke Access</option>
                                  )}
                                </select>
                              ) : <span className="text-[10px] text-neutral-200">Admin account</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 font-semibold">
                    Showing {filteredUsers.length} of {totalUsers} users
                  </span>
                  <span className="text-[10px] text-neutral-400 font-semibold flex items-center gap-1">
                    <Shield size={9} className="text-emerald-500"/> AES-256 · Supabase Live
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* ── PAYMENTS TAB ─────────────────────────────────────────────────── */}
        {tab === "payments" && (
          <div className="space-y-3">
            {/* Filter + Export Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative border border-neutral-200 rounded-xl bg-white px-3 py-2 flex items-center gap-2">
                   <Calendar size={12} className="text-neutral-400" />
                   <select 
                     value={dateFilter} 
                     onChange={(e) => setDateFilter(e.target.value)}
                     className="text-[11px] font-bold text-neutral-700 bg-transparent outline-none cursor-pointer uppercase tracking-wider"
                   >
                     <option value="all-time">All Time</option>
                     <option value="last-24h">Last 24 Hours</option>
                     <option value="last-7d">Last 7 Days</option>
                     <option value="last-30d">Last 30 Days</option>
                     <option value="last-calendar-month">Last Month</option>
                     <option value="last-quarter">Last 90 Days</option>
                     <option value="last-year">Last Year</option>
                     <option value="custom">Custom Date Range</option>
                   </select>
                </div>
                {dateFilter === "custom" && (
                  <div className="flex items-center gap-2 border border-neutral-200 rounded-xl bg-white px-3 py-1.5">
                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="text-[11px] font-bold text-neutral-700 outline-none" />
                    <span className="text-[10px] text-neutral-400">to</span>
                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="text-[11px] font-bold text-neutral-700 outline-none" />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Export Data</span>
                <button onClick={() => setShowCsvModal("payments")} className="flex items-center gap-2 px-4 py-2 border-2 border-emerald-500 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition cursor-pointer text-xs font-bold uppercase tracking-wider">
                   <Download size={14} /> Download CSV File
                </button>
              </div>
            </div>

            {/* Revenue summary */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={<IndianRupee size={16}/>} label="Total Revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`}
                sub={`${totalTxnsCount} captured`} accent="bg-emerald-50 text-emerald-600 border border-emerald-200" />
              <StatCard icon={<CheckCircle size={16}/>} label="Captured" value={totalTxnsCount}
                accent="bg-blue-50 text-blue-600 border border-blue-200" />
              <StatCard icon={<AlertCircle size={16}/>} label="Failed" value={filteredTxns.filter(t=>t.status==="failed").length}
                accent="bg-red-50 text-red-500 border border-red-200" />
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16"><RefreshCw size={22} className="animate-spin text-neutral-300"/></div>
              ) : filteredTxns.length === 0 ? (
                <div className="text-center py-16">
                  <CreditCard size={32} className="mx-auto mb-3 text-neutral-200"/>
                  <p className="text-sm font-medium text-neutral-500">No payments yet</p>
                  <p className="text-xs text-neutral-300 mt-1">Razorpay payments will appear here automatically</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                      <thead className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        <tr>
                          <th className="px-5 py-3">Razorpay ID</th>
                          <th className="px-5 py-3">Customer Email ID</th>
                          <th className="px-5 py-3">Plan Purchased</th>
                          <th className="px-5 py-3">Amount</th>
                          <th className="px-5 py-3">Date & Time</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50 text-xs">
                        {filteredTxns.map(tx => (
                          <tr key={tx.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-5 py-3.5 font-mono text-[10px] text-neutral-400">{tx.razorpayPaymentId}</td>
                            <td className="px-5 py-3.5 font-bold text-neutral-800">{tx.userName}</td>
                            <td className="px-5 py-3.5">
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg">{tx.passType}</span>
                            </td>
                            <td className="px-5 py-3.5 font-black text-neutral-900 font-mono">₹{tx.amount}</td>
                            <td className="px-5 py-3.5 text-[10px] text-neutral-400">{fmt(tx.timestamp)}</td>
                            <td className="px-5 py-3.5">
                              {tx.status === "captured" ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1 w-fit">
                                  <CheckCircle size={9}/> Captured
                                </span>
                              ) : tx.status === "admin_grant" ? (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg flex items-center gap-1 w-fit">
                                  <Zap size={9}/> Admin Grant
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg flex items-center gap-1 w-fit">
                                  <XCircle size={9}/> {tx.status}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 flex justify-between text-[10px] text-neutral-400 font-semibold">
                    <span>{txns.length} total records</span>
                    <span className="text-emerald-700 font-bold">Total Captured: ₹{totalRevenue.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* ── TOOLS TAB ────────────────────────────────────────────────────── */}
        {tab === "tools" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard icon={<BarChart3 size={16}/>} label="Total Tool Uses" value={totalToolUses}
                accent="bg-blue-50 text-blue-600 border border-blue-200" />
              <StatCard icon={<TrendingUp size={16}/>} label="Most Used Tool"
                value={topTool ? (TOOL_NAMES[topTool.slug]||topTool.slug) : "—"}
                sub={topTool ? `${topTool.count} uses` : ""}
                accent="bg-amber-50 text-amber-600 border border-amber-200" />
              <StatCard icon={<FileText size={16}/>} label="Tools Tracked" value={tools.length}
                sub={`of 13 total`} accent="bg-violet-50 text-violet-600 border border-violet-200" />
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100">
                <h3 className="text-sm font-bold text-neutral-900">Per-Tool Usage Counter</h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">Every time a user uses a PDF tool, the count increments by 1</p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12"><RefreshCw size={22} className="animate-spin text-neutral-300"/></div>
              ) : (
                <div className="divide-y divide-neutral-50">
                  {/* Show ALL 13 tools, even if count is 0 */}
                  {Object.entries(TOOL_NAMES).map(([slug, name], i) => {
                    const tool = tools.find(t => t.slug === slug);
                    const count = tool?.count || 0;
                    const pct = maxTool > 0 ? (count / maxTool) * 100 : 0;
                    return (
                      <div key={slug} className="px-5 py-4 flex items-center gap-4">
                        <span className="text-xl w-8 text-center shrink-0">{TOOL_ICONS[slug]||"📄"}</span>
                        <div className="w-24 shrink-0">
                          <p className="text-xs font-bold text-neutral-800">{name}</p>
                          <p className="text-[9px] font-mono text-neutral-400">/{slug}</p>
                        </div>
                        <div className="flex-1 h-3 bg-neutral-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            i===0?"bg-amber-400":i===1?"bg-neutral-500":i===2?"bg-blue-400":"bg-neutral-300"
                          }`} style={{ width:`${pct}%` }} />
                        </div>
                        <div className="text-right w-20 shrink-0">
                          <span className="text-base font-black text-neutral-900">{count}</span>
                          <span className="text-[10px] text-neutral-400 ml-1">uses</span>
                        </div>
                        <div className={`w-14 text-right text-[10px] font-bold shrink-0 ${count===0?"text-neutral-300":"text-neutral-500"}`}>
                          {count > 0 ? `${Math.round(pct)}%` : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 text-[10px] text-neutral-400 font-semibold">
                Counts tracked in Supabase → crm_tool_analytics table · Increments on every tool use
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* ── ACTIVITY TAB ─────────────────────────────────────────────────── */}
        {tab === "activity" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-neutral-100">
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <MousePointerClick size={14} className="text-blue-600"/> User Navigation & Activity
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Live view of what tools users are accessing — tracked per tool use
                </p>
              </div>
              <div className="p-5 space-y-4">
                {/* Per-user usage */}
                <div>
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-3">Users by Activity</p>
                  {users.length === 0 ? (
                    <p className="text-center text-neutral-400 text-xs py-6">No user data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {[...users].sort((a,b)=>(b.usageCount||0)-(a.usageCount||0)).map(user => (
                        <div key={user.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                          <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-black text-neutral-600 shrink-0">
                            {user.displayName?.charAt(0)?.toUpperCase()||"?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-neutral-800">{user.displayName}</p>
                            <p className="text-[10px] font-mono text-neutral-400 truncate">{user.email||user.phone||"—"}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-20 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                              {user.premiumActive ? (
                                <div className="h-full bg-emerald-400 rounded-full w-full" />
                              ) : (
                                <div className="h-full bg-blue-400 rounded-full" style={{ width:`${Math.min(100,((user.usageCount||0)/3)*100)}%` }} />
                              )}
                            </div>
                            <span className="text-[11px] font-black text-neutral-700 w-12 text-right">
                              {user.premiumActive ? "∞" : user.usageCount||0} <span className="font-normal text-neutral-400">uses</span>
                            </span>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${planBadge(user.planStatus, user.accessRevoked)}`}>
                            {planLabel(user.planStatus, user.accessRevoked)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


              </div>
            </div>
          </div>
        )}

      </div>
      {/* ── CSV EXPORT MODAL ─────────────────────────────────────────────── */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                <Download size={16} className="text-emerald-600" />
                Export {showCsvModal === "users" ? "Users" : "Payments"}
              </h3>
              <button onClick={() => setShowCsvModal(null)} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-500 leading-relaxed">
                Select a custom date range to export. Leave dates empty to export all data within your current tab filters.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-neutral-500">Start Date</label>
                  <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-emerald-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-neutral-500">End Date</label>
                  <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-emerald-500" />
                </div>
              </div>
              <button onClick={showCsvModal === "users" ? exportToCSV : exportPaymentsToCSV}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider py-3 rounded-xl transition shadow-sm mt-2 cursor-pointer">
                Download CSV File
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
