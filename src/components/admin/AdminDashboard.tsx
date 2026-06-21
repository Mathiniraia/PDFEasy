/**
 * CRM Admin Dashboard — PDFEasy
 * Full CRM: see all users, their plan, usage, expiry.
 * Grant access directly from the dashboard.
 * Only visible when logged in as admin.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, Users, Mail, CheckCircle, XCircle, Clock,
  Calendar, Zap, RefreshCw, X, Crown, AlertTriangle,
  UserCheck, Send, Search, Star, Phone, Activity,
  ChevronDown, TrendingUp, DollarSign, Lock, Download
} from "lucide-react";

const ADMIN_SECRET = "pdfeasy-admin-secret-2024";
const API_BASE = "";  // same origin — works on both local and production

export function isAdminEmail(email: string | null): boolean {
  const ADMIN_EMAILS = ["mathinirai.a@gmail.com"];
  if (!email) return false;
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.trim().toLowerCase());
}

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
  { id: "starter",  label: "7 Days",    color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { id: "monthly",  label: "1 Month",   color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { id: "annual",   label: "1 Year",    color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
  { id: "lifetime", label: "Lifetime",  color: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
];

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor(diff / 60000);
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  return `${mins}m ago`;
}

function timeRemaining(isoDate: string | null): string {
  if (!isoDate) return "";
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days >= 1) return `${days}d ${hours}h left`;
  const mins = Math.floor(diff / 60000);
  return `${mins}m left`;
}

function planColor(plan: string, active: boolean): string {
  if (!active || plan === "free") return "bg-neutral-100 text-neutral-500";
  if (plan.includes("Annual") || plan.includes("annual") || plan.includes("year")) return "bg-purple-100 text-purple-700";
  if (plan.includes("Month") || plan.includes("monthly")) return "bg-blue-100 text-blue-700";
  if (plan.includes("Starter") || plan.includes("starter")) return "bg-amber-100 text-amber-700";
  if (plan.includes("Admin")) return "bg-emerald-100 text-emerald-800";
  return "bg-emerald-100 text-emerald-700";
}

export default function AdminDashboard({
  onClose,
  currentUserEmail
}: {
  onClose: () => void;
  currentUserEmail: string | null;
}) {
  const [users, setUsers] = useState<CRMUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState<"all" | "premium" | "free">("all");
  const [dateFilter, setDateFilter] = useState<string>("all-time");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [grantingFor, setGrantingFor] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; ok: boolean; msg: string }[]>([]);

  // Manual grant form
  const [showGrant, setShowGrant] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlan, setGrantPlan] = useState("monthly");
  const [grantLoading, setGrantLoading] = useState(false);

  const addToast = (ok: boolean, msg: string) => {
    const id = Date.now();
    setToasts(t => [{ id, ok, msg }, ...t.slice(0, 3)]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/crm-users`, {
        headers: { "x-admin-secret": ADMIN_SECRET }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setUsers(json.users || []);
    } catch (e: any) {
      setError(e.message || "Failed to load CRM data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const grantAccess = async (email: string, planId: string) => {
    const key = `${email}:${planId}`;
    setGrantingFor(key);
    try {
      const res = await fetch(`${API_BASE}/api/admin/grant-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET
        },
        body: JSON.stringify({ email, planId })
      });
      const json = await res.json();
      addToast(res.ok, json.message || json.error);
      if (res.ok) await fetchUsers();
    } catch (e: any) {
      addToast(false, e.message);
    } finally {
      setGrantingFor(null);
    }
  };

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmail.includes("@")) return;
    setGrantLoading(true);
    await grantAccess(grantEmail.trim(), grantPlan);
    setGrantEmail("");
    setGrantLoading(false);
    setShowGrant(false);
  };

  const revokeAccess = async (email: string) => {
    if (!confirm(`Revoke ALL access for ${email}?`)) return;
    setGrantingFor(`${email}:revoke`);
    try {
      const res = await fetch(`${API_BASE}/api/admin/revoke-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET
        },
        body: JSON.stringify({ email })
      });
      const json = await res.json();
      addToast(res.ok, json.message || json.error);
      if (res.ok) await fetchUsers();
    } catch (e: any) {
      addToast(false, e.message);
    } finally {
      setGrantingFor(null);
    }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.displayName || "").toLowerCase().includes(q) ||
      (u.phone || "").toLowerCase().includes(q);
    const matchPlan =
      filterPlan === "all" ? true :
      filterPlan === "premium" ? u.premiumActive :
      !u.premiumActive;
      
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

  const totalUsers = filtered.length;
  const premiumUsers = filtered.filter(u => u.premiumActive && !u.isAdmin).length;
  const freeUsers = filtered.filter(u => !u.premiumActive && !u.isAdmin).length;
  const adminCount = filtered.filter(u => u.isAdmin).length;

  const exportToCSV = () => {
    if (filtered.length === 0) return;
    
    const headers = ["ID", "Name", "Email", "Phone", "Auth Provider", "Plan Status", "Usage Count", "Premium Active", "Expires At", "Joined At", "Is Admin"];
    const rows = filtered.map(u => [
      u.id,
      `"${(u.displayName || "").replace(/"/g, '""')}"`,
      `"${(u.email || "").replace(/"/g, '""')}"`,
      `"${(u.phone || "").replace(/"/g, '""')}"`,
      u.authProvider,
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
    link.setAttribute("download", `pdfeasy_crm_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-50/90 backdrop-blur-md overflow-hidden">
      <div className="w-full h-full max-w-7xl mx-auto flex flex-col bg-white shadow-[0_0_50px_rgba(0,0,0,0.05)] border-x border-neutral-200">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-neutral-900 font-bold text-lg">CRM Dashboard</h2>
              <p className="text-neutral-500 text-xs font-mono">{currentUserEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchUsers} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition cursor-pointer text-xs font-bold" title="Refresh">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={onClose} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white transition cursor-pointer text-xs font-bold">
              <X size={14} /> Close
            </button>
          </div>
        </div>

        {/* ── Stats Strip ── */}
        <div className="grid grid-cols-4 border-b border-neutral-100 shrink-0">
          {[
            { label: "Total Users", value: totalUsers, icon: <Users size={13} />, color: "text-neutral-700" },
            { label: "Premium", value: premiumUsers, icon: <Crown size={13} />, color: "text-blue-600" },
            { label: "Free Users", value: freeUsers, icon: <Activity size={13} />, color: "text-amber-600" },
            { label: "Admins", value: adminCount, icon: <Shield size={13} />, color: "text-emerald-600" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-3 border-r last:border-r-0 border-neutral-100">
              <span className={s.color}>{s.icon}</span>
              <div>
                <p className="text-base font-black text-neutral-900 leading-none">{s.value}</p>
                <p className="text-[9px] text-neutral-400 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">

          {/* ── Toasts ── */}
          {toasts.length > 0 && (
            <div className="px-5 pt-3 space-y-1.5 shrink-0">
              {toasts.map(t => (
                <div key={t.id} className={`flex items-center gap-2 text-[11px] font-medium px-3 py-2 rounded-lg border ${t.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"}`}>
                  {t.ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
                  {t.msg}
                </div>
              ))}
            </div>
          )}

          {/* ── Grant Access Form ── */}
          <div className="px-5 pt-4 shrink-0">
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowGrant(!showGrant)}
                className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                  <UserCheck size={13} className="text-emerald-600" />
                  Grant Access to a User
                </div>
                <ChevronDown size={12} className={`text-neutral-400 transition-transform ${showGrant ? "rotate-180" : ""}`} />
              </button>

              {showGrant && (
                <form onSubmit={handleManualGrant} className="px-4 pb-4 pt-3 flex flex-wrap gap-2 items-end border-t border-neutral-100">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[9px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="user@gmail.com"
                      value={grantEmail}
                      onChange={e => setGrantEmail(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Plan</label>
                    <select
                      value={grantPlan}
                      onChange={e => setGrantPlan(e.target.value)}
                      className="text-xs px-3 py-2 border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                    >
                      <option value="starter">7 Days — Starter</option>
                      <option value="monthly">1 Month — Monthly</option>
                      <option value="annual">1 Year — Annual</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={grantLoading}
                    className="flex items-center gap-1.5 text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {grantLoading ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                    Grant
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* ── Filters & Export ── */}
          <div className="px-5 pt-3 pb-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-4 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div className="flex gap-1 border border-neutral-200 rounded-lg p-1 bg-neutral-50">
                {(["all", "premium", "free"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterPlan(f)}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-md transition cursor-pointer capitalize ${
                      filterPlan === f
                        ? "bg-white text-neutral-900 shadow-sm border border-neutral-200/50"
                        : "bg-transparent text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              
              <div className="relative border border-neutral-200 rounded-lg bg-white px-3 py-2.5 flex items-center gap-2">
                 <Calendar size={12} className="text-neutral-400" />
                 <select 
                   value={dateFilter} 
                   onChange={(e) => setDateFilter(e.target.value)}
                   className="text-[10px] font-bold text-neutral-700 bg-transparent outline-none cursor-pointer uppercase tracking-wider"
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
                <div className="flex items-center gap-2 border border-neutral-200 rounded-lg bg-white px-3 py-1.5">
                  <input 
                    type="date" 
                    value={customStartDate} 
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="text-[10px] font-bold text-neutral-700 outline-none"
                  />
                  <span className="text-[10px] text-neutral-400">to</span>
                  <input 
                    type="date" 
                    value={customEndDate} 
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="text-[10px] font-bold text-neutral-700 outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Export Data</span>
              <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 border-2 border-emerald-500 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition cursor-pointer text-[10px] font-bold uppercase tracking-wider">
                 <Download size={14} /> Download CSV File
              </button>
            </div>
          </div>

          {/* ── User Table ── */}
          <div className="px-5 pb-5 flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-neutral-400 text-sm">
                <RefreshCw size={14} className="animate-spin" /> Loading users from Supabase...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-500 text-sm gap-2">
                <AlertTriangle size={20} />
                <span>{error}</span>
                <button onClick={fetchUsers} className="text-xs underline cursor-pointer">Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-neutral-400 text-sm">
                <Users size={28} className="mx-auto mb-2 opacity-30" />
                {search ? "No users match your search." : "No users have signed in yet."}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  {filtered.length} user{filtered.length !== 1 ? "s" : ""}
                </p>

                {filtered.map(user => (
                  <div
                    key={user.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      user.isAdmin
                        ? "bg-neutral-950 border-neutral-800"
                        : user.premiumActive
                        ? "bg-white border-emerald-200"
                        : "bg-white border-neutral-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                        user.isAdmin ? "bg-emerald-500 text-white" : "bg-neutral-100 text-neutral-700"
                      }`}>
                        {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold truncate ${user.isAdmin ? "text-white" : "text-neutral-900"}`}>
                            {user.displayName || "—"}
                          </span>
                          {user.isAdmin && (
                            <span className="text-[9px] bg-emerald-500 text-white font-bold px-1.5 py-0.5 rounded">👑 Admin</span>
                          )}
                          {/* Plan badge */}
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${planColor(user.planStatus, user.premiumActive)}`}>
                            {user.isAdmin ? "Lifetime" : user.premiumActive ? user.planStatus : "Free"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {/* Email */}
                          {user.email && (
                            <span className={`text-[10px] flex items-center gap-1 ${user.isAdmin ? "text-neutral-400" : "text-neutral-500"}`}>
                              <Mail size={9} /> {user.email}
                            </span>
                          )}
                          {/* Phone */}
                          {user.phone && (
                            <span className="text-[10px] flex items-center gap-1 text-neutral-500">
                              <Phone size={9} /> {user.phone}
                            </span>
                          )}
                          {/* Auth provider */}
                          <span className="text-[10px] text-neutral-400">{user.authProvider}</span>
                          {/* Usage */}
                          {!user.isAdmin && (
                            <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                              <Activity size={9} /> {user.usageCount} uses
                            </span>
                          )}
                          {/* Expiry */}
                          {user.premiumActive && user.expiresAt && (
                            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                              <Clock size={9} /> {timeRemaining(user.expiresAt)}
                            </span>
                          )}
                          {/* Joined */}
                          <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                            <Calendar size={9} /> {timeAgo(user.joinedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Grant + Revoke Buttons — only non-admins */}
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
                          {/* Revoke button — only show if user has active access */}
                          {user.premiumActive && (
                            <button
                              onClick={() => revokeAccess(user.email!)}
                              disabled={!!grantingFor}
                              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition cursor-pointer disabled:opacity-40"
                            >
                              {grantingFor === `${user.email}:revoke` ? "..." : "🚫 Revoke"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-2.5 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl flex items-center justify-between shrink-0">
          <p className="text-[9px] text-neutral-400">
            Data from Supabase · {totalUsers} total users registered
          </p>
          <button onClick={fetchUsers} className="text-[10px] font-bold text-neutral-500 hover:text-neutral-900 flex items-center gap-1 cursor-pointer">
            <RefreshCw size={9} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
