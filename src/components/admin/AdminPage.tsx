/**
 * AdminPage.tsx — PDFEasy Built-in Admin Dashboard
 * Route: /admin  |  Access: mathinirai.a@gmail.com only
 * Shows: Users · Payments · Tool Analytics · Activity Logs
 * Actions: Grant Access · Revoke Access
 */

import React, { useState, useEffect, useCallback } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import {
  Users, CreditCard, BarChart3, RefreshCw, Shield,
  Mail, Clock, Crown, Ban, Zap, Search, CheckCircle,
  XCircle, IndianRupee, Activity, ChevronDown, TrendingUp,
  Calendar, Eye, EyeOff, Lock, FileText, LayoutDashboard,
  MousePointerClick, AlertCircle, ArrowUpRight, Phone,
} from "lucide-react";

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
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);

  const handleGoogle = async () => {
    setLoading(true); setError("");
    try {
      const r = await signInWithPopup(auth, googleProvider);
      const email = r.user.email || "";
      if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        await signOut(auth);
        setError(`Access denied. Only ${ADMIN_EMAIL} can access this panel.`);
        return;
      }
      localStorage.setItem("admin_authed_email", email);
      onAuth(email);
    } catch (e: any) {
      if (e.code === "auth/unauthorized-domain") {
        setShowPass(true);
        setError("Firebase doesn't allow localhost. Use password below.");
      } else if (e.code !== "auth/popup-closed-by-user") {
        setError(e.message || "Sign-in failed.");
      }
    } finally { setLoading(false); }
  };

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASS) {
      localStorage.setItem("admin_authed_email", ADMIN_EMAIL);
      onAuth(ADMIN_EMAIL);
    } else { setError("Incorrect password."); }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="w-16 h-16 bg-neutral-950 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Shield size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-xl font-black text-neutral-900 mb-1">PDFEasy Admin</h1>
        <p className="text-xs text-neutral-400 mb-7">Restricted Access · Admin Only</p>

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl text-left font-medium">
            <XCircle size={13} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {!showPass ? (
          <>
            <button onClick={handleGoogle} disabled={loading}
              className="w-full flex items-center justify-center gap-3 border-2 border-neutral-200 hover:border-neutral-900 font-bold py-3 rounded-xl transition cursor-pointer disabled:opacity-50 hover:shadow-md">
              {loading ? <RefreshCw size={15} className="animate-spin text-neutral-400" /> : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {loading ? "Signing in..." : "Sign in with Google"}
            </button>
            <button onClick={() => { setShowPass(true); setError(""); }}
              className="mt-3 text-[11px] text-neutral-400 hover:text-neutral-700 transition cursor-pointer flex items-center gap-1 mx-auto">
              <Lock size={10} /> Use password instead
            </button>
          </>
        ) : (
          <form onSubmit={handlePassword} className="space-y-3 text-left">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-700 font-semibold">
              🔧 Local dev mode — password login
            </div>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} autoFocus
                onChange={e => setPassword(e.target.value)} placeholder="Admin password"
                className="w-full px-4 pr-10 py-3 text-sm border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition" />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button type="submit"
              className="w-full bg-neutral-900 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl transition cursor-pointer">
              Access Dashboard
            </button>
            <button type="button" onClick={() => { setShowPass(false); setError(""); setPassword(""); }}
              className="w-full text-[11px] text-neutral-400 hover:text-neutral-700 transition cursor-pointer text-center">
              ← Back to Google
            </button>
          </form>
        )}
        <p className="text-[10px] text-neutral-300 mt-6">🔒 {ADMIN_EMAIL}</p>
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
    const cached = localStorage.getItem("admin_authed_email") || localStorage.getItem("user_email");
    if (cached?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return cached;
    if (currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return currentUserEmail;
    return null;
  });

  const handleSignOut = () => {
    localStorage.removeItem("admin_authed_email");
    setAuthedEmail(null);
    try { signOut(auth); } catch (_) {}
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
  const totalRevenue  = txns.filter(t => t.status === "captured").reduce((s,t) => s+t.amount, 0);
  const totalTxns     = txns.filter(t => t.status === "captured").length;
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
    return matchSearch && matchPlan;
  });

  // Most recent signups
  const recentUsers = [...users].sort((a,b) => new Date(b.joinedAt).getTime()-new Date(a.joinedAt).getTime()).slice(0,5);
  const recentTxns  = [...txns].sort((a,b) => new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()).slice(0,5);
  const topTool     = tools.sort((a,b) => b.count-a.count)[0];

  const TABS = [
    { id:"overview",  label:"Overview",  icon:<LayoutDashboard size={13}/> },
    { id:"users",     label:`Users (${totalUsers})`, icon:<Users size={13}/> },
    { id:"payments",  label:`Payments (${totalTxns})`, icon:<CreditCard size={13}/> },
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
              ← PDFEasy
            </button>
            <span className="text-neutral-200">/</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-neutral-900 rounded-lg flex items-center justify-center shrink-0">
                <Shield size={13} className="text-emerald-400" />
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
                sub={`${totalTxns} payments`} accent="bg-emerald-50 text-emerald-600 border border-emerald-200" />
              <StatCard icon={<Activity size={18}/>} label="Tool Uses" value={totalToolUses}
                sub={topTool ? `Top: ${TOOL_NAMES[topTool.slug]||topTool.slug}` : "No data"} accent="bg-blue-50 text-blue-600 border border-blue-200" />
              <StatCard icon={<Zap size={18}/>} label="Admin Grants" value={adminGranted}
                sub={`${revokedUsers} revoked`} accent="bg-amber-50 text-amber-600 border border-amber-200" />
            </div>

            {/* Mini breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                <input type="text" placeholder="Search by name or email..." value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
              </div>
              <div className="flex items-center gap-2">
                {(["all","premium","free","revoked"] as const).map(f => (
                  <button key={f} onClick={() => setPlanFilter(f)}
                    className={`px-3 py-2 text-[11px] font-bold rounded-lg border transition cursor-pointer capitalize ${
                      planFilter === f ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400"
                    }`}>
                    {f === "all" ? `All (${totalUsers})` : f === "premium" ? `Premium (${premiumUsers})` : f === "free" ? `Free (${freeUsers})` : `Revoked (${revokedUsers})`}
                  </button>
                ))}
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
                                  <div className="h-full bg-blue-400 rounded-full" style={{ width:`${Math.min(100,((user.usageCount||0)/3)*100)}%` }} />
                                </div>
                                <span className="text-[10px] text-neutral-500 font-medium">{user.usageCount||0}/3</span>
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
            {/* Revenue summary */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={<IndianRupee size={16}/>} label="Total Revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`}
                sub={`${totalTxns} captured`} accent="bg-emerald-50 text-emerald-600 border border-emerald-200" />
              <StatCard icon={<CheckCircle size={16}/>} label="Captured" value={totalTxns}
                accent="bg-blue-50 text-blue-600 border border-blue-200" />
              <StatCard icon={<AlertCircle size={16}/>} label="Failed" value={txns.filter(t=>t.status==="failed").length}
                accent="bg-red-50 text-red-500 border border-red-200" />
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16"><RefreshCw size={22} className="animate-spin text-neutral-300"/></div>
              ) : txns.length === 0 ? (
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
                          <th className="px-5 py-3">Customer</th>
                          <th className="px-5 py-3">Plan Purchased</th>
                          <th className="px-5 py-3">Amount</th>
                          <th className="px-5 py-3">Date & Time</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50 text-xs">
                        {txns.map(tx => (
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
                              <div className="h-full bg-blue-400 rounded-full" style={{width:`${Math.min(100,((user.usageCount||0)/3)*100)}%`}} />
                            </div>
                            <span className="text-[11px] font-black text-neutral-700 w-12 text-right">
                              {user.usageCount||0} <span className="font-normal text-neutral-400">uses</span>
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

                {/* Tool activity breakdown */}
                <div className="border-t border-neutral-100 pt-4">
                  <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-3">Tools Accessed (All Time)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(TOOL_NAMES).map(([slug, name]) => {
                      const tool = tools.find(t => t.slug === slug);
                      const count = tool?.count || 0;
                      return (
                        <div key={slug} className={`flex items-center gap-2.5 p-3 rounded-xl border ${
                          count > 0 ? "bg-blue-50 border-blue-200" : "bg-neutral-50 border-neutral-100"
                        }`}>
                          <span className="text-base">{TOOL_ICONS[slug]||"📄"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-neutral-800 truncate">{name}</p>
                            <p className={`text-[11px] font-black ${count > 0 ? "text-blue-700" : "text-neutral-300"}`}>
                              {count} {count === 1 ? "use" : "uses"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
