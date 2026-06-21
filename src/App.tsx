/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Layers, Scissors, FileImage, Trash2, RotateCw, 
  Minimize2, Shield, Gem, HelpCircle, Check, Sparkles, 
  ChevronDown, ChevronRight, Info, Clock, AlertTriangle, 
  ShieldCheck, Heart, ExternalLink, ArrowRight, FileText, 
  Compass, ArrowLeft, RefreshCw, Lock, PenTool, FileSignature
} from "lucide-react";

import { TOOLS } from "./toolsData";
import { ToolDefinition } from "./types";
import ToolWorkspace from "./components/tools/ToolWorkspace";
import PaywallModal from "./components/payment/PaywallModal";
import AdminDashboard, { isAdminEmail } from "./components/admin/AdminDashboard";
import AdminPage from "./components/admin/AdminPage";
import { signInWithPopup, signInWithRedirect, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { logUserActivity } from "./lib/logUserActivity";

export default function App() {
  // Custom router state
  const [currentSlug, setCurrentSlug] = useState<string>("");
  const [showAdminPage, setShowAdminPage] = useState(false);
  
  // Paywall states
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [premiumUnlocked, setPremiumUnlocked] = useState(false);
  const [premiumPlanName, setPremiumPlanName] = useState("");
  const [planExpiresAt, setPlanExpiresAt] = useState<number | null>(null); // ms timestamp

  // FAQ Accordion states
  const [activeFaqIndices, setActiveFaqIndices] = useState<number[]>([]);

  // Admin Dashboard
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // Auth States
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(() => {
    return localStorage.getItem("user_email");
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "phone">("signup");
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authConfirmPasswordInput, setAuthConfirmPasswordInput] = useState("");
  const [authPhoneInput, setAuthPhoneInput] = useState("");
  const [authOtpInput, setAuthOtpInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [otpConfirmationResult, setOtpConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const resetAuthForm = () => {
    setAuthEmailInput("");
    setAuthPasswordInput("");
    setAuthConfirmPasswordInput("");
    setAuthPhoneInput("");
    setAuthOtpInput("");
    setOtpSent(false);
    setAuthError("");
    setOtpConfirmationResult(null);
    // Clear recaptcha on reset
    if ((window as any).appRecaptchaVerifier) {
      try { (window as any).appRecaptchaVerifier.clear(); } catch {}
      (window as any).appRecaptchaVerifier = null;
    }
  };

  const initAppRecaptcha = () => {
    if (!(window as any).appRecaptchaVerifier) {
      try {
        (window as any).appRecaptchaVerifier = new RecaptchaVerifier(auth, "app-recaptcha-container", {
          size: "invisible",
          callback: () => {},
          "expired-callback": () => {
            if ((window as any).appRecaptchaVerifier) {
              try { (window as any).appRecaptchaVerifier.clear(); } catch {}
              (window as any).appRecaptchaVerifier = null;
            }
          }
        });
      } catch (err) {
        console.error("reCAPTCHA init failed:", err);
      }
    }
  };

  const handleSendPhoneOtp = async () => {
    setAuthError("");
    const phone = authPhoneInput.trim();
    if (!phone.startsWith("+") || phone.length < 10) {
      setAuthError("Enter phone number with country code, e.g. +919876543210");
      return;
    }
    setOtpLoading(true);
    try {
      initAppRecaptcha();
      const appVerifier = (window as any).appRecaptchaVerifier;
      if (!appVerifier) throw new Error("reCAPTCHA could not be initialized.");
      const confirmation = await signInWithPhoneNumber(auth, phone, appVerifier);
      setOtpConfirmationResult(confirmation);
      setOtpSent(true);
    } catch (err: any) {
      console.error("Send OTP error:", err);
      setAuthError(err.message || "Failed to send OTP. Please try again.");
      if ((window as any).appRecaptchaVerifier) {
        try { (window as any).appRecaptchaVerifier.clear(); } catch {}
        (window as any).appRecaptchaVerifier = null;
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    setAuthError("");
    if (!otpConfirmationResult) {
      setAuthError("Session expired. Please send OTP again.");
      setOtpSent(false);
      return;
    }
    if (!authOtpInput || authOtpInput.length !== 6) {
      setAuthError("Please enter the 6-digit OTP code.");
      return;
    }
    setOtpLoading(true);
    try {
      const result = await otpConfirmationResult.confirm(authOtpInput);
      const user = result.user;
      const phoneId = user.phoneNumber || authPhoneInput;
      const mockEmail = `${phoneId}@phone.otp`;
      localStorage.setItem("user_email", mockEmail);
      setCurrentUserEmail(mockEmail);
      setShowAuthModal(false);
      resetAuthForm();
      syncUserSession("Phone User", phoneId, premiumUnlocked ? "pro" : "free");
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      setAuthError("Invalid OTP code. Please check and try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const syncUserSession = async (
    name: string,
    contactInfo: string,
    planStatus: string = "free",
    authProvider: "email" | "google" | "phone" = "email"
  ) => {
    try {
      const isEmail = contactInfo.includes("@") && !contactInfo.endsWith("@phone.otp");
      await fetch("/api/crm/sync-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}`,
          email: isEmail ? contactInfo : null,
          phone: !isEmail ? contactInfo : null,
          authProvider: isEmail ? "google" : "phone",
          planStatus: planStatus
        })
      });
    } catch (err) {
      console.error("Failed to sync user session:", err);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");


    if (authMode === "signup") {
      if (!authEmailInput.includes("@")) {
        setAuthError("Please enter a valid Gmail address.");
        return;
      }
      if (authPasswordInput.length < 6) {
        setAuthError("Password must be at least 6 characters long.");
        return;
      }
      if (authPasswordInput !== authConfirmPasswordInput) {
        setAuthError("Passwords do not match.");
        return;
      }
      localStorage.setItem("user_email", authEmailInput);
      setCurrentUserEmail(authEmailInput);
      setShowAuthModal(false);
      resetAuthForm();
      syncUserSession(authEmailInput.split("@")[0], authEmailInput, premiumUnlocked ? "pro" : "free");
    } else if (authMode === "signin") {
      if (!authEmailInput) {
        setAuthError("Please enter your Gmail address.");
        return;
      }
      localStorage.setItem("user_email", authEmailInput);
      setCurrentUserEmail(authEmailInput);
      setShowAuthModal(false);
      resetAuthForm();
      syncUserSession(authEmailInput.split("@")[0], authEmailInput, premiumUnlocked ? "pro" : "free");
    } else if (authMode === "phone") {
      // Phone OTP handled separately via handleSendPhoneOtp / handleVerifyPhoneOtp
      if (!otpSent) {
        await handleSendPhoneOtp();
      } else {
        await handleVerifyPhoneOtp();
      }
    }
  };

  const handleScrollToTools = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById("tools_section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const getToolColorStyles = (slug: string) => {
    switch (slug) {
      case "merge-pdf":
        return {
          bg: "bg-sky-50 text-sky-600 border-sky-100 group-hover:bg-sky-600 group-hover:text-white group-hover:border-sky-600",
        };
      case "split-pdf":
        return {
          bg: "bg-violet-50 text-violet-600 border-violet-100 group-hover:bg-violet-600 group-hover:text-white group-hover:border-violet-600",
        };
      case "jpg-to-pdf":
        return {
          bg: "bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600",
        };
      case "pdf-to-jpg":
        return {
          bg: "bg-orange-50 text-orange-600 border-orange-100 group-hover:bg-orange-600 group-hover:text-white group-hover:border-orange-600",
        };
      case "delete-pdf-pages":
        return {
          bg: "bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white group-hover:border-rose-600",
        };
      case "rotate-pdf":
        return {
          bg: "bg-yellow-50 text-yellow-600 border-yellow-200 group-hover:bg-yellow-500 group-hover:text-white group-hover:border-yellow-500",
        };
      case "compress-pdf":
        return {
          bg: "bg-indigo-50 text-indigo-600 border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600",
        };
      case "protect-pdf":
        return {
          bg: "bg-slate-100 text-slate-700 border-slate-200 group-hover:bg-slate-700 group-hover:text-white group-hover:border-slate-700",
        };
      case "unlock-pdf":
        return {
          bg: "bg-teal-50 text-teal-600 border-teal-100 group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-600",
        };
      case "pdf-to-word":
        return {
          bg: "bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600",
        };
      case "word-to-pdf":
        return {
          bg: "bg-cyan-50 text-cyan-600 border-cyan-100 group-hover:bg-cyan-600 group-hover:text-white group-hover:border-cyan-600",
        };
      case "edit-pdf":
        return {
          bg: "bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600",
        };
      case "sign-pdf":
        return {
          bg: "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100 group-hover:bg-fuchsia-600 group-hover:text-white group-hover:border-fuchsia-600",
        };
      default:
        return {
          bg: "bg-neutral-50 text-neutral-600 border-neutral-100 group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-950",
        };
    }
  };

  // Monitor path name for dynamic route mapping
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.replace(/^\//, "");
      // If valid slug fits, set it, else empty (home screen)
      // /admin route
      if (path === "admin") {
        setShowAdminPage(true);
        setCurrentSlug("");
        return;
      }
      setShowAdminPage(false);
      if (path === "premium") {
        setCurrentSlug("");
        window.history.replaceState(null, "", "/");
        setIsPaywallOpen(true);
        return;
      }
      const exists = TOOLS.some(t => t.slug === path);
      if (exists) {
        setCurrentSlug(path);
      } else {
        setCurrentSlug("");
      }
    };

    // Initial check
    handleLocationChange();

    // Listen to popstate
    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Update dynamic route slug cleanly without refreshing
  const navigateToSlug = (slug: string) => {
    const targetPath = slug ? `/${slug}` : "/";
    window.history.pushState(null, "", targetPath);
    // Dispatch fake popstate for trigger
    window.dispatchEvent(new PopStateEvent("popstate"));
    // Scroll to workspace on change
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Dynamic page visit tracking for both Supabase activity logs and CRM bridge
  useEffect(() => {
    const user = auth.currentUser;
    const userId = user ? user.uid : (localStorage.getItem("user_id") || "usr_anonymous");
    const email = user ? (user.email || "") : (localStorage.getItem("user_email") || "");
    const displayName = user ? (user.displayName || email.split("@")[0] || "User") : "Guest User";
    const activeSlug = currentSlug ? `/${currentSlug}` : "/";

    // 1. Log to Supabase user_page_visits table
    logUserActivity(userId, displayName, activeSlug);

    // 2. Log to CRM dashboard webhook (fire-and-forget)
    (async () => {
      try {
        const crmBase = (import.meta as any).env?.VITE_CRM_BACKEND_URL || "http://localhost:3001";
        await fetch(`${crmBase}/api/admin/log-page-visit`, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
            "x-admin-email": "mathinirai.a@gmail.com",
          },
          body: JSON.stringify({
            userId: userId,
            slug: activeSlug,
            name: displayName,
            email: email || null,
          }),
        });
      } catch (e) {
        // Silent catch
      }
    })();
  }, [currentSlug]);

  // FIREBASE AUTH STATE LIFECYCLE HANDLER
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const email = user.email || "";
        setCurrentUserEmail(email);
        localStorage.setItem("user_email", email);
        localStorage.setItem("user_id", user.uid);

        const displayName = user.displayName || email.split("@")[0] || "Google User";
        const avatarUrl = user.photoURL || null;
        const phone = user.phoneNumber || null;
        const authProvider = email ? "google" : "phone";

        // Automated background sync request
        try {
          const response = await fetch("/api/crm/sync-user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              displayName,
              avatarUrl,
              email: email || null,
              phone,
              authProvider,
              planStatus: premiumUnlocked ? "pro" : "free",
            }),
          });

          if (response.ok) {
            console.log("Successfully dropped encrypted user envelope into database box!");
          } else {
            const errText = await response.text();
            console.error("Database box rejected the envelope:", errText);
          }
        } catch (error: any) {
          console.error("Database box rejected the envelope:", error.message || error);
        }
      } else {
        setCurrentUserEmail(null);
        localStorage.removeItem("user_email");
        localStorage.removeItem("user_id");
      }
    });

    return () => unsubscribe();
  }, [premiumUnlocked]);

  // BACKEND IP/ACCOUNT USAGE STATUS INITIALIZER
  useEffect(() => {
    const fetchUsageStatus = async () => {
      try {
        const email = localStorage.getItem("user_email") || "";
        const response = await fetch(`/api/usage/status?email=${encodeURIComponent(email)}`);
        if (response.ok) {
          const data = await response.json();
          setUsageCount(data.count);
          if (data.premiumUnlocked && data.planExpiresAt) {
            // Verify expiry client-side too
            if (data.planExpiresAt > Date.now()) {
              setPremiumUnlocked(true);
              setPremiumPlanName(data.planName || "Premium");
              setPlanExpiresAt(data.planExpiresAt);
            } else {
              // Already expired — clear
              setPremiumUnlocked(false);
              setPlanExpiresAt(null);
            }
          } else {
            setPremiumUnlocked(false);
            setPlanExpiresAt(null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial usage status:", err);
      }
    };
    fetchUsageStatus();
  }, [currentUserEmail]);

  // Periodic expiry checker — checks every 60 seconds if premium has lapsed
  useEffect(() => {
    if (!planExpiresAt) return;
    const interval = setInterval(() => {
      if (Date.now() >= planExpiresAt) {
        setPremiumUnlocked(false);
        setPlanExpiresAt(null);
        setPremiumPlanName("");
        // Show paywall on next tool action — no need to force popup now
        console.log("[Plan] Plan expired — premium revoked");
        clearInterval(interval);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [planExpiresAt]);

  // Check and increment attempt logic
  const handleUsageIncrement = async (): Promise<boolean> => {
    try {
      const email = localStorage.getItem("user_email") || "";
      const response = await fetch("/api/usage/increment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, toolSlug: currentSlug || "" }),
      });
      if (!response.ok) {
        throw new Error("Server limit check failed");
      }
      const data = await response.json();
      setUsageCount(data.count);
      
      if (premiumUnlocked) return true; // unlimited access

      if (!data.allowed) {
        setIsPaywallOpen(true);
        return false; // blocked
      }
      return true; // allowed
    } catch (err) {
      console.error("Usage limit check error:", err);
      if (premiumUnlocked) return true;
      setIsPaywallOpen(true);
      return false;
    }
  };

  // Log specific tool actions (drag_drop, convert, download) to Supabase
  const handleLogAction = async (toolSlug: string, actionType: string) => {
    try {
      const email = localStorage.getItem("user_email") || "";
      await fetch("/api/usage/log-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, toolSlug, actionType }),
      });
    } catch (err) {
      console.error("Action logging failed:", err);
    }
  };

  // Callback on successful checkout payment
  const handlePaymentSuccessUnlock = async (planId: string) => {
    const planNameLabel = planId === "daily" ? "Daily Pass (24h)" : planId === "weekly" ? "Weekly Pass (7 days)" : "Monthly Pro (30 days)";
    
    // Compute client-side expiry (as fallback — server is authoritative)
    const durations: Record<string, number> = {
      daily:   24 * 60 * 60 * 1000,
      weekly:  7  * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };
    const expiresAt = Date.now() + (durations[planId] ?? durations.daily);

    setPremiumUnlocked(true);
    setPremiumPlanName(planNameLabel);
    setPlanExpiresAt(expiresAt);
    setIsPaywallOpen(false);

    const email = localStorage.getItem("user_email") || "";

    // Sync upgraded status to CRM
    if (currentUserEmail) {
      const name = currentUserEmail.includes("@") && !currentUserEmail.endsWith("@phone.otp")
        ? currentUserEmail.split("@")[0]
        : "Phone User";
      const isPhone = currentUserEmail.endsWith("@phone.otp");
      const cleanContact = isPhone ? currentUserEmail.split("@")[0] : currentUserEmail;
      syncUserSession(name, cleanContact, "pro", isPhone ? "phone" : "email");
    }
    // Note: /api/usage/unlock is now called inside PaywallModal's triggerPaymentSuccess
    // (to capture the server-returned planExpiresAt). No double-call needed here.
  };

  // Reset/Revoke Premium license for testing
  const resetPremiumLicenseForDemo = async () => {
    setPremiumUnlocked(false);
    setPremiumPlanName("");
    setUsageCount(0);
    const email = localStorage.getItem("user_email") || "";
    try {
      await fetch("/api/usage/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      console.error("Failed to reset backend usage:", err);
    }
  };

  // Find active tool
  const currentTool = TOOLS.find(t => t.slug === currentSlug);

  const toggleFaq = (idx: number) => {
    setActiveFaqIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  // ── /admin route: render admin dashboard full-screen ──────────────────────
  if (showAdminPage) {
    return (
      <AdminPage
        currentUserEmail={currentUserEmail}
        onBack={() => {
          window.history.pushState(null, "", "/");
          setShowAdminPage(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col justify-between selection:bg-neutral-900 selection:text-white" id="main_app_canvas">
      
      {/* 1. TOP PREMIUM NAV HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-neutral-200 flex-shrink-0" id="navigation_header_desk">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between relative">
          
          {/* Logo Interface */}
          <button 
            onClick={() => navigateToSlug("")}
            className="flex items-center gap-2 group cursor-pointer text-left focus:outline-none"
            id="logo_brand_btn"
          >
            <div className="w-8 h-8 bg-black rounded flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 duration-200">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-neutral-900 block leading-tight">PDF Easy</span>
              <span className="text-[9px] text-neutral-400 font-medium font-mono uppercase block tracking-wider -mt-[1px]">One Tool for Every PDF Need</span>
            </div>
          </button>

           {/* User limit states / Auth status on far right */}
          <div className="flex items-center gap-4">


            {currentUserEmail ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 font-mono hidden sm:inline">
                  Logged in: <strong className="text-neutral-800 font-bold">{currentUserEmail}</strong>
                </span>
                {premiumUnlocked && planExpiresAt ? (() => {
                  const diff = planExpiresAt - Date.now();
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  const days  = Math.floor(hours / 24);
                  const remH  = hours % 24;
                  const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  const label = days >= 1 ? `${days}d ${remH}h left` : hours >= 1 ? `${hours}h ${mins}m left` : `${mins}m left`;
                  return (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <Sparkles size={10} /> {premiumPlanName} · {label}
                    </span>
                  );
                })() : premiumUnlocked ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <Sparkles size={10} /> PRO
                  </span>
                ) : (
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 font-mono px-2 py-0.5 rounded">
                    Free ({usageCount}/3)
                  </span>
                )}
                <span className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-bold text-neutral-700 tracking-tight border border-neutral-200">
                  {currentUserEmail.charAt(0).toUpperCase()}
                </span>
                <button
                  onClick={async () => {
                    try {
                      await auth.signOut();
                    } catch (err) {
                      console.error("Sign out failed:", err);
                    }
                    localStorage.removeItem("user_email");
                    setCurrentUserEmail(null);
                  }}
                  className="text-xs text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
                {/* Admin button — only for admin emails */}
                {isAdminEmail(currentUserEmail) && (
                  <button
                    onClick={() => setShowAdminDashboard(true)}
                    className="flex items-center gap-1.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                    title="Open Admin Dashboard"
                  >
                    <Shield size={11} /> Admin
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setShowAuthModal(true);
                  }}
                  className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthMode("signup");
                    setShowAuthModal(true);
                  }}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer font-medium"
                >
                  Sign Up
                </button>
              </div>
            )}


          </div>

          {/* Admin Dashboard Modal */}
          {showAdminDashboard && isAdminEmail(currentUserEmail) && (
            <AdminDashboard
              currentUserEmail={currentUserEmail}
              onClose={() => setShowAdminDashboard(false)}
            />
          )}

          {/* Premium Google-Style Full Screen Modal Overlay for Sign In & Sign Up */}
          {showAuthModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="google_inspired_auth_modal_container">
              {/* Blur backdrop overlay */}
              <div 
                className="absolute inset-0 bg-neutral-900/45 backdrop-blur-md transition-opacity duration-300"
                onClick={() => {
                  setShowAuthModal(false);
                  resetAuthForm();
                }}
              />
              
              {/* Main Dialog Card */}
              <div className="relative bg-white w-full max-w-md rounded-2xl border border-neutral-150 shadow-2xl p-8 sm:p-10 flex flex-col justify-between overflow-hidden animate-in fade-in zoom-in-95 duration-250 select-none z-10" id="auth_overlay_card">
                
                {/* Visual decoration blur orb */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-sky-100/50 rounded-full blur-2xl pointer-events-none" />
                
                <div>
                  {/* Google-Style Branding Header */}
                  <div className="flex flex-col items-center text-center space-y-4 mb-6">
                    <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center text-xl font-bold shadow-md">
                      P
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
                        {authMode === "signup" && "Create your Free Account"}
                        {authMode === "signin" && "Sign In to PDF Easy"}
                        {authMode === "phone" && "Login via Phone OTP"}
                      </h2>
                      <p className="text-xs text-neutral-400 mt-1">
                        One Tool for Every PDF Need
                      </p>
                    </div>
                  </div>

                  {/* Mode Selector Tabs (3 Option Grid) */}
                  <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-xl mb-6">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("signup");
                        setAuthError("");
                      }}
                      className={`py-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all ${authMode === "signup" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-500 hover:text-neutral-800"}`}
                    >
                      Sign Up
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("signin");
                        setAuthError("");
                      }}
                      className={`py-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all ${authMode === "signin" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-500 hover:text-neutral-800"}`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("phone");
                        setAuthError("");
                      }}
                      className={`py-2 text-[10px] sm:text-xs font-semibold rounded-lg transition-all ${authMode === "phone" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-500 hover:text-neutral-800"}`}
                    >
                      Phone OTP
                    </button>
                  </div>

                  {/* Standard Google Single-Sign On (Social Mock Accent) */}
                  {authMode !== "phone" && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await signInWithPopup(auth, googleProvider);
                            setShowAuthModal(false);
                            resetAuthForm();
                            navigateToSlug("");
                          } catch (error: any) {
                            console.error("Google login failed", error);
                            if (error?.code === "auth/popup-blocked" || error?.message?.includes("popup-blocked")) {
                              try {
                                await signInWithRedirect(auth, googleProvider);
                              } catch (redirectErr) {
                                console.error("Google redirect login failed", redirectErr);
                                setAuthError("Redirect login failed. Please enable popups or try again.");
                              }
                            } else {
                              setAuthError("Google login failed. Please try again.");
                            }
                          }
                        }}
                        className="w-full border border-neutral-200 hover:border-neutral-300 bg-white hover:bg-neutral-50 rounded-xl px-4 py-3 text-xs font-medium text-neutral-700 flex items-center justify-center gap-3 transition shadow-3xs cursor-pointer mb-6"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <title>Google Logo</title>
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        Continue with Google
                      </button>

                      <div className="relative flex items-center justify-center mb-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-neutral-150" />
                        </div>
                        <span className="relative bg-white px-3 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                          or continue with details
                        </span>
                      </div>
                    </>
                  )}

                  {/* Auth Error Display */}
                  {authError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-150 text-red-600 rounded-xl text-xs font-medium flex items-center gap-2">
                      <span>⚠️</span> {authError}
                    </div>
                  )}

                  {/* Authentication Form */}
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    {/* GMAIL SIGN UP FLOW */}
                    {authMode === "signup" && (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Gmail Address
                          </label>
                          <input
                            type="email"
                            placeholder="your.email@gmail.com"
                            value={authEmailInput}
                            onChange={(e) => setAuthEmailInput(e.target.value)}
                            className="w-full text-sm px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Create Password
                          </label>
                          <input
                            type="password"
                            placeholder="At least 6 characters"
                            value={authPasswordInput}
                            onChange={(e) => setAuthPasswordInput(e.target.value)}
                            className="w-full text-sm px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Confirm Password
                          </label>
                          <input
                            type="password"
                            placeholder="Re-enter password"
                            value={authConfirmPasswordInput}
                            onChange={(e) => setAuthConfirmPasswordInput(e.target.value)}
                            className="w-full text-sm px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                            required
                          />
                        </div>
                      </>
                    )}

                    {/* GMAIL SIGN IN FLOW */}
                    {authMode === "signin" && (
                      <>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Gmail Address
                          </label>
                          <input
                            type="email"
                            placeholder="your.email@gmail.com"
                            value={authEmailInput}
                            onChange={(e) => setAuthEmailInput(e.target.value)}
                            className="w-full text-sm px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                            Password
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={authPasswordInput}
                            onChange={(e) => setAuthPasswordInput(e.target.value)}
                            className="w-full text-sm px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                            required
                          />
                        </div>
                      </>
                    )}

                    {/* PHONE OTP FLOW */}
                    {authMode === "phone" && (
                      <>
                        {!otpSent ? (
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                              Phone Number
                            </label>
                            <input
                              type="tel"
                              placeholder="+91 98765 43210"
                              value={authPhoneInput}
                              onChange={(e) => setAuthPhoneInput(e.target.value)}
                              className="w-full text-sm px-4 py-3 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                              required
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-center mb-1.5">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                Enter 6-Digit OTP
                              </label>
                              <button
                                type="button"
                                onClick={() => setOtpSent(false)}
                                className="text-[10px] text-sky-600 font-bold hover:underline cursor-pointer"
                              >
                                Edit Phone Number
                              </button>
                            </div>
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="123456"
                              value={authOtpInput}
                              onChange={(e) => setAuthOtpInput(e.target.value.replace(/\D/g, ""))}
                              className="w-full text-center text-lg tracking-widest font-mono py-2.5 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black"
                              required
                            />
                            <p className="text-[10px] text-neutral-400 mt-1.5 text-center">
                              Check your SMS for the 6-digit code.
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
                    <div id="app-recaptcha-container"></div>

                    <button
                      type="submit"
                      disabled={otpLoading}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-medium py-3 rounded-xl text-sm transition shadow-sm cursor-pointer mt-4 flex items-center justify-center gap-2"
                    >
                      {otpLoading ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          {!otpSent ? "Sending OTP…" : "Verifying…"}
                        </>
                      ) : (
                        <>
                          {authMode === "signup" && "Sign Up with Gmail"}
                          {authMode === "signin" && "Sign In with Gmail"}
                          {authMode === "phone" && (!otpSent ? "Send OTP Code" : "Verify & Login")}
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="mt-8 flex items-center justify-between text-xs text-neutral-400">
                  <span className="hover:underline cursor-pointer">Help Center</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAuthModal(false);
                      resetAuthForm();
                    }}
                    className="text-neutral-500 hover:text-neutral-900 font-medium cursor-pointer"
                  >
                    Go Back to Tools
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </header>

      {/* DYNAMIC SCROLLABLE SUB-NAVIGATION STRIP */}
      <div className="sticky top-16 z-30 flex-shrink-0 h-12 bg-white border-b border-neutral-200 overflow-x-auto select-none no-scrollbar" id="sub_navigation_toolbar">
        <div className="max-w-7xl mx-auto px-8 flex h-full items-center gap-8">
          <button 
            onClick={() => navigateToSlug("")} 
            className={`tool-link py-3 cursor-pointer h-full flex items-center border-b-2 border-transparent hover:text-neutral-900 ${!currentSlug ? "tool-active text-neutral-900" : ""}`}
          >
            Dashboard
          </button>
          {TOOLS.map((tool) => {
            const isItemActive = currentSlug === tool.slug;
            return (
              <button
                key={tool.slug}
                onClick={() => navigateToSlug(tool.slug)}
                className={`tool-link py-3 cursor-pointer h-full flex items-center border-b-2 border-transparent hover:text-neutral-900 ${isItemActive ? "tool-active text-neutral-900" : ""}`}
              >
                {tool.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MAIN CORE LAYOUT SYSTEM */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8" id="body_main_content">
        
        {currentTool ? (
          // WORKSPACE VIEW (Active Slugs: e.g. /merge-pdf)
          <div className="space-y-16" id="tool_active_panel">
            
            {/* Quick Breadcrumb trail */}
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
              <button onClick={() => navigateToSlug("")} className="hover:text-black hover:underline cursor-pointer">
                Tools Dashboard
              </button>
              <ChevronRight size={10} />
              <span className="text-neutral-700 font-bold">{currentTool.name}</span>
            </div>

            {/* TIER 1: CORE WORKSPACE UTILITY BLOCK */}
            <section id="tier_1_workspace_visualizer">
              <ToolWorkspace 
                key={currentTool.slug}
                tool={currentTool}
                usageCount={usageCount}
                incrementUsage={handleUsageIncrement}
                logAction={handleLogAction}
                onLimitExceeded={() => setIsPaywallOpen(true)}
              />
            </section>

            {/* TIER 2: 3-STEP INFORMATIONAL GRID */}
            <section className="border-t border-neutral-200/60 pt-16" id="tier_2_step_grid_section">
              <div className="text-center max-w-xl mx-auto mb-10">
                <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase block mb-1">Workflow Overview</span>
                <h3 className="text-xl font-bold tracking-tight text-neutral-900">How to process {currentTool.name} in 3 Simple Steps</h3>
                <p className="text-xs text-neutral-500 mt-1">Easily configure and convert your documents in just a few simple steps.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                {currentTool.steps.map((step, idx) => (
                  <div key={idx} className="glass-panel border-minimal rounded-xl p-4 flex gap-4 items-start">
                    <div className="w-8 h-8 rounded bg-neutral-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-neutral-900">
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-neutral-900 mb-1">{step.title}</h3>
                      <p className="text-xs text-neutral-500 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* TIER 3: BOTTOM SEO TEXT & ACCORDION FAQs */}
            <section className="border-t border-neutral-200/60 pt-16 max-w-4xl mx-auto" id="tier_3_seo_and_faqs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                
                {/* SEO Text Panel */}
                <div>
                  <h4 className="text-xs font-bold font-mono tracking-wider text-neutral-400 uppercase mb-3">Enterprise SEO Index</h4>
                  <p className="text-xs text-neutral-600 leading-relaxed max-w-md font-sans">
                    {currentTool.seoText}
                  </p>
                  <p className="text-xs text-neutral-500 leading-relaxed max-w-md mt-4 font-sans">
                    Get seamless access to our full suite of tools built to optimize, convert, and organize your files quickly and reliably on any modern workflow.
                  </p>
                  
                  <div className="mt-6 flex items-center gap-2 text-xs font-mono text-neutral-700">
                    <ShieldCheck size={14} className="text-emerald-500" /> Reliable conversion formats.
                  </div>
                </div>

                {/* FAQ Accordion Section */}
                <div>
                  <h4 className="text-xs font-bold font-mono tracking-wider text-neutral-400 uppercase mb-4">Frequently Asked Questions</h4>
                  
                  <div className="space-y-3">
                    {currentTool.faqs.map((faq, idx) => {
                      const isExpanded = activeFaqIndices.includes(idx);
                      return (
                        <div key={idx} className="border border-neutral-200 rounded-lg bg-white overflow-hidden transition-all shadow-3xs">
                          <button
                            onClick={() => toggleFaq(idx)}
                            className="w-full text-left px-4 py-3 flex items-center justify-between text-xs font-semibold text-neutral-900 hover:bg-neutral-50"
                          >
                            <span>{faq.q}</span>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3.5 pt-1 text-xs text-neutral-500 leading-relaxed border-t border-neutral-100">
                              {faq.a}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>
            </section>

          </div>
        ) : (
          // DIRECTORY TOOL SELECTION GRID (Home path View with Split Hero)
          <div className="space-y-16" id="home_directory_view">
            
            {/* TWO-COLUMN SPLIT HERO SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center py-24 md:py-28 max-w-6xl mx-auto" id="split_hero_section">
              {/* Left Column: Typography & Action */}
              <div className="text-left space-y-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-neutral-200 rounded-full text-xs font-mono text-neutral-600 shadow-3xs">
                  <Compass size={12} className="text-neutral-500" /> Free Web PDF Engine
                </div>
                <h1 className="font-semibold text-4xl md:text-5xl tracking-tight text-neutral-900">
                  Your Complete PDF Workspace
                </h1>
                <p className="text-neutral-500 text-lg mt-4 max-w-md">
                  Powerful PDF tools designed to help you work faster, stay organized, and get more done.
                </p>
                <div>
                  <a
                    href="#tools_section"
                    onClick={handleScrollToTools}
                    className="border border-neutral-200 bg-white shadow-sm font-medium px-5 py-2.5 rounded-xl text-sm mt-6 inline-flex items-center gap-2 transition hover:bg-neutral-50 cursor-pointer"
                  >
                    View All Tools ↓
                  </a>
                </div>
              </div>

              {/* Right Column: Abstract Isometric Graphic Assets Panel */}
              <div className="relative w-full h-[360px] bg-neutral-50 rounded-[32px] border border-neutral-200/80 overflow-hidden flex items-center justify-center p-6 shadow-sm" id="workspace_isometric_visual_panel">
                {/* Light technical dots wallpaper in sandbox background */}
                <div className="absolute inset-0 opacity-[0.15]" style={{
                  backgroundImage: `radial-gradient(#000 1.5px, transparent 1.5px)`,
                  backgroundSize: '24px 24px'
                }} />
                
                {/* Floating soft blurred ambient backdrop */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-sky-100/40 rounded-full blur-3xl" />

                {/* Floating PDF Document Icon */}
                <div className="absolute left-10 top-10 w-28 h-36 bg-white rounded-2xl border border-neutral-200 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.15)] transform -rotate-[10deg] hover:-rotate-3 duration-300 transition-transform flex flex-col justify-between overflow-hidden z-20">
                  {/* Red header with fold */}
                  <div className="relative bg-[#EF4444] h-10 w-full flex-shrink-0">
                    {/* Folded corner */}
                    <div className="absolute top-0 right-0 w-6 h-6 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
                    <div className="absolute top-0 right-0 w-6 h-6 bg-[#C81E1E] shadow-sm" style={{ clipPath: 'polygon(0 0, 0 100%, 100% 100%)' }} />
                  </div>
                  {/* Inside document mock lines */}
                  <div className="p-4 flex-1 space-y-2 flex flex-col justify-center">
                    <div className="h-1.5 w-full bg-slate-200 rounded-full" />
                    <div className="h-1.5 w-11/12 bg-slate-200 rounded-full" />
                    <div className="h-1.5 w-5/6 bg-slate-200 rounded-full" />
                    <div className="h-1.5 w-4/6 bg-slate-200 rounded-full" />
                  </div>
                  {/* PDF banner at the bottom */}
                  <div className="bg-[#EF4444] text-white font-extrabold text-xs py-1 px-3 uppercase tracking-wider shrink-0 text-left">
                    PDF
                  </div>
                </div>

                {/* Primary window sheet */}
                <div className="relative w-[340px] h-[220px] bg-white/95 backdrop-blur-xs rounded-2xl border border-neutral-200 shadow-md transform -rotate-[1deg] hover:rotate-0 duration-500 transition-transform flex flex-col overflow-hidden z-10">
                  {/* Window Header */}
                  <div className="h-9 bg-white border-b border-black px-4 flex items-center justify-center shrink-0 select-none relative">
                    <span className="text-[11px] font-mono text-neutral-500">easy_document.pdf</span>
                  </div>

                  {/* Overlapping Badge Pill */}
                  <div className="absolute top-[32px] left-[55%] -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-1.5 py-1.5 px-4 bg-black text-white rounded-full text-[11px] font-bold shadow-md tracking-tight select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Instant PDF Processing
                  </div>

                  {/* Body Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between pt-8">
                    <div className="space-y-4">
                      {/* Badge and Ref */}
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-sky-100 text-sky-600 border border-sky-200/40 px-2 py-0.5 rounded-md">
                          ASY
                        </span>
                        <span className="text-[11px] text-neutral-400 font-semibold font-mono tracking-tight">
                          REF: #7249-X
                        </span>
                      </div>
                      
                      {/* Lines mock */}
                      <div className="space-y-2">
                        <div className="h-2.5 w-11/12 bg-neutral-100 rounded-full" />
                        <div className="h-2.5 w-2/3 bg-neutral-100 rounded-full" />
                      </div>
                    </div>

                    {/* Timeline slider representation */}
                    <div className="relative h-6 flex items-center mt-3">
                      <div className="absolute left-0 right-0 h-0.5 bg-black" />
                      <div className="absolute right-0 -translate-y-1/2 w-2 h-2 rounded-full bg-black" />
                    </div>
                  </div>
                </div>

                {/* Secondary accessory document layout */}
                <div className="absolute right-8 bottom-6 w-40 h-[110px] bg-white border border-neutral-200 rounded-xl shadow-lg transform rotate-[4deg] hover:rotate-0 duration-300 transition-transform p-4 flex flex-col justify-between z-20">
                  <div className="space-y-2">
                    <span className="text-[9px] font-bold text-neutral-400 tracking-wider block">PAGE 1</span>
                    <div className="h-1 w-full bg-neutral-100 rounded-full" />
                    <div className="h-1 w-5/6 bg-neutral-100 rounded-full" />
                  </div>
                  <div className="flex justify-between items-center text-[11px] shrink-0 font-bold">
                    <span className="text-emerald-600">Parsed</span>
                    <span className="text-emerald-600">✓</span>
                  </div>
                </div>

                {/* Interactive cursor pointer */}
                <div className="absolute top-[105px] left-[138px] z-30 transform -rotate-[15deg]">
                  <svg className="w-5 h-5 text-neutral-900 fill-current drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]" viewBox="0 0 24 24">
                    <path d="M4.5 3v15.2l3.8-3.8 3.1 7.2 2.6-1.1-3-7.1h5.8z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* INTERACTIVE WORKSPACE MATRIX */}
            <div id="tools_section" className="pt-8 scroll-mt-24 space-y-12">
              
              <div className="text-left space-y-3 mb-10 max-w-6xl mx-auto">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900">One Tool for Every PDF Need</h2>
                <p className="text-neutral-500 text-sm sm:text-base max-w-2xl">
                  Fast, secure, and reliable tools to edit, convert, and manage your documents in one click.
                </p>
              </div>

              {/* HIGH PERFORMANCE TOOLS - SEPARATED & HIGHLIGHTED */}
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex items-center gap-3">
                  <span className="h-px bg-neutral-200 flex-1" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 font-mono">
                    High Performance Essentials
                  </span>
                  <span className="h-px bg-neutral-200 flex-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {TOOLS.slice(0, 4).map((item) => {
                    const colors = getToolColorStyles(item.slug);
                    return (
                      <button
                        key={item.slug}
                        onClick={() => navigateToSlug(item.slug)}
                        className="group relative flex flex-col justify-between h-[230px] p-6 rounded-2xl bg-white border border-neutral-300/70 shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-neutral-900 hover:shadow-md cursor-pointer text-left"
                        id={`tool_card_${item.slug}`}
                      >
                        <div className="w-full">
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 border ${colors.bg}`}>
                            {item.slug === "merge-pdf" && <Layers size={24} />}
                            {item.slug === "split-pdf" && <Scissors size={24} />}
                            {item.slug === "jpg-to-pdf" && <FileImage size={24} />}
                            {item.slug === "pdf-to-jpg" && <FileText size={24} />}
                            {item.slug === "compress-pdf" && <Minimize2 size={24} />}
                          </div>

                          <h3 className="text-base font-bold text-neutral-900 flex items-center justify-between tracking-tight group-hover:text-black transition-colors leading-snug">
                            {item.name}
                          </h3>
                          <p className="text-[13px] text-neutral-500 leading-relaxed mt-1.5 line-clamp-2">
                            {item.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-5 w-full">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 group-hover:text-neutral-900 transition-colors font-mono">
                            Launch Tool
                          </span>
                          <ChevronRight size={16} className="text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all duration-300" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ADDITIONAL TOOLS */}
              <div className="space-y-6 max-w-6xl mx-auto pt-4">
                <div className="flex items-center gap-3">
                  <span className="h-px bg-neutral-200 flex-1" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 font-mono">
                    Additional Utilities
                  </span>
                  <span className="h-px bg-neutral-200 flex-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {TOOLS.slice(4).map((item) => {
                    const colors = getToolColorStyles(item.slug);
                    return (
                      <button
                        key={item.slug}
                        onClick={() => navigateToSlug(item.slug)}
                        className="group relative flex flex-col justify-between h-[230px] p-6 rounded-2xl bg-white border border-neutral-200/60 shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-neutral-900 hover:shadow-md cursor-pointer text-left"
                        id={`tool_card_${item.slug}`}
                      >
                        <div className="w-full">
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 border ${colors.bg}`}>
                            {item.slug === "merge-pdf" && <Layers size={24} />}
                            {item.slug === "split-pdf" && <Scissors size={24} />}
                            {item.slug === "jpg-to-pdf" && <FileImage size={24} />}
                            {item.slug === "pdf-to-jpg" && <FileText size={24} />}
                            {item.slug === "compress-pdf" && <Minimize2 size={24} />}
                            {item.slug === "pdf-to-word" && <FileText size={24} />}
                            {item.slug === "word-to-pdf" && <FileText size={24} />}
                            {item.slug === "delete-pdf-pages" && <Trash2 size={24} />}
                            {item.slug === "edit-pdf" && <PenTool size={24} />}
                            {item.slug === "rotate-pdf" && <RotateCw size={24} />}
                            {item.slug === "unlock-pdf" && <Lock size={24} />}
                            {item.slug === "protect-pdf" && <Shield size={24} />}
                            {item.slug === "sign-pdf" && <FileSignature size={24} />}
                          </div>

                          <h3 className="text-base font-bold text-neutral-900 flex items-center justify-between tracking-tight group-hover:text-black transition-colors leading-snug">
                            {item.name}
                          </h3>
                          <p className="text-[13px] text-neutral-500 leading-relaxed mt-1.5 line-clamp-2">
                            {item.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-5 w-full">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 group-hover:text-neutral-900 transition-colors font-mono">
                            Launch Tool
                          </span>
                          <ChevronRight size={16} className="text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all duration-300" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* BRAND PREMIUM CALLOUT BANNER SECTION */}
            <section className="border-t border-neutral-200/60 pt-16 max-w-6xl mx-auto w-full" id="premium_brand_callout_section">
              <div className="bg-gradient-to-br from-slate-50 via-neutral-50 to-slate-100 border border-neutral-200/80 shadow-md rounded-[32px] p-8 sm:p-12 md:p-16 flex flex-col lg:flex-row items-center justify-between gap-12 relative overflow-hidden">
                {/* Visual subtle accents */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-200/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-200/10 rounded-full blur-2xl pointer-events-none" />

                {/* Left Side: Content & Action */}
                <div className="flex-1 text-left space-y-6 max-w-xl">
                  <span className="text-xs font-mono uppercase tracking-widest text-neutral-400 font-bold block">
                    A Brief History of the Layout
                  </span>
                  
                  <div className="space-y-3">
                    <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 leading-tight">
                      Intact Across Every Screen
                    </h3>
                    <p className="text-xs sm:text-[13px] font-semibold text-neutral-500 uppercase tracking-wider font-mono">
                      How the Portable Document Format became a quiet bridge between billions of devices.
                    </p>
                  </div>

                  <p className="text-neutral-600 text-[13px] sm:text-sm leading-relaxed">
                    First launched in 1993, the PDF was created to preserve fonts, vector layouts, and formatting exactly as intended—no matter the software or device. It became the universal standard for contracts, records, and templates. Unlock unlimited access to this format's full potential.
                  </p>

                  <div className="pt-2">
                    <button
                      onClick={() => setIsPaywallOpen(true)}
                      className="bg-neutral-950 hover:bg-black text-white font-bold text-sm tracking-wide py-3.5 px-16 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg cursor-pointer text-center w-64 inline-flex items-center justify-center gap-2"
                    >
                      Unlock Pro
                    </button>
                  </div>
                </div>

                {/* Right Side: Multi-layered Storyboard Parallax Illustration */}
                <div className="w-full lg:w-[400px] shrink-0 flex items-center justify-center relative h-[320px] group/illustration select-none">
                  {/* Layer 1: Background decorative glowing circles */}
                  <div className="absolute w-72 h-72 bg-gradient-to-tr from-sky-200/40 to-indigo-200/30 rounded-full blur-2xl pointer-events-none transform transition-all duration-700 ease-out group-hover:scale-110 group-hover:translate-x-2 group-hover:-translate-y-2" />
                  <div className="absolute w-48 h-48 bg-gradient-to-bl from-violet-200/20 to-emerald-200/30 rounded-full blur-xl pointer-events-none transform transition-all duration-700 ease-out group-hover:scale-125 group-hover:-translate-x-4 group-hover:translate-y-4" />

                  {/* Layer 2: Character illustration (The main storyboard image) */}
                  <div className="relative rounded-2xl overflow-hidden border border-neutral-200/60 shadow-lg bg-white p-2 w-[340px] transform transition-all duration-700 ease-out group-hover/illustration:-translate-y-1 group-hover/illustration:scale-[1.01] group-hover/illustration:rotate-[1deg] group-hover/illustration:shadow-xl">
                    <img 
                      src="/premium_illustration_indian.png" 
                      alt="Student studying with PDF Easy" 
                      className="w-full h-auto rounded-xl object-contain"
                    />
                  </div>

                  {/* Layer 3: Floating Document conversion flow tree (parallax layer) */}
                  <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md border border-neutral-200/80 p-4 rounded-xl shadow-lg w-[190px] transform transition-all duration-700 ease-out -rotate-[3deg] group-hover/illustration:-translate-y-4 group-hover/illustration:-translate-x-2 group-hover/illustration:rotate-[2deg] group-hover/illustration:shadow-xl pointer-events-none">
                    <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-neutral-100">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono">Conversion Tree</span>
                    </div>
                    <div className="space-y-1.5 text-[11px] font-medium text-neutral-600">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">📎 document.docx</span>
                        <span className="text-emerald-500 font-bold">✓</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">🖼️ raw_image.jpg</span>
                        <span className="text-emerald-500 font-bold">✓</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-neutral-200 font-bold text-neutral-900">
                        <span className="truncate">📄 bundled.pdf</span>
                        <span className="text-emerald-600">Generated</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* MINIMALIST SOCIAL PROOF / TRUST GRID SECTION */}
            <section className="border-t border-neutral-200/60 pt-16 max-w-6xl mx-auto" id="social_proof_trust_section">
              <div className="text-center max-w-xl mx-auto mb-12">
                <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase block mb-2">User Testimonials</span>
                <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">What Our Users Say</h3>
                <p className="text-sm text-neutral-500 mt-2">Discover why people around the globe choose PDF Easy daily.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {/* Comment Box 1 */}
                <div className="glass-panel border border-neutral-200/65 bg-white rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs hover:border-neutral-300 transition-all duration-300">
                  <p className="text-xs text-neutral-600 leading-relaxed italic">
                    "PDF Easy works flawlessly. Choosing to merge and rotate directly in seconds is an incredible upgrade that means zero hassle."
                  </p>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-100">
                    <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                      AS
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">Abhishek Sharma</h4>
                      <p className="text-[10px] text-neutral-400">Independent Engineer, Bengaluru</p>
                    </div>
                  </div>
                </div>

                {/* Comment Box 2 */}
                <div className="glass-panel border border-neutral-200/65 bg-white rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs hover:border-neutral-300 transition-all duration-300">
                  <p className="text-xs text-neutral-600 leading-relaxed italic">
                    "I build presentation materials and contract proposals daily. Having a clean system with beautiful output is my absolute top priority."
                  </p>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-100">
                    <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs">
                      DP
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">Deepa Patel</h4>
                      <p className="text-[10px] text-neutral-400">Interaction Designer</p>
                    </div>
                  </div>
                </div>

                {/* Comment Box 3 */}
                <div className="glass-panel border border-neutral-200/65 bg-white rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs hover:border-neutral-300 transition-all duration-300">
                  <p className="text-xs text-neutral-600 leading-relaxed italic">
                    "The processing speed is unbeatable compared to old heavy enterprise processors. Incredible developer utility that strictly respects modern standards."
                  </p>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-100">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                      KN
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">Karthik Nair</h4>
                      <p className="text-[10px] text-neutral-400">SaaS Founder & Creator</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}

      </main>

      {/* 3. UNIVERSAL BOTTOM LANDING FOOTER - EASY SLEEK MINIMALIST */}
      <footer className="bg-white border-t border-neutral-100 py-8 px-8 sm:px-12 mt-12" id="universal_footer_desk">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-black rounded flex items-center justify-center text-white font-bold text-sm">
              P
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="font-bold text-sm tracking-tight text-neutral-900">PDF Easy</span>
              <span className="hidden sm:inline text-neutral-300">|</span>
              <span className="text-xs text-neutral-400">© 2026 PDFKit India. Built for modern remote workflows.</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500 font-medium">
            <button onClick={() => navigateToSlug("")} className="hover:text-black transition-colors cursor-pointer">All Tools</button>
            <button onClick={() => navigateToSlug("merge-pdf")} className="hover:text-black transition-colors cursor-pointer">Merge</button>
            <button onClick={() => navigateToSlug("split-pdf")} className="hover:text-black transition-colors cursor-pointer">Split</button>
            <button onClick={() => navigateToSlug("compress-pdf")} className="hover:text-black transition-colors cursor-pointer">Compress</button>
            <button onClick={() => navigateToSlug("protect-pdf")} className="hover:text-black transition-colors cursor-pointer">Protect</button>
            <button 
              onClick={() => setIsPaywallOpen(true)} 
              className="bg-black hover:bg-neutral-800 text-white font-bold px-4 py-2 rounded-lg text-sm transition duration-200 cursor-pointer select-none"
            >
              Unlock Pro
            </button>
          </div>
        </div>
      </footer>

      {/* RAZORPAY BILLING AND PAYWALL GATEWAY MODAL */}
      <PaywallModal 
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        onPaymentSuccess={handlePaymentSuccessUnlock}
        usageLimitReached={usageCount >= 3}
        currentUserEmail={currentUserEmail}
        planExpiresAt={planExpiresAt}
        onUserSignedIn={(email) => {
          setCurrentUserEmail(email);
          localStorage.setItem("user_email", email);
        }}
      />

    </div>
  );
}
