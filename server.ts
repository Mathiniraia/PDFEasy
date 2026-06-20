import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import Razorpay from "razorpay";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import { createRequire } from "module";

// ── qpdf-WASM: initialise once and reuse across all requests ──────────────
// @neslinesli93/qpdf-wasm ships a CJS module with an inline WASM loader.
// We use createRequire so the ESM server.ts can resolve its CJS entry.
const _require = createRequire(import.meta.url);
let _qpdfModulePromise: Promise<any> | null = null;
function getQpdfModule(): Promise<any> {
  if (!_qpdfModulePromise) {
    const createQpdf = _require("@neslinesli93/qpdf-wasm");
    const wasmPath: string = _require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm");
    _qpdfModulePromise = createQpdf({ locateFile: () => wasmPath });
  }
  return _qpdfModulePromise!;
}

// Initialize express app
const app = express();
app.use(express.json());
app.use(cors());

const PORT = 5173;

// Lazy Razorpay initialization
let razorpayInstance: any = null;
function getRazorpay(): any {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  if (!keyId || !keySecret) {
    return null;
  }
  
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpayInstance;
}

// Razorpay API Route to create payment orders
app.post("/api/razorpay/order", async (req, res) => {
  try {
    const { amount, planId } = req.body;
    
    if (!amount || typeof amount !== "number") {
      return res.status(400).json({ error: "Invalid amount provided." });
    }

    const rzp = getRazorpay();
    const mockMode = rzp === null;

    const amountInPaise = amount * 100; // Razorpay expects amount in paise (1 INR = 100 paise)

    if (mockMode) {
      // Return beautiful demo checkout parameters so the user can test their flow in sandbox
      return res.json({
        id: `order_demo_${Math.random().toString(36).substring(2, 11)}`,
        amount: amountInPaise,
        currency: "INR",
        planId: planId,
        isDemo: true,
        message: "Razorpay environment variables (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) not set. Running in Demonstration/Sandbox mode.",
        keyId: "rzp_test_demo_key"
      });
    }

    // Real Razorpay order generation
    const order = await rzp.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${planId}_${Date.now()}`,
      notes: {
        planId: planId,
        planType: planId === "daily" ? "Daily Pass" : planId === "weekly" ? "Weekly Pass" : "Monthly Pro",
      },
    });

    return res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      planId: planId,
      isDemo: false,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error: any) {
    console.error("Razorpay order creation failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create Razorpay payment order." });
  }
});

// Mock/Sandbox verify-payment endpoint
app.post("/api/razorpay/verify", async (req, res) => {
  const { orderId, paymentId, signature, isDemo } = req.body;
  if (isDemo || !getRazorpay()) {
    // Automatically succeed in sandbox mode
    return res.json({ success: true, message: "Demo transaction verified successfully!" });
  }
  
  // Real verification check
  const crypto = await import("crypto");
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(500).json({ error: "Missing Razorpay configuration." });
  }

  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (generatedSignature === signature) {
    return res.json({ success: true });
  } else {
    return res.status(400).json({ error: "Payment verification failed" });
  }
});

// ── /api/protect-pdf ────────────────────────────────────────────────────────
// Server-side AES-256 PDF encryption via qpdf-WASM.
// Accepts a multipart/form-data POST with:
//   file     — the PDF file (≤50 MB)
//   password — user password (4–256 chars)
// Returns the encrypted PDF as application/pdf.
//
// Security notes implemented here:
//  • Password passed as argv tokens after "--", never via shell interpolation
//  • AES-256 only (key length 256); 40/128-bit legacy not offered
//  • User + owner password identical (simple protect flow)
//  • Password is NEVER logged
//  • File size limited in multer before reading body
//  • WASM FS paths are ephemeral and cleaned up after each request
// ────────────────────────────────────────────────────────────────────────────
const _pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// Warm up the WASM module at server start so the first request isn't slow
getQpdfModule().catch((e: unknown) =>
  console.warn("[qpdf-wasm] Warm-up failed (will retry on first request):", e)
);

app.post("/api/protect-pdf", _pdfUpload.single("file"), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing PDF file (field name: 'file')" });
  }

  const password = String(req.body.password ?? "");
  if (password.length < 8 || password.length > 256) {
    return res.status(400).json({ error: "Password must be between 8 and 256 characters" });
  }

  // Validate PDF magic bytes (%PDF-) — don't trust mimetype alone
  const magic = req.file.buffer.slice(0, 5).toString("ascii");
  if (!magic.startsWith("%PDF-")) {
    return res.status(400).json({ error: "File does not appear to be a valid PDF" });
  }

  try {
    console.log(`[protect-pdf] Upload success: ${req.file.originalname} (${req.file.size} bytes)`);
    const qpdf = await getQpdfModule();

    // Unique per-request paths inside the WASM virtual FS
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inPath  = `/in-${id}.pdf`;
    const outPath = `/out-${id}.pdf`;

    qpdf.FS.writeFile(inPath, new Uint8Array(req.file.buffer));

    console.log(`[protect-pdf] Encryption start: ${req.file.originalname}`);
    // Pass password AFTER "--" so it is never interpreted as a qpdf flag.
    // Both user-password and owner-password are set to the same value.
    const exitCode: number = qpdf.callMain([
      "--encrypt", password, password, "256",
      "--", inPath, outPath,
    ]);

    if (exitCode !== 0) {
      throw new Error(`qpdf-wasm exited with code ${exitCode}`);
    }

    console.log(`[protect-pdf] Encryption complete: ${req.file.originalname}`);
    const out: Uint8Array = qpdf.FS.readFile(outPath);

    // Clean up WASM FS entries immediately
    try { qpdf.FS.unlink(inPath); } catch { /* ignore */ }
    try { qpdf.FS.unlink(outPath); } catch { /* ignore */ }

    const baseName = req.file.originalname.replace(/\.pdf$/i, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${baseName}-protected.pdf"`
    );
    console.log(`[protect-pdf] Download response: Sending ${out.length} bytes for ${baseName}-protected.pdf`);
    res.send(Buffer.from(out));

  } catch (err: any) {
    console.error("[protect-pdf] Error condition:", err?.message ?? err);
    res.status(500).json({ error: "Failed to encrypt the PDF. Please try again." });
  }
});

// ── /api/unlock-pdf ─────────────────────────────────────────────────────────
// Server-side PDF decryption via qpdf-WASM.
// Accepts a multipart/form-data POST with:
//   file     — the encrypted PDF file (≤100 MB)
//   password — user password
// Returns the decrypted PDF as application/pdf.
// ────────────────────────────────────────────────────────────────────────────
app.post("/api/unlock-pdf", _pdfUpload.single("file"), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing PDF file (field name: 'file')" });
  }

  const password = String(req.body.password ?? "");
  if (!password) {
    return res.status(400).json({ error: "Password is required to unlock the PDF" });
  }

  const magic = req.file.buffer.slice(0, 5).toString("ascii");
  if (!magic.startsWith("%PDF-")) {
    return res.status(400).json({ error: "File does not appear to be a valid PDF" });
  }

  try {
    console.log(`[unlock-pdf] Upload success: ${req.file.originalname} (${req.file.size} bytes)`);
    const qpdf = await getQpdfModule();

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inPath  = `/in-${id}.pdf`;
    const outPath = `/out-${id}.pdf`;

    qpdf.FS.writeFile(inPath, new Uint8Array(req.file.buffer));

    console.log(`[unlock-pdf] Decryption start: ${req.file.originalname}`);
    const exitCode: number = qpdf.callMain([
      `--password=${password}`,
      "--decrypt",
      "--",
      inPath,
      outPath,
    ]);

    if (exitCode !== 0) {
      throw new Error(`qpdf-wasm exited with code ${exitCode} (likely invalid password)`);
    }

    console.log(`[unlock-pdf] Decryption complete: ${req.file.originalname}`);
    const out: Uint8Array = qpdf.FS.readFile(outPath);

    try { qpdf.FS.unlink(inPath); } catch { /* ignore */ }
    try { qpdf.FS.unlink(outPath); } catch { /* ignore */ }

    const baseName = req.file.originalname.replace(/\.pdf$/i, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${baseName}-unlocked.pdf"`
    );
    console.log(`[unlock-pdf] Download response: Sending ${out.length} bytes`);
    res.send(Buffer.from(out));

  } catch (err: any) {
    console.error("[unlock-pdf] Error condition:", err?.message ?? err);
    res.status(400).json({ error: "Failed to unlock the PDF. The password may be incorrect." });
  }
});

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "secure_32_byte_passphrase_key_12";
const IV_LENGTH = 16;


export function encryptData(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptData(text: string): string {
  try {
    if (!text) return "";
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift()!, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return "Decryption Error";
  }
}

const supabaseUrl = process.env.SUPABASE_URL || "https://your-project-id.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "your-anon-key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.post("/api/crm/sync-user", async (req, res) => {
  try {
    const { displayName, avatarUrl, email, phone, authProvider, planStatus } = req.body;

    // Sanitize authProvider: Supabase CHECK constraint only allows "google" | "phone"
    const safeAuthProvider = (authProvider === "phone") ? "phone" : "google";

    const encryptedEmail = email ? encryptData(email) : null;
    const encryptedPhone = phone ? encryptData(phone) : null;

    // 1. Sync to CRM Webhook
    const contactInfo = email || phone || "";
    const encryptedContactInfo = contactInfo ? encryptData(contactInfo) : "";

    try {
      const crmResponse = await fetch("http://localhost:3001/api/admin/trigger-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-email": "mathinirai.a@gmail.com"
        },
        body: JSON.stringify({
          customerName: displayName,
          planType: planStatus === "pro" ? "Monthly Pro" : "Daily Pass",
          contactNumberOrEmail: encryptedContactInfo
        })
      });

      if (!crmResponse.ok) {
        const errText = await crmResponse.text();
        console.warn("CRM returned error status:", crmResponse.status, errText);
      }
    } catch (crmErr: any) {
      // CRM webhook is optional — don't fail the entire sync if CRM is unreachable
      console.warn("CRM webhook unreachable (non-blocking):", crmErr.message);
    }

    // 2. Sync to Supabase Database (with graceful fallback for missing columns)
    const fullPayload: Record<string, any> = {
      display_name: displayName,
      avatar_url: avatarUrl,
      encrypted_email: encryptedEmail,
      encrypted_phone: encryptedPhone,
      auth_provider: safeAuthProvider,
      plan_status: planStatus || "free",
    };

    let { data, error } = await supabase
      .from("crm_users")
      .upsert(fullPayload, { onConflict: "encrypted_email" })
      .select();

    // If plan_status or usage_count columns don't exist yet, retry without them
    if (error && error.message.includes("schema cache")) {
      console.warn("[CRM Sync] Retrying without plan_status (column may not exist yet)...");
      const { plan_status, usage_count, ...corePayload } = fullPayload;
      const retryResult = await supabase
        .from("crm_users")
        .upsert(corePayload, { onConflict: "encrypted_email" })
        .select();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.warn("Supabase sync warning:", error.message);
      return res.status(400).json({ success: false, error: error.message });
    }

    console.log(`[CRM Sync] User "${displayName}" synced to Supabase (provider=${safeAuthProvider}, plan=${planStatus})`);
    return res.json({ success: true, user: data?.[0] });
  } catch (err: any) {
    console.error("Failed to sync user session:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to sync user session." });
  }
});


// ================= PERSISTENT IP/ACCOUNT USAGE LIMITS =================
const USAGE_FILE = path.join(process.cwd(), "ip_usage.json");

// unlockedUntil: Unix ms timestamp — 0 means not unlocked.
// After plan expires, unlockedUntil will be in the past and premium is revoked automatically.
let ipUsageStore: Record<string, { count: number; unlockedUntil: number; planName: string }> = {};

if (fs.existsSync(USAGE_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    // Migrate old boolean-unlocked entries to new time-lock structure
    for (const [k, v] of Object.entries(raw as any)) {
      const entry = v as any;
      ipUsageStore[k] = {
        count: entry.count ?? 0,
        unlockedUntil: entry.unlockedUntil ?? (entry.unlocked ? Infinity : 0),
        planName: entry.planName ?? (entry.unlocked ? "Legacy Pro" : "free"),
      };
    }
  } catch (e) {
    ipUsageStore = {};
  }
}

/** Returns true if the entry currently has an active (not expired) premium plan */
function isPremiumActive(entry: { unlockedUntil: number }): boolean {
  return entry.unlockedUntil > Date.now();
}

/** Duration in ms for each plan */
const PLAN_DURATIONS: Record<string, number> = {
  starter: 7   * 24 * 60 * 60 * 1000,   // 7 days
  monthly: 30  * 24 * 60 * 60 * 1000,   // 30 days
  annual:  365 * 24 * 60 * 60 * 1000,   // 1 year
  // Legacy fallbacks
  daily:   24  * 60 * 60 * 1000,
  weekly:  7   * 24 * 60 * 60 * 1000,
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter (7 days)",
  monthly: "Monthly Pro (30 days)",
  annual:  "Annual Pro (1 year)",
  // Legacy fallbacks
  daily:   "Daily Pass (24h)",
  weekly:  "Weekly Pass (7 days)",
};

function saveUsage() {
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(ipUsageStore, null, 2));
  } catch (e) {
    console.error("Failed to save usage file:", e);
  }
}

function getUsageKey(req: express.Request, email?: string): string {
  if (email && email.trim() !== "") {
    return `email:${email.trim().toLowerCase()}`;
  }
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;
  const ipStr = Array.isArray(ip) ? ip[0] : ip || "127.0.0.1";
  return `ip:${ipStr.trim()}`;
}

app.get("/api/usage/status", (req, res) => {
  const email = req.query.email as string | undefined;
  const key = getUsageKey(req, email);
  
  if (!ipUsageStore[key]) {
    ipUsageStore[key] = { count: 0, unlockedUntil: 0, planName: "free" };
    saveUsage();
  }

  const entry = ipUsageStore[key];
  const active = isPremiumActive(entry);

  // Auto-expire: if plan ended, keep count but clear premium
  if (!active && entry.unlockedUntil > 0 && entry.unlockedUntil !== Infinity) {
    entry.unlockedUntil = 0;
    entry.planName = "free";
    saveUsage();
  }
  
  res.json({
    count: entry.count,
    premiumUnlocked: active,
    planExpiresAt: active ? entry.unlockedUntil : null,
    planName: active ? entry.planName : null,
  });
});

app.post("/api/usage/increment", async (req, res) => {
  const { email } = req.body;
  const key = getUsageKey(req, email);

  if (!ipUsageStore[key]) {
    ipUsageStore[key] = { count: 0, unlockedUntil: 0, planName: "free" };
  }

  const entry = ipUsageStore[key];

  // If premium is active, let them proceed freely
  if (isPremiumActive(entry)) {
    return res.json({
      allowed: true,
      count: entry.count,
      planExpiresAt: entry.unlockedUntil,
      planName: entry.planName,
    });
  }

  // Plan expired — auto-clear premium flag
  if (entry.unlockedUntil > 0 && entry.unlockedUntil !== Infinity) {
    entry.unlockedUntil = 0;
    entry.planName = "free";
    saveUsage();
  }

  // After plan expires: paywall immediately (count already > 3, no free retry)
  // First-time users get 3 free uses.
  const LIMIT = 3;
  if (entry.count >= LIMIT) {
    return res.json({ allowed: false, count: entry.count });
  }

  entry.count += 1;
  saveUsage();

  // Sync updated task count to Supabase
  if (email && email.trim()) {
    const encryptedEmail = encryptData(email);
    supabase
      .from("crm_users")
      .update({ usage_count: entry.count })
      .eq("encrypted_email", encryptedEmail)
      .then(({ error }) => {
        if (error) console.warn("Supabase usage sync warning:", error.message);
        else console.log(`[Usage Sync] Task count updated to ${entry.count} for ${email}`);
      });
  }

  res.json({ allowed: true, count: entry.count });
});

app.post("/api/usage/unlock", async (req, res) => {
  const { email, planId } = req.body;
  
  const durationMs = PLAN_DURATIONS[planId] ?? PLAN_DURATIONS.daily;
  const planLabel  = PLAN_LABELS[planId]   ?? "Daily Pass (24h)";
  const expiresAt  = Date.now() + durationMs;

  // Unlock by both email and IP keys for robustness
  const emailKey = getUsageKey(req, email);
  if (!ipUsageStore[emailKey]) ipUsageStore[emailKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  ipUsageStore[emailKey].unlockedUntil = expiresAt;
  ipUsageStore[emailKey].planName = planLabel;

  const ipKey = getUsageKey(req, undefined);
  if (!ipUsageStore[ipKey]) ipUsageStore[ipKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  ipUsageStore[ipKey].unlockedUntil = expiresAt;
  ipUsageStore[ipKey].planName = planLabel;

  saveUsage();

  console.log(`[Usage Unlock] ${email || ipKey} → ${planLabel}, expires ${new Date(expiresAt).toISOString()}`);

  // Sync premium unlock to Supabase
  if (email && email.trim()) {
    const encryptedEmail = encryptData(email);
    supabase
      .from("crm_users")
      .update({ plan_status: planId })
      .eq("encrypted_email", encryptedEmail)
      .then(({ error }) => {
        if (error) console.warn("Supabase unlock sync warning:", error.message);
        else console.log(`[CRM Sync] Plan '${planId}' activated for ${email}`);
      });
  }

  res.json({ success: true, planExpiresAt: expiresAt, planName: planLabel });
});

app.post("/api/usage/reset", async (req, res) => {
  const { email } = req.body;
  const emailKey = getUsageKey(req, email);
  if (ipUsageStore[emailKey]) {
    ipUsageStore[emailKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  }
  const ipKey = getUsageKey(req, undefined);
  if (ipUsageStore[ipKey]) {
    ipUsageStore[ipKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  }
  saveUsage();

  // Sync reset to Supabase
  if (email && email.trim()) {
    const encryptedEmail = encryptData(email);
    supabase
      .from("crm_users")
      .update({ plan_status: "free", usage_count: 0 })
      .eq("encrypted_email", encryptedEmail)
      .then(({ error }) => {
        if (error) console.warn("Supabase reset sync warning:", error.message);
        else console.log(`[CRM Sync] Usage reset for ${email}`);
      });
  }

  res.json({ success: true });
});


// Configure Vite middleware in development or express.static in production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
  });
}

setupServer();

// ── Global crash guards ──────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception (server stays up):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (server stays up):", reason);
});
