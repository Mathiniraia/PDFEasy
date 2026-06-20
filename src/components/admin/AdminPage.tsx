/**
 * AdminPage.tsx — Built-in CRM Admin Dashboard for PDFEasy
 * Route: /admin
 * Access: only mathinirai.a@gmail.com
 * Self-contained auth: handles its own Google sign-in / password fallback
 */

import { useState, useEffect, useCallback } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";
import {
  Users, CreditCard, BarChart3, RefreshCw, Shield,
  Mail, Clock, Crown, Ban, Zap, AlertTriangle,
  Search, CheckCircle, XCircle, IndianRupee, Activity,
  ChevronDown, TrendingUp, Calendar, Eye, EyeOff, Lock
} from "lucide-react";

const ADMIN_EMAIL  = "mathinirai.a@gmail.com";
const ADMIN_SECRET = "pdfeasy-admin-secret-2024";
const ADMIN_PASS   = "pdfeasy-admin-2024"; // local dev bypass

// ─── Types ──────────────────────────────────────────────────────────────────

interface CRMUser {
  id:            string;
  displayName:   string;
  email:         string | null;
  planStatus:    string;
  premiumActive: boolean;
  expiresAt:     string | null;
  usageCount:    number;
  joinedAt:      string;
  grantedByAdmin: boolean;
  accessRevoked:  boolean;
  isAdmin:        boolean;
}

interface Transaction {
  id: string; razorpayPaymentId: string; userName: string;
  passType: string; amount: number; timestamp: string;
  status: string; planExpiresAt?: string | null;
}

interface ToolStat { slug: string; title: string; count: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GRANT_PLANS = [
  { id: "starter",  label: "7 Days",   cls: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { id: "monthly",  label: "1 Month",  cls: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { id: "annual",   label: "1 Year",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
  { id: "lifetime", label: "Lifetime", cls: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
];

function timeLeft(expiresAt?: string | null): string {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `${d}d left`;
  if (h > 0) return `${h}h left`;
  return "< 1h left";
}

function planColor(plan: string, revoked?: boolean) {
  if (revoked) return "bg-red-50 text-red-600 border-red-200";
  if (plan === "lifetime") return "bg-purple-100 text-purple-800 border-purple-200";
  if (plan === "annual")   return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["monthly","pro"].includes(plan)) return "bg-blue-50 text-blue-700 border-blue-200";
  if (["starter","weekly"].includes(plan)) return "bg-amber-50 text-amber-700 border-amber-200";
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

function ago(iso: string) {
  const d = Math.floor((Date.now()-new Date(iso).getTime())/86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black text-neutral-900">{value}</p>
        {sub && <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>}
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
  const [tab, setTab]             = useState<"users"|"transactions"|"analytics">("users");
  const [users, setUsers]         = useState<CRMUser[]>([]);
  const [transactions, setTxs]    = useState<Transaction[]>([]);
  const [tools, setTools]         = useState<ToolStat[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [acting, setActing]       = useState<string|null>(null);
  const [toasts, setToasts]       = useState<{id:number;ok:boolean;msg:string}[]>([]);
  const [manualEmail, setManualEmail] = useState("");
  const [manualPlan, setManualPlan]   = useState("monthly");
  const [showManual, setShowManual]   = useState(false);

  const isAdmin = currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const addToast = (ok: boolean, msg: string) => {
    const id = Date.now();
    setToasts(t => [{ id, ok, msg }, ...t.slice(0,3)]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  // ── Fetch all CRM data from PDFEasy's own backend ──────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = {
        "Content-Type": "application/json",
        "x-admin-secret": ADMIN_SECRET,
      };

      // Users
      const uRes = await fetch("/api/admin/crm-users", { headers });
      if (uRes.ok) {
        const j = await uRes.json();
        setUsers(j.users || []);
      }

      // Transactions from Supabase (via server)
      const tRes = await fetch("/api/admin/transactions", { headers });
      if (tRes.ok) {
        const j = await tRes.json();
        setTxs(j.transactions || []);
      }

      // Tool analytics
      const aRes = await fetch("/api/admin/tool-analytics", { headers });
      if (aRes.ok) {
        const j = await aRes.json();
        setTools(j.tools || []);
      }
    } catch (e) {
      console.warn("Admin fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Grant access ─────────────────────────────────────────────────────────────
  const grantAccess = async (email: string, planId: string) => {
    setActing(`${email}:${planId}`);
    try {
      const res = await fetch("/api/admin/grant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({ email, planId }),
      });
      const j = await res.json();
      addToast(res.ok, j.message || j.error);
      if (res.ok) await fetchData();
    } catch (e: any) { addToast(false, e.message); }
    finally { setActing(null); }
  };

  // ── Revoke access ─────────────────────────────────────────────────────────────
  const revokeAccess = async (email: string) => {
    if (!confirm(`Revoke ALL access for ${email}?`)) return;
    setActing(`${email}:revoke`);
    try {
      const res = await fetch("/api/admin/revoke-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({ email }),
      });
      const j = await res.json();
      addToast(res.ok, j.message || j.error);
      if (res.ok) await fetchData();
    } catch (e: any) { addToast(false, e.message); }
    finally { setActing(null); }
  };

  // ── Manual grant form ────────────────────────────────────────────────────────
  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.includes("@")) return;
    await grantAccess(manualEmail.trim(), manualPlan);
    setManualEmail("");
    setShowManual(false);
  };

  // ── Self-contained auth gate ─────────────────────────────────────────────
  // Read cached email from localStorage first (set by main app on Google login)
  const [authedEmail, setAuthedEmail] = useState<string | null>(() => {
    const cached = localStorage.getItem("user_email") || localStorage.getItem("admin_authed_email");
    if (cached?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return cached;
    // Also use passed prop
    if (currentUserEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return currentUserEmail;
    return null;
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError]     = useState("");
  const [showPassForm, setShowPassForm] = useState(false);
  const [password, setPassword]         = useState("");
  const [showPw, setShowPw]             = useState(false);

  // Google Sign-In directly on this page
  const handleGoogleSignIn = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || "";
      if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        await signOut(auth);
        setLoginError(`Access denied. Only ${ADMIN_EMAIL} can access this panel.`);
        return;
      }
      localStorage.setItem("admin_authed_email", email);
      setAuthedEmail(email);
    } catch (err: any) {
      if (err.code === "auth/unauthorized-domain") {
        setShowPassForm(true);
        setLoginError("Firebase not configured for localhost. Use password login below.");
      } else if (err.code !== "auth/popup-closed-by-user") {
        setLoginError(err.message || "Sign-in failed.");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // Password fallback (local dev)
  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASS) {
      localStorage.setItem("admin_authed_email", ADMIN_EMAIL);
      setAuthedEmail(ADMIN_EMAIL);
      setLoginError("");
    } else {
      setLoginError("Wrong password.");
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("admin_authed_email");
    setAuthedEmail(null);
    try { signOut(auth); } catch (_) {}
  };

  // Show login gate if not authenticated as admin
  if (!authedEmail) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-neutral-950 rounded-2xl flex items-center justify-center shadow-lg">
              <Shield size={28} className="text-emerald-400" />
            </div>
          </div>
          <h1 className="text-xl font-black text-neutral-900 mb-1">Admin Panel</h1>
          <p className="text-xs text-neutral-400 mb-6">PDFEasy · Restricted Access</p>

          {/* Error */}
          {loginError && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 text-red-700 text-xs font-medium px-3 py-2.5 rounded-xl border border-red-200 text-left">
              <XCircle size={13} className="shrink-0 mt-0.5" />
              {loginError}
            </div>
          )}

          {!showPassForm ? (
            <>
              {/* Google Sign-In */}
              <button onClick={handleGoogleSignIn} disabled={loginLoading}
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-neutral-200 hover:border-neutral-400 text-neutral-800 font-bold py-3 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-sm hover:shadow-md">
                {loginLoading ? (
                  <RefreshCw size={16} className="animate-spin text-neutral-400" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {loginLoading ? "Signing in..." : "Sign in with Google"}
              </button>
              <button onClick={() => { setShowPassForm(true); setLoginError(""); }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-neutral-400 hover:text-neutral-700 transition cursor-pointer">
                <Lock size={10} /> Use password instead
              </button>
            </>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-3 text-left">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-700 font-semibold">
                🔧 Local dev mode — password login
              </div>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Admin password"
                  autoFocus className="w-full px-4 pr-10 py-3 text-sm font-medium border-2 border-neutral-200 rounded-xl focus:outline-none focus:border-neutral-900 transition" />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button type="submit"
                className="w-full bg-neutral-900 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl transition cursor-pointer">
                Access Admin Panel
              </button>
              <button type="button" onClick={() => { setShowPassForm(false); setLoginError(""); setPassword(""); }}
                className="w-full text-[11px] text-neutral-400 hover:text-neutral-700 transition cursor-pointer text-center">
                ← Back to Google Sign-In
              </button>
            </form>
          )}

          <p className="text-[10px] text-neutral-300 mt-6">🔒 Only mathinirai.a@gmail.com can access</p>
        </div>
      </div>
    );
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalUsers    = users.length;
  const premiumUsers  = users.filter(u => u.premiumActive && !u.accessRevoked).length;
  const totalRevenue  = transactions.filter(t => t.status === "captured").reduce((s,t) => s + t.amount, 0);
  const filteredUsers = users.filter(u => {
    const h = `${u.displayName} ${u.email || ""}`.toLowerCase();
    return h.includes(search.toLowerCase());
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50">

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl border transition-all ${
            t.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
          }`}>
            {t.ok ? "✅" : "❌"} {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-xs font-bold text-neutral-400 hover:text-neutral-700 transition cursor-pointer flex items-center gap-1">
              ← PDFEasy
            </button>
            <span className="text-neutral-200">/</span>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-neutral-900 rounded-lg flex items-center justify-center">
                <Shield size={12} className="text-emerald-400" />
              </div>
              <span className="text-sm font-black text-neutral-900">Admin Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-neutral-400 hidden sm:block">{authedEmail}</span>
            <button onClick={fetchData} className="p-1.5 text-neutral-400 hover:text-neutral-700 transition cursor-pointer rounded-lg hover:bg-neutral-100">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
              🔒 Admin
            </span>
            <button onClick={handleSignOut}
              className="text-[10px] font-bold text-neutral-400 hover:text-red-600 transition cursor-pointer px-2 py-1 rounded-lg hover:bg-red-50">
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users size={18}/>} label="Total Users" value={totalUsers}
            sub={`${premiumUsers} premium`} color="bg-violet-50 text-violet-700 border border-violet-200" />
          <StatCard icon={<CreditCard size={18}/>} label="Premium Active" value={premiumUsers}
            sub="paying customers" color="bg-blue-50 text-blue-700 border border-blue-200" />
          <StatCard icon={<IndianRupee size={18}/>} label="Total Revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`}
            sub={`${transactions.length} transactions`} color="bg-emerald-50 text-emerald-700 border border-emerald-200" />
          <StatCard icon={<Activity size={18}/>} label="Tools Tracked" value={tools.length}
            sub="PDF tools" color="bg-amber-50 text-amber-700 border border-amber-200" />
        </div>

        {/* Manual Grant Access Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-purple-600" />
              <span className="text-sm font-bold text-neutral-900">Grant Access to Any User</span>
            </div>
            <button
              onClick={() => setShowManual(p => !p)}
              className="text-[10px] font-bold px-3 py-1.5 bg-neutral-900 text-white rounded-lg cursor-pointer hover:bg-neutral-700 transition flex items-center gap-1"
            >
              <ChevronDown size={10} className={showManual ? "rotate-180 transition" : "transition"} />
              {showManual ? "Close" : "Grant Access"}
            </button>
          </div>
          {showManual && (
            <form onSubmit={handleManualGrant} className="mt-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">User Email</label>
                <input
                  type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)}
                  placeholder="user@example.com" required
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Plan</label>
                <select value={manualPlan} onChange={e => setManualPlan(e.target.value)}
                  className="px-3 py-2 text-sm border border-neutral-200 rounded-xl focus:outline-none bg-white cursor-pointer">
                  <option value="starter">7 Days</option>
                  <option value="monthly">1 Month</option>
                  <option value="annual">1 Year</option>
                  <option value="lifetime">Lifetime</option>
                </select>
              </div>
              <button type="submit" disabled={!!acting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
                ✅ Grant Access
              </button>
            </form>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-200 pb-0">
          {([
            { id: "users", label: `Users (${totalUsers})`, icon: <Users size={12}/> },
            { id: "transactions", label: `Payments (${transactions.length})`, icon: <CreditCard size={12}/> },
            { id: "analytics", label: `Tools (${tools.length})`, icon: <BarChart3 size={12}/> },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer -mb-px ${
                tab === t.id
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-700"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ══ USERS TAB ══════════════════════════════════════════════════════════ */}
        {tab === "users" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input type="text" placeholder="Search by name or email..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={24} className="animate-spin text-neutral-300" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 text-sm">No users found</div>
            ) : (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                    <thead className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      <tr>
                        <th className="px-5 py-3">User</th>
                        <th className="px-5 py-3">Email</th>
                        <th className="px-5 py-3">Plan</th>
                        <th className="px-5 py-3">Expiry</th>
                        <th className="px-5 py-3">Usage</th>
                        <th className="px-5 py-3">Joined</th>
                        <th className="px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50 text-xs">
                      {filteredUsers.map(user => {
                        const tl = timeLeft(user.expiresAt);
                        const isExpiring = tl && tl !== "Expired" && parseInt(tl) <= 3 && tl.includes("d");
                        return (
                          <tr key={user.id} className={`hover:bg-neutral-50/60 transition-colors ${user.accessRevoked ? "opacity-50" : ""}`}>

                            {/* User */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center text-xs font-black text-neutral-600 shrink-0">
                                  {user.displayName?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                                <div>
                                  <p className="font-bold text-neutral-900 text-[11px]">{user.displayName}</p>
                                  {user.isAdmin && (
                                    <span className="text-[9px] font-bold text-amber-600 flex items-center gap-0.5">
                                      <Crown size={8} /> Admin
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Email */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-600">
                                <Mail size={10} className="text-neutral-300" />
                                {user.email || "—"}
                              </div>
                            </td>

                            {/* Plan */}
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold border ${planColor(user.planStatus, user.accessRevoked)}`}>
                                {user.planStatus === "lifetime" && <Crown size={8} />}
                                {planLabel(user.planStatus, user.accessRevoked)}
                              </span>
                              {user.grantedByAdmin && (
                                <div className="text-[9px] text-purple-500 font-bold mt-0.5 flex items-center gap-0.5">
                                  <Zap size={8} /> Admin granted
                                </div>
                              )}
                            </td>

                            {/* Expiry */}
                            <td className="px-5 py-3.5">
                              {user.planStatus === "lifetime" ? (
                                <span className="text-[10px] text-purple-600 font-bold">♾️ Never</span>
                              ) : user.expiresAt ? (
                                <div className="flex items-center gap-1">
                                  <Clock size={9} className={tl === "Expired" ? "text-red-400" : isExpiring ? "text-amber-500" : "text-emerald-500"} />
                                  <span className={`text-[10px] font-bold ${tl === "Expired" ? "text-red-500" : isExpiring ? "text-amber-600" : "text-emerald-600"}`}>{tl}</span>
                                </div>
                              ) : <span className="text-neutral-300 text-[10px]">—</span>}
                            </td>

                            {/* Usage */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-14 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-neutral-400 rounded-full" style={{ width: `${Math.min(100, ((user.usageCount||0)/3)*100)}%` }} />
                                </div>
                                <span className="text-[10px] text-neutral-500 font-medium">{user.usageCount||0}/3</span>
                              </div>
                            </td>

                            {/* Joined */}
                            <td className="px-5 py-3.5 text-[10px] text-neutral-400 font-medium">
                              <div className="flex items-center gap-1">
                                <Calendar size={9} />
                                {ago(user.joinedAt)}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-3.5">
                              {!user.isAdmin && user.email ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {GRANT_PLANS.map(plan => (
                                    <button key={plan.id}
                                      onClick={() => grantAccess(user.email!, plan.id)}
                                      disabled={!!acting}
                                      className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer disabled:opacity-40 ${plan.cls}`}>
                                      {acting === `${user.email}:${plan.id}` ? "..." : plan.label}
                                    </button>
                                  ))}
                                  {user.premiumActive && !user.accessRevoked && (
                                    <button onClick={() => revokeAccess(user.email!)} disabled={!!acting}
                                      className="text-[9px] font-bold px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition cursor-pointer disabled:opacity-40 flex items-center gap-0.5">
                                      {acting === `${user.email}:revoke` ? "..." : <><Ban size={8}/> Revoke</>}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-neutral-200">Admin</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 font-semibold">
                    {filteredUsers.length} of {totalUsers} users · {premiumUsers} premium
                  </span>
                  <span className="text-[10px] text-neutral-400 font-semibold flex items-center gap-1">
                    <Shield size={9} className="text-emerald-500" /> AES-256 · Supabase Live
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TRANSACTIONS TAB ════════════════════════════════════════════════════ */}
        {tab === "transactions" && (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={24} className="animate-spin text-neutral-300" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-16 text-neutral-400">
                <CreditCard size={32} className="mx-auto mb-3 text-neutral-200" />
                <p className="text-sm font-medium">No transactions yet</p>
                <p className="text-xs text-neutral-300 mt-1">Payments will appear here once users start paying</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      <tr>
                        <th className="px-5 py-3">Payment ID</th>
                        <th className="px-5 py-3">User</th>
                        <th className="px-5 py-3">Plan</th>
                        <th className="px-5 py-3">Amount</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50 text-xs">
                      {transactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-[10px] text-neutral-400">{tx.razorpayPaymentId}</td>
                          <td className="px-5 py-3.5 font-bold text-neutral-800">{tx.userName}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg">{tx.passType}</span>
                          </td>
                          <td className="px-5 py-3.5 font-bold text-neutral-900 font-mono">₹{tx.amount}</td>
                          <td className="px-5 py-3.5 text-neutral-400 text-[10px]">
                            {new Date(tx.timestamp).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
                          </td>
                          <td className="px-5 py-3.5">
                            {tx.status === "captured" ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg flex items-center gap-1 w-fit">
                                <CheckCircle size={9} /> Captured
                              </span>
                            ) : tx.status === "admin_grant" ? (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg flex items-center gap-1 w-fit">
                                <Zap size={9} /> Admin Grant
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg flex items-center gap-1 w-fit">
                                <XCircle size={9} /> {tx.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 font-semibold">{transactions.length} total transactions</span>
                  <span className="text-[10px] font-bold text-emerald-700">Total: ₹{totalRevenue.toLocaleString("en-IN")}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ ANALYTICS TAB ════════════════════════════════════════════════════ */}
        {tab === "analytics" && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={24} className="animate-spin text-neutral-300" />
              </div>
            ) : tools.length === 0 ? (
              <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center text-neutral-400">
                <BarChart3 size={32} className="mx-auto mb-3 text-neutral-200" />
                <p className="text-sm font-medium">No tool usage yet</p>
                <p className="text-xs text-neutral-300 mt-1">Usage will appear when users start using PDF tools</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-neutral-100">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <TrendingUp size={14} className="text-emerald-600" /> Tool Usage Analytics
                  </h3>
                </div>
                <div className="divide-y divide-neutral-50">
                  {tools.sort((a,b) => b.count-a.count).map((tool, i) => {
                    const maxCount = Math.max(...tools.map(t => t.count), 1);
                    return (
                      <div key={tool.slug} className="px-5 py-4 flex items-center gap-4">
                        <span className={`text-[10px] font-black w-5 text-center ${
                          i === 0 ? "text-amber-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-orange-400" : "text-neutral-300"
                        }`}>#{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-neutral-800">{tool.title}</p>
                          <p className="text-[9px] text-neutral-400 font-mono">{tool.slug}</p>
                        </div>
                        <div className="flex items-center gap-3 w-48">
                          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              i === 0 ? "bg-amber-400" : i === 1 ? "bg-neutral-400" : "bg-neutral-300"
                            }`} style={{ width: `${(tool.count/maxCount)*100}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-neutral-700 w-10 text-right">{tool.count} uses</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
