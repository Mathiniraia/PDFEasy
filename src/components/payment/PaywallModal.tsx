/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  X, Check, Sparkles, ShieldCheck, Loader2,
  Lock, Info, RefreshCw, Mail, Eye, EyeOff,
  Clock, Calendar, Zap, Chrome
} from "lucide-react";
import { PaymentPlan } from "../../types";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (planId: string) => void;
  usageLimitReached: boolean;
  currentUserEmail: string | null;
  planExpiresAt: number | null;  // ms timestamp — null if no active plan
  onUserSignedIn: (email: string) => void;
}

const PLANS: PaymentPlan[] = [
  {
    id: "daily",
    name: "Daily Pass",
    price: 29,
    originalPrice: 116,
    period: "24-Hour Access",
    description: "Unlimited access to all PDF tools for 24 hours.",
    benefits: [
      "All 12 PDF tools — no limits",
      "Files up to 100MB per document",
      "Instant secure download",
      "High-speed processing",
    ]
  },
  {
    id: "weekly",
    name: "Weekly Pass",
    price: 99,
    originalPrice: 399,
    period: "7-Day Access",
    popular: true,
    description: "Full access for 7 days — ideal for project workflows.",
    benefits: [
      "Everything in Daily Pass",
      "7 continuous days of access",
      "Priority cloud processing",
      "Mobile + desktop ready",
    ]
  },
  {
    id: "monthly",
    name: "Monthly Pro",
    price: 299,
    originalPrice: 1199,
    period: "30-Day Access",
    description: "Best value — 30 days of complete toolkit access.",
    benefits: [
      "Everything in Weekly Pass",
      "30 days unrestricted access",
      "Batch processing support",
      "Premium priority support",
    ]
  },
];

type ModalStep = "plans" | "signin" | "email-signin" | "checkout" | "success";

function formatExpiry(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  if (diff <= 0) return "Expired";
  const hours   = Math.floor(diff / (1000 * 60 * 60));
  const days    = Math.floor(hours / 24);
  const remHrs  = hours % 24;
  if (days >= 1) return `${days}d ${remHrs}h remaining`;
  const mins = Math.floor(diff / (1000 * 60));
  if (mins >= 60) return `${hours}h ${Math.floor(mins % 60)}m remaining`;
  return `${mins} minutes remaining`;
}

export default function PaywallModal({
  isOpen,
  onClose,
  onPaymentSuccess,
  usageLimitReached,
  currentUserEmail,
  planExpiresAt,
  onUserSignedIn,
}: PaywallModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan>(PLANS[1]);
  const [step, setStep] = useState<ModalStep>("plans");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Email sign-in fields
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  // Sandbox
  const [showSandboxUI, setShowSandboxUI] = useState(false);
  const [sandboxOrderDetails, setSandboxOrderDetails] = useState<any>(null);
  const [upiId, setUpiId] = useState("user@okaxis");
  const [payingSandbox, setPayingSandbox] = useState(false);

  // Success info
  const [successExpiry, setSuccessExpiry] = useState<number | null>(null);
  const [successPlanName, setSuccessPlanName] = useState("");
  const [shaking, setShaking] = useState(false);

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      triggerShake();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStep("plans");
      setErrorMessage("");
      setShowSandboxUI(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  if (!isOpen) return null;

  // ─── Google Sign-In ─────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || "";
      onUserSignedIn(email);
      setStep("checkout");
    } catch (err: any) {
      setErrorMessage("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Email Sign-In / Sign-Up ─────────────────────────────────────────────
  const handleEmailAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    if (!emailInput.includes("@")) { setErrorMessage("Enter a valid email address."); return; }
    if (passwordInput.length < 6)  { setErrorMessage("Password must be at least 6 characters."); return; }
    // Simple local auth (no password server check — matches existing app pattern)
    localStorage.setItem("user_email", emailInput);
    onUserSignedIn(emailInput);
    setStep("checkout");
  };

  // ─── Checkout ────────────────────────────────────────────────────────────
  const handleCheckoutInitiation = async () => {
    if (!currentUserEmail) {
      setStep("signin");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    setShowSandboxUI(false);

    try {
      const res = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedPlan.price, planId: selectedPlan.id }),
      });

      if (!res.ok) throw new Error("Unable to create payment order.");
      const orderData = await res.json();

      if (orderData.isDemo) {
        setSandboxOrderDetails(orderData);
        setShowSandboxUI(true);
        setLoading(false);
        return;
      }

      const RazorpaySDK = (window as any).Razorpay;
      if (!RazorpaySDK) throw new Error("Razorpay failed to load. Check your connection.");

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: "INR",
        name: "PDF Easy",
        description: `${selectedPlan.name} — ${selectedPlan.period}`,
        order_id: orderData.id,
        handler: async (response: any) => {
          setLoading(true);
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: orderData.id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                isDemo: false,
              }),
            });
            const verification = await verifyRes.json();
            if (verification.success) {
              await triggerPaymentSuccess();
            } else {
              setErrorMessage("Payment verification failed. Contact support.");
            }
          } catch { setErrorMessage("Payment confirmation error."); }
          finally { setLoading(false); }
        },
        prefill: {
          name: currentUserEmail?.split("@")[0] || "Guest",
          email: currentUserEmail || "guest@example.com",
        },
        theme: { color: "#0a0a0a" },
      };

      const pw = new RazorpaySDK(options);
      pw.open();
      setLoading(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  const triggerPaymentSuccess = async () => {
    // Hit unlock endpoint with planId so server stores the correct duration
    const email = currentUserEmail || localStorage.getItem("user_email") || "";
    let expiresAt: number | null = null;
    let planLabel = selectedPlan.name;

    try {
      const res = await fetch("/api/usage/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, planId: selectedPlan.id }),
      });
      const data = await res.json();
      expiresAt = data.planExpiresAt ?? null;
      planLabel = data.planName ?? planLabel;
    } catch { /* best-effort */ }

    setSuccessExpiry(expiresAt);
    setSuccessPlanName(planLabel);
    setStep("success");

    setTimeout(() => {
      onPaymentSuccess(selectedPlan.id);
    }, 3000);
  };

  const executeSandboxMockPayment = () => {
    setPayingSandbox(true);
    setTimeout(async () => {
      setPayingSandbox(false);
      await triggerPaymentSuccess();
    }, 1500);
  };

  // ─── PLAN ICON ───────────────────────────────────────────────────────────
  const PlanIcon = ({ id }: { id: string }) => {
    if (id === "daily")   return <Zap size={16} className="text-amber-500" />;
    if (id === "weekly")  return <Calendar size={16} className="text-blue-500" />;
    return <Clock size={16} className="text-emerald-500" />;
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      id="paywall_modal_overlay"
      onClick={handleOverlayClick}
    >
      <div 
        role="dialog"
        aria-modal="true"
        className={`bg-white rounded-2xl border border-neutral-200 shadow-2xl overflow-hidden transition-all duration-300 ${
          shaking ? "animate-shake" : ""
        } ${step === "plans" ? "max-w-xl" : "max-w-md"} w-full`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── SUCCESS SCREEN / UNLOCK ANIMATION ──────────────────────────── */}
        {step === "success" ? (
          <div className="p-8 text-center py-12 animate-unlock-bounce" id="payment_success_overlay">
            <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              {/* Outer pulse rings */}
              <div className="absolute inset-0 rounded-full bg-emerald-100/50 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-emerald-100" />
              <div className="relative w-14 h-14 rounded-full bg-emerald-500 border border-emerald-400 text-white flex items-center justify-center shadow-lg">
                <ShieldCheck size={32} className="animate-pulse" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-neutral-900 mb-2">Workspace Unlocked!</h2>
            <p className="text-sm text-neutral-500 mb-5">{successPlanName} is now active.</p>
            {successExpiry && (
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 rounded-full px-4.5 py-2 mb-4">
                <Clock size={13} />
                Access until {new Date(successExpiry).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-400 mt-2 font-mono">
              <RefreshCw size={12} className="animate-spin" /> Unlocking premium features…
            </div>
          </div>

        /* ── SIGN-IN STEP ─────────────────────────────────────────────────── */
        ) : step === "signin" ? (
          <div id="signin_paywall_panel">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-neutral-100">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Sign in to continue</h2>
                <p className="text-xs text-neutral-400 mt-0.5">One-time sign-in to activate your plan</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black transition" id="close_signin_btn">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {errorMessage && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center gap-2">
                  <Info size={13} className="shrink-0" /> {errorMessage}
                </div>
              )}

              {/* Google Sign-In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition text-sm font-semibold text-neutral-800 disabled:opacity-50 cursor-pointer"
                id="google_signin_btn"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615Z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5832-5.036-3.7105H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18Z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.6818 9c0-.5955.1023-1.1732.2823-1.71V4.9582H.9574A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71Z" fill="#FBBC05"/>
                    <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795Z" fill="#EA4335"/>
                  </svg>
                )}
                Continue with Google
              </button>

              <div className="flex items-center gap-3">
                <hr className="flex-1 border-neutral-200" />
                <span className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">or</span>
                <hr className="flex-1 border-neutral-200" />
              </div>

              {/* Email Sign-In */}
              <button
                onClick={() => setStep("email-signin")}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition text-sm font-semibold text-neutral-800 cursor-pointer"
                id="email_signin_btn"
              >
                <Mail size={16} className="text-neutral-500" />
                Continue with Email
              </button>

              <button
                type="button"
                onClick={() => setStep("plans")}
                className="w-full text-xs text-neutral-500 hover:text-neutral-800 transition text-center pt-2 font-medium"
              >
                ← Back to plan selection
              </button>
            </div>
          </div>

        /* ── EMAIL AUTH STEP ──────────────────────────────────────────────── */
        ) : step === "email-signin" ? (
          <div id="email_auth_panel">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-neutral-100">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  {authMode === "signin" ? "Sign in" : "Create account"}
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">Enter your email to continue</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black transition">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEmailAuth} className="px-6 py-5 space-y-3">
              {errorMessage && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center gap-2">
                  <Info size={13} className="shrink-0" /> {errorMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full text-sm border border-neutral-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-neutral-800 focus:ring-2 focus:ring-neutral-100 transition-all"
                  id="email_auth_input"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-sm border border-neutral-200 rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:border-neutral-800 focus:ring-2 focus:ring-neutral-100 transition-all"
                    id="password_auth_input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-black transition shadow-sm cursor-pointer"
                id="email_auth_submit_btn"
              >
                {authMode === "signin" ? "Sign In" : "Create Account"}
              </button>

              <p className="text-xs text-neutral-500 text-center">
                {authMode === "signin" ? "New user?" : "Already have an account?"}
                {" "}
                <button
                  type="button"
                  onClick={() => setAuthMode(m => m === "signin" ? "signup" : "signin")}
                  className="text-neutral-900 font-semibold hover:underline"
                >
                  {authMode === "signin" ? "Create account" : "Sign in"}
                </button>
              </p>

              <button
                type="button"
                onClick={() => setStep("signin")}
                className="w-full text-xs text-neutral-400 hover:text-neutral-600 transition text-center"
              >
                ← Back to sign-in options
              </button>
            </form>
          </div>

        /* ── CHECKOUT STEP (AMOUNT & RAZORPAY / MOCK UPI QR) ───────────────── */
        ) : step === "checkout" ? (
          <div id="checkout_paywall_panel" className="p-6 md:p-8">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900">Complete Payment</h2>
                {currentUserEmail && (
                  <p className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-[240px]">
                    Pay to account: <span className="font-semibold text-neutral-700">{currentUserEmail}</span>
                  </p>
                )}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black transition" id="close_paywall_modal_btn">
                <X size={16} />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 text-xs bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center gap-2">
                <Info size={13} className="shrink-0" /> {errorMessage}
              </div>
            )}

            {!showSandboxUI ? (
              <div className="space-y-4">
                <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4">
                  <span className="text-[9px] font-bold text-neutral-400 tracking-wider uppercase block mb-1">Your Selection</span>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlanIcon id={selectedPlan.id} />
                      <span className="text-sm font-bold text-neutral-900">{selectedPlan.name}</span>
                    </div>
                    <span className="text-lg font-black text-neutral-950 font-mono">₹{selectedPlan.price}</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1.5">{selectedPlan.description}</p>
                </div>

                <button
                  onClick={handleCheckoutInitiation}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-black disabled:bg-neutral-400 transition shadow-sm cursor-pointer"
                  id="checkout_secure_btn"
                >
                  {loading ? (
                    <><Loader2 size={15} className="animate-spin" /> Fetching Payment Details…</>
                  ) : (
                    <>Pay ₹{selectedPlan.price} securely →</>
                  )}
                </button>
                
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-neutral-400 font-mono">
                  <span>🔒 SSL Secure Gateway Connection</span>
                </div>

                <button
                  type="button"
                  onClick={() => setStep("plans")}
                  className="w-full text-xs text-neutral-500 hover:text-neutral-800 transition text-center font-medium"
                >
                  ← Change Plan
                </button>
              </div>
            ) : (
              // Simulator / Sandbox Mode containing mock QR codes
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10.5px] text-amber-800 font-medium">
                  <span className="font-bold flex items-center gap-1 mb-0.5">
                    <Info size={12} className="text-amber-600" /> Sandbox Demo Mode Active
                  </span>
                  Razorpay environment variables are not set. Test the full flow using the payment simulator below.
                </div>

                <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-neutral-900 p-2.5 text-center text-[10px] text-neutral-400 font-bold font-mono tracking-wider">
                    SECURE MOCK BILLING DESK
                  </div>
                  <div className="p-4 bg-white space-y-4">
                    <div className="text-center">
                      <span className="text-[10px] text-neutral-400 block uppercase font-mono tracking-wide">Amount Payable</span>
                      <span className="text-2xl font-black text-neutral-900 font-mono">₹{selectedPlan.price}.00</span>
                    </div>

                    {/* Mock UPI QR */}
                    <div className="bg-neutral-50 p-3 border border-neutral-100 rounded-lg flex flex-col items-center justify-center">
                      <div className="w-28 h-28 border border-neutral-300 p-2 bg-white rounded-lg flex flex-col items-center justify-center relative shadow-xs">
                        <div className="grid grid-cols-4 gap-2 opacity-75">
                          {Array.from({ length: 16 }).map((_, i) => (
                            <div key={i} className={`w-3.5 h-3.5 bg-neutral-900 rounded-xs ${i % 3 === 0 ? "" : "opacity-30"}`} />
                          ))}
                        </div>
                        <div className="absolute inset-0 m-auto w-8 h-8 bg-white border border-neutral-200 flex items-center justify-center text-[9px] font-extrabold rounded shadow-sm text-neutral-800">
                          UPI
                        </div>
                      </div>
                      <span className="text-[9px] text-neutral-400 font-mono tracking-wider mt-2">SCAN MOCK UPI QR CODE</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-500 block uppercase tracking-wide">VPA ID / UPI address:</label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full text-xs font-mono border border-neutral-200 rounded-lg p-2 bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-neutral-400 transition"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={executeSandboxMockPayment}
                  disabled={payingSandbox}
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-neutral-900 bg-amber-200 hover:bg-amber-300 border border-amber-400 rounded-xl py-3.5 transition shadow-sm cursor-pointer"
                  id="sandbox_pay_submit_btn"
                >
                  {payingSandbox ? (
                    <><Loader2 size={14} className="animate-spin" /> Simulating payment verification…</>
                  ) : "Simulate UPI Payment ✓"}
                </button>

                <button
                  type="button"
                  onClick={() => setStep("plans")}
                  className="w-full text-xs text-neutral-500 hover:text-neutral-800 transition text-center font-medium"
                >
                  ← Go Back
                </button>
              </div>
            )}
          </div>

        /* ── PLANS STEP (FIRST SCREEN PAY PAY pay) ───────────────────────── */
        ) : (
          <div id="plans_paywall_panel" className="p-6 md:p-8 flex flex-col">
            <div className="mb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] bg-neutral-100 text-neutral-800 font-mono font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border border-neutral-200">
                    <Sparkles size={11} className="text-amber-500" /> Premium Workspace
                  </span>
                  {usageLimitReached && (
                    <span className="text-[9px] bg-red-50 text-red-700 border border-red-100 font-bold rounded-full px-2.5 py-0.5 animate-pulse">
                      Limit Reached (3/3 Free)
                    </span>
                  )}
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black transition" id="close_paywall_modal_btn">
                  <X size={16} />
                </button>
              </div>

              <h2 className="text-xl font-extrabold text-neutral-900 mt-4 tracking-tight leading-tight">
                {planExpiresAt && planExpiresAt < Date.now()
                  ? "Your Premium Access Has Expired"
                  : "Choose Your Premium Plan"}
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                Unlock continuous, high-speed access to all 12 PDF workspace utility tools.
              </p>
            </div>

            {/* Plan Card Options */}
            <div className="space-y-3 mb-6">
              {PLANS.map((plan) => {
                const isSelected = selectedPlan.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    onClick={() => { setSelectedPlan(plan); setShowSandboxUI(false); }}
                    className={`w-full p-4 rounded-xl text-left flex items-center justify-between transition-all duration-150 border-2 ${
                      isSelected
                        ? "bg-white border-neutral-900 shadow-md ring-1 ring-neutral-900"
                        : "bg-white/50 border-neutral-200 hover:border-neutral-300 hover:bg-white"
                    } cursor-pointer`}
                    id={`plan_tile_${plan.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Radio dot */}
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected ? "border-neutral-900 bg-neutral-900" : "border-neutral-300"
                      }`}>
                        {isSelected && <span className="block w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <PlanIcon id={plan.id} />
                          <span className="font-extrabold text-sm text-neutral-900">{plan.name}</span>
                          {plan.popular && (
                            <span className="text-[9px] bg-neutral-950 text-white font-mono uppercase font-bold tracking-wide px-1.5 py-0.5 rounded">
                              Popular
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-400 mt-0.5 block">{plan.period}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <span className="text-[10px] text-neutral-400 line-through block">₹{plan.originalPrice}</span>
                      <span className="text-xl font-black text-neutral-900 font-mono">₹{plan.price}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selection details */}
            <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4.5 mb-5 text-left">
              <span className="text-[9px] font-bold text-neutral-400 tracking-wider uppercase block mb-1">Benefits Included</span>
              <ul className="grid grid-cols-2 gap-2 text-[11px] text-neutral-600">
                {selectedPlan.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <Check size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="truncate">{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Continue button */}
            <button
              onClick={() => {
                if (currentUserEmail) {
                  setStep("checkout");
                } else {
                  setStep("signin");
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-black transition shadow-md cursor-pointer"
              id="plans_continue_btn"
            >
              {currentUserEmail ? "Proceed to Checkout →" : "Continue to Sign Up →"}
            </button>

            <div className="mt-4 text-center text-[9.5px] text-neutral-400 font-mono">
              🛡️ Safe payments via Razorpay Gateway standard encryption.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
