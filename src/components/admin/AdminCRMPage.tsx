/**
 * Standalone CRM Admin Page — /admin
 * Accessible at: https://yourdomain.com/admin
 * Password protected — uses ADMIN_SECRET
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, Users, Mail, CheckCircle, XCircle, Clock,
  RefreshCw, X, Crown, AlertTriangle, UserCheck,
  Send, Search, Activity, Phone, Calendar,
  ChevronDown, Lock, LogOut, Eye, EyeOff
} from "lucide-react";

const ADMIN_SECRET = "pdfeasy-admin-secret-2024";
const SESSION_KEY  = "pdfeasy_admin_session";

interface CRMUser {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  authProvider: string;
  planStatus: string;
  usageCount: number;
  premiumActive: boolean;
  expiresAt: string | null;
  joinedAt: string;
  isAdmin: boolean;
}

const GRANT_PLANS = [
  { id: "starter", label: "7 Days",  color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { id: "monthly", label: "1 Month", color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { id: "annual",  label: "1 Year",  color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
];

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const days = Math.floor(d / 86400000);
  const hrs  = Math.floor(d / 3600000);
  const mins = Math.floor(d / 60000);
  if (days >= 1) return `${days}d ago`;
  if (hrs  >= 1) return `${hrs}h ago`;
  return `${mins}m ago`;
}

function timeLeft(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return "Expired";
  const days = Math.floor(d / 86400000);
  const hrs  = Math.floor((d % 86400000) / 3600000);
  if (days >= 1) return `${days}d ${hrs}h left`;
  return `${Math.floor(d / 60000)}m left`;
}

function planBadge(plan: string, active: boolean, isAdmin: boolean) {
  if (isAdmin) return "bg-emerald-100 text-emerald-800";
  if (!active || plan === "free") return "bg-neutral-100 text-neutral-500";
  if (/annual|year/i.test(plan))   return "bg-purple-100 text-purple-700";
  if (/month/i.test(plan))         return "bg-blue-100 text-blue-700";
  if (/starter|7/i.test(plan))     return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [secret, setSecret] = useState("");
  const [show, setShow]     = useState(false);
  const [err, setErr]       = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (secret === ADMIN_SECRET) {
      sessionStorage.setItem(SESSION_KEY, "1");
      onLogin();
    } else {
      setErr("Incorrect admin password.");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-neutral-950 rounded-2xl flex items-center justify-center">
            <Shield size={26} className="text-emerald-400" />
          </div>
        </div>
        <h1 className="text-xl font-black text-neutral-900 text-center mb-1">Admin CRM</h1>
        <p className="text-xs text-neutral-400 text-center mb-6">PDFEasy · Restricted Access</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              placeholder="Admin password"
              value={secret}
              onChange={e => { setSecret(e.target.value); setErr(""); }}
              className="w-full text-sm px-4 py-3 pr-10 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 cursor-pointer"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {err && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <XCircle size={11} /> {err}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer"
          >
            Enter Dashboard
          </button>
        </form>

        <p className="text-[10px] text-neutral-300 text-center mt-5">
          🔒 Access restricted to PDFEasy admin only
        </p>
      </div>
    </div>
  );
}

// ─── Main CRM Page ────────────────────────────────────────────────────────────
export default function AdminCRMPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [users,  setUsers]  = useState<CRMUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "premium" | "free">("all");
  const [grantingFor, setGrantingFor] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; ok: boolean; msg: string }[]>([]);

  // Grant form
  const [showGrant, setShowGrant] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlan,  setGrantPlan]  = useState("monthly");
  const [grantLoading, setGrantLoading] = useState(false);

  const addToast = (ok: boolean, msg: string) => {
    const id = Date.now();
    setToasts(t => [{ id, ok, msg }, ...t.slice(0, 3)]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/crm-users", {
        headers: { "x-admin-secret": ADMIN_SECRET }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setUsers(json.users || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authed) fetchUsers(); }, [authed, fetchUsers]);

  const grantAccess = async (email: string, planId: string) => {
    const key = `${email}:${planId}`;
    setGrantingFor(key);
    try {
      const res = await fetch("/api/admin/grant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({ email, planId })
      });
      const json = await res.json();
      addToast(res.ok, json.message || json.error);
      if (res.ok) fetchUsers();
    } catch (e: any) {
      addToast(false, e.message);
    } finally {
      setGrantingFor(null);
    }
  };

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantLoading(true);
    await grantAccess(grantEmail.trim(), grantPlan);
    setGrantEmail("");
    setGrantLoading(false);
    setShowGrant(false);
  };

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  // Stats
  const total   = users.length;
  const premium = users.filter(u => u.premiumActive && !u.isAdmin).length;
  const free    = users.filter(u => !u.premiumActive && !u.isAdmin).length;
  const admins  = users.filter(u => u.isAdmin).length;

  // Filter
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || (u.email||"").toLowerCase().includes(q) || (u.displayName||"").toLowerCase().includes(q) || (u.phone||"").includes(q);
    const matchF = filter === "all" ? true : filter === "premium" ? u.premiumActive : !u.premiumActive;
    return matchQ && matchF;
  });

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">

      {/* ── Top Navbar ── */}
      <div className="bg-neutral-950 border-b border-neutral-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Shield size={13} className="text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-sm">PDFEasy CRM</span>
            <span className="text-neutral-500 text-[10px] ml-2">Admin Panel</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsers}
            className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false); }}
            className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 hover:text-red-400 transition cursor-pointer"
          >
            <LogOut size={11} /> Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Users",    value: total,   icon: <Users size={16} />,    color: "text-neutral-600",  bg: "bg-white" },
            { label: "Premium Active", value: premium, icon: <Crown size={16} />,    color: "text-blue-600",     bg: "bg-blue-50" },
            { label: "Free Users",     value: free,    icon: <Activity size={16} />, color: "text-amber-600",    bg: "bg-amber-50" },
            { label: "Admins",         value: admins,  icon: <Shield size={16} />,   color: "text-emerald-600",  bg: "bg-emerald-50" },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-xl border border-neutral-200 px-4 py-3 flex items-center gap-3`}>
              <span className={s.color}>{s.icon}</span>
              <div>
                <p className="text-2xl font-black text-neutral-900 leading-none">{s.value}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Toasts ── */}
        {toasts.length > 0 && (
          <div className="space-y-1.5">
            {toasts.map(t => (
              <div key={t.id} className={`flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-xl border ${t.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"}`}>
                {t.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                {t.msg}
              </div>
            ))}
          </div>
        )}

        {/* ── Grant Access ── */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <button
            onClick={() => setShowGrant(!showGrant)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-neutral-50 transition cursor-pointer"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
              <UserCheck size={15} className="text-emerald-600" />
              Grant Free Access to a User
            </div>
            <ChevronDown size={14} className={`text-neutral-400 transition-transform ${showGrant ? "rotate-180" : ""}`} />
          </button>

          {showGrant && (
            <form onSubmit={handleManualGrant} className="px-5 pb-5 pt-3 flex flex-wrap gap-3 items-end border-t border-neutral-100">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">User Email</label>
                <input
                  type="email"
                  placeholder="friend@gmail.com"
                  value={grantEmail}
                  onChange={e => setGrantEmail(e.target.value)}
                  className="w-full text-sm px-3 py-2.5 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Plan</label>
                <select
                  value={grantPlan}
                  onChange={e => setGrantPlan(e.target.value)}
                  className="text-sm px-3 py-2.5 border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                >
                  <option value="starter">7 Days — Starter</option>
                  <option value="monthly">1 Month — Monthly</option>
                  <option value="annual">1 Year — Annual</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={grantLoading}
                className="flex items-center gap-2 text-sm font-bold bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {grantLoading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                Grant Access
              </button>
            </form>
          )}
        </div>

        {/* ── Users Table ── */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {/* Table header / filters */}
          <div className="px-5 py-3.5 border-b border-neutral-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "premium", "free"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer capitalize ${
                    filter === f
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "text-neutral-500 border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-neutral-400 font-bold ml-auto">
              {filtered.length} of {total} users
            </span>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-neutral-400 text-sm">
              <RefreshCw size={14} className="animate-spin" /> Loading from Supabase...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-12 text-red-500 text-sm gap-2">
              <AlertTriangle size={20} />
              {error}
              <button onClick={fetchUsers} className="text-xs underline cursor-pointer">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-neutral-400 text-sm">
              <Users size={28} className="mx-auto mb-2 opacity-30" />
              {search ? "No users match your search." : "No users have signed in yet."}
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filtered.map(user => (
                <div key={user.id} className={`px-5 py-4 flex flex-wrap items-center gap-3 hover:bg-neutral-50 transition ${user.isAdmin ? "bg-neutral-950 hover:bg-neutral-900" : ""}`}>

                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${user.isAdmin ? "bg-emerald-500 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                    {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
                  </div>

                  {/* Info block */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${user.isAdmin ? "text-white" : "text-neutral-900"}`}>
                        {user.displayName || "—"}
                      </span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${planBadge(user.planStatus, user.premiumActive, user.isAdmin)}`}>
                        {user.isAdmin ? "👑 Admin" : user.premiumActive ? user.planStatus : "Free"}
                      </span>
                    </div>

                    <div className="flex items-center flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {user.email && (
                        <span className={`text-xs flex items-center gap-1 ${user.isAdmin ? "text-neutral-400" : "text-neutral-600"}`}>
                          <Mail size={10} /> {user.email}
                        </span>
                      )}
                      {user.phone && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Phone size={10} /> {user.phone}
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Activity size={9} /> {user.usageCount} uses
                      </span>
                      {user.premiumActive && user.expiresAt && (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <Clock size={9} /> {timeLeft(user.expiresAt)}
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Calendar size={9} /> Joined {timeAgo(user.joinedAt)}
                      </span>
                      <span className="text-[10px] text-neutral-400">{user.authProvider}</span>
                    </div>
                  </div>

                  {/* Grant buttons */}
                  {!user.isAdmin && user.email && (
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <span className="text-[9px] text-neutral-400 font-bold">Grant:</span>
                      {GRANT_PLANS.map(plan => (
                        <button
                          key={plan.id}
                          onClick={() => grantAccess(user.email!, plan.id)}
                          disabled={!!grantingFor}
                          className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer disabled:opacity-40 ${plan.color}`}
                        >
                          {grantingFor === `${user.email}:${plan.id}` ? "..." : plan.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-neutral-400 pb-4">
          PDFEasy Admin CRM · All data encrypted at rest in Supabase
        </p>
      </div>
    </div>
  );
}
