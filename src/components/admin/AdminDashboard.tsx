/**
 * Admin Dashboard — PDFEasy
 * Only visible when logged in as an admin email.
 * Allows granting time-based access to any user.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, Users, Mail, CheckCircle, XCircle, Clock,
  Calendar, Zap, RefreshCw, X, Crown, AlertTriangle,
  UserCheck, Send, ChevronDown, Search, LogOut
} from "lucide-react";

// ─── Config ──────────────────────────────────────────────────────────────────
const ADMIN_EMAILS = ["mathinirai.a@gmail.com"];
const ADMIN_SECRET = "pdfeasy-admin-secret-2024";
const API_BASE = import.meta.env.VITE_CRM_BACKEND_URL || "http://localhost:5173";

interface UserEntry {
  email: string;
  count: number;
  plan: string;
  active: boolean;
  expiresAt: string | null;
  isAdmin: boolean;
}

interface AdminData {
  admins: UserEntry[];
  users: UserEntry[];
}

interface GrantResult {
  email: string;
  success: boolean;
  message: string;
}

function timeRemaining(isoDate: string | null): string {
  if (!isoDate) return "Lifetime";
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days >= 1) return `${days}d ${hours}h left`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m left`;
}

export function isAdminEmail(email: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.trim().toLowerCase());
}

// ─── Plan Button ──────────────────────────────────────────────────────────────
function PlanButton({
  planId, label, color, onClick, loading
}: {
  planId: string; label: string; color: string; onClick: () => void; loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${color}`}
    >
      {loading ? "..." : label}
    </button>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────
export default function AdminDashboard({
  onClose, currentUserEmail
}: {
  onClose: () => void;
  currentUserEmail: string | null;
}) {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [grantingFor, setGrantingFor] = useState<string | null>(null);
  const [grantResults, setGrantResults] = useState<GrantResult[]>([]);

  // Manual grant form
  const [manualEmail, setManualEmail] = useState("");
  const [manualPlan, setManualPlan] = useState("monthly");
  const [manualLoading, setManualLoading] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { "x-admin-secret": ADMIN_SECRET }
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load user data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const grantAccess = async (email: string, planId: string) => {
    setGrantingFor(`${email}:${planId}`);
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
      setGrantResults(prev => [
        { email, success: res.ok, message: json.message || json.error },
        ...prev.slice(0, 4)
      ]);
      if (res.ok) fetchUsers();
    } catch (e: any) {
      setGrantResults(prev => [
        { email, success: false, message: e.message },
        ...prev.slice(0, 4)
      ]);
    } finally {
      setGrantingFor(null);
    }
  };

  const handleManualGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmail.includes("@")) return;
    setManualLoading(true);
    await grantAccess(manualEmail.trim(), manualPlan);
    setManualEmail("");
    setManualLoading(false);
    setShowManualForm(false);
  };

  // Filter users by search
  const allUsers = data ? [...(data.users || [])] : [];
  const filtered = allUsers.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const PLANS = [
    { id: "starter", label: "7 Days", color: "bg-amber-100 text-amber-800 hover:bg-amber-200" },
    { id: "monthly", label: "1 Month", color: "bg-blue-100 text-blue-800 hover:bg-blue-200" },
    { id: "annual",  label: "1 Year",  color: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-950 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm tracking-tight">Admin Dashboard</h2>
              <p className="text-neutral-400 text-[10px]">Logged in as {currentUserEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsers}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-3 gap-0 border-b border-neutral-100">
          {[
            { label: "Total Users", value: allUsers.length, icon: <Users size={14} />, color: "text-blue-600" },
            { label: "Active Premium", value: allUsers.filter(u => u.active).length, icon: <Crown size={14} />, color: "text-emerald-600" },
            { label: "Free Users", value: allUsers.filter(u => !u.active).length, icon: <Clock size={14} />, color: "text-amber-600" },
          ].map((stat, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3 border-r last:border-r-0 border-neutral-100">
              <span className={stat.color}>{stat.icon}</span>
              <div>
                <p className="text-lg font-black text-neutral-900 leading-none">{stat.value}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Manual Grant Form ── */}
          <div className="px-6 py-4 border-b border-neutral-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Send size={13} className="text-neutral-500" />
                <span className="text-xs font-bold text-neutral-700">Grant Access by Email</span>
              </div>
              <button
                onClick={() => setShowManualForm(!showManualForm)}
                className="text-[10px] font-bold text-neutral-500 hover:text-neutral-900 flex items-center gap-1 cursor-pointer"
              >
                {showManualForm ? "Hide" : "Open"} <ChevronDown size={11} className={`transition-transform ${showManualForm ? "rotate-180" : ""}`} />
              </button>
            </div>

            {showManualForm && (
              <form onSubmit={handleManualGrant} className="flex flex-wrap items-end gap-2 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="customer@gmail.com"
                    value={manualEmail}
                    onChange={e => setManualEmail(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Plan</label>
                  <select
                    value={manualPlan}
                    onChange={e => setManualPlan(e.target.value)}
                    className="text-sm px-3 py-2 border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                  >
                    <option value="starter">7 Days (Starter)</option>
                    <option value="monthly">1 Month (Monthly)</option>
                    <option value="annual">1 Year (Annual)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={manualLoading}
                  className="flex items-center gap-1.5 text-sm font-bold bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  {manualLoading ? <RefreshCw size={13} className="animate-spin" /> : <UserCheck size={13} />}
                  Grant Access
                </button>
              </form>
            )}
          </div>

          {/* ── Grant Results Toast ── */}
          {grantResults.length > 0 && (
            <div className="px-6 py-3 space-y-2 border-b border-neutral-100 bg-neutral-50">
              {grantResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-[11px] font-medium px-3 py-2 rounded-lg ${r.success ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                  {r.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {r.message}
                </div>
              ))}
            </div>
          )}

          {/* ── Search ── */}
          <div className="px-6 py-3 border-b border-neutral-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-4 py-2 border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          {/* ── Users Table ── */}
          <div className="px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-neutral-400 text-sm">
                <RefreshCw size={14} className="animate-spin" /> Loading users...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-red-600 text-sm py-8 justify-center">
                <AlertTriangle size={14} /> {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 text-sm">
                <Users size={28} className="mx-auto mb-2 opacity-30" />
                {searchQuery ? "No users match your search." : "No users have signed in yet."}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-3">
                  {filtered.length} user{filtered.length !== 1 ? "s" : ""}
                </p>
                {filtered.map((user) => (
                  <div
                    key={user.email}
                    className={`flex flex-wrap items-center gap-3 p-3.5 rounded-xl border transition-all ${
                      user.isAdmin
                        ? "bg-neutral-950 border-neutral-800"
                        : user.active
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-white border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    {/* Avatar + Email */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        user.isAdmin ? "bg-emerald-500 text-white" : "bg-neutral-200 text-neutral-700"
                      }`}>
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${user.isAdmin ? "text-white" : "text-neutral-900"}`}>
                          {user.email}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {user.isAdmin ? (
                            <span className="text-[9px] bg-emerald-500 text-white font-bold px-1.5 py-0.5 rounded">👑 Admin</span>
                          ) : user.active ? (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">✓ Active</span>
                          ) : (
                            <span className="text-[9px] bg-neutral-100 text-neutral-500 font-bold px-1.5 py-0.5 rounded">Free</span>
                          )}
                          <span className={`text-[9px] truncate max-w-[120px] ${user.isAdmin ? "text-neutral-400" : "text-neutral-400"}`}>
                            {user.isAdmin ? "Lifetime access" : user.active ? `${user.plan} · ${timeRemaining(user.expiresAt)}` : `Used ${user.count}/3 tools`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Grant buttons — only for non-admins */}
                    {!user.isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-neutral-400 font-bold mr-1">Grant:</span>
                        {PLANS.map(plan => (
                          <PlanButton
                            key={plan.id}
                            planId={plan.id}
                            label={plan.label}
                            color={plan.color}
                            loading={grantingFor === `${user.email}:${plan.id}`}
                            onClick={() => grantAccess(user.email, plan.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl flex items-center justify-between">
          <p className="text-[10px] text-neutral-400">
            Changes apply instantly · Powered by PDFEasy Admin API
          </p>
          <button
            onClick={fetchUsers}
            className="text-[10px] font-bold text-neutral-600 hover:text-neutral-900 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
