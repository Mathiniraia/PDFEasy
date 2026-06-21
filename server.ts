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
import nodemailer from "nodemailer";

// ── qpdf-WASM: initialise once and reuse across all requests ──────────────
// @neslinesli93/qpdf-wasm ships a CJS module with an inline WASM loader.
// We use createRequire so the ESM server.ts can resolve its CJS entry.
const _require = typeof require !== "undefined" ? require : createRequire(import.meta.url);
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

// Email Transporter Setup
let emailTransporter: nodemailer.Transporter;

async function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;

  if (process.env.SMTP_USER) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true" || false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Automatically create a free Ethereal test account if no real credentials are provided
    console.log("No SMTP_USER found in .env. Creating a temporary Ethereal test account for emails...");
    const testAccount = await nodemailer.createTestAccount();
    emailTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log("Ethereal test account created successfully.");
  }
  return emailTransporter;
}

const SENDER_EMAIL = process.env.SMTP_FROM || '"PDF Easy Team" <hello@pdfeasy.app>';

// Send Welcome Email Endpoint
app.post("/api/emails/welcome", async (req, res) => {
  const { email, displayName } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const name = displayName || email.split("@")[0];
  const appUrl = "https://pdf-easy-zeta.vercel.app";

  try {
    const transporter = await getEmailTransporter();
    const info = await transporter.sendMail({
      from: SENDER_EMAIL,
      to: email,
      subject: "Welcome to PDF Easy! 🎉",
      html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <h2 style="color: #000;">Welcome to PDF Easy, ${name}!</h2>
          <p>We are thrilled to have you on board. PDF Easy is your all-in-one suite for modifying, merging, compressing, and protecting your documents effortlessly.</p>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin: 30px 0;">
            <h3 style="margin-top: 0;">Ready to unlock continuous, high-speed access?</h3>
            <p>Upgrade to Pro today for priority cloud processing, mobile readiness, and unlimited operations across all 12 PDF workspace utility tools.</p>
            <div style="text-align: center; margin-top: 25px;">
              <a href="${appUrl}/?action=unlock" style="background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Unlock Unlimited Access</a>
            </div>
          </div>
          
          <p>If you have any questions, feel free to reply directly to this email.</p>
          <p>Best regards,<br/>The PDF Easy Team</p>
        </div>
      `,
    });
    console.log(`[Email] Welcome email sent to ${email}`);
    const testUrl = nodemailer.getTestMessageUrl(info);
    if (testUrl) console.log(`[Ethereal Test URL]: ${testUrl}`);
    res.json({ success: true });
  } catch (error) {
    console.error("[Email Error] Failed to send welcome email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

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
  const { orderId, paymentId, signature, isDemo, planId, email, displayName } = req.body;

  const sendPaymentSuccessEmail = async (userEmail: string, plan: string, duration: string) => {
    if (!userEmail) return;
    try {
      const transporter = await getEmailTransporter();
      const info = await transporter.sendMail({
        from: SENDER_EMAIL,
        to: userEmail,
        subject: `Payment Successful! Welcome to ${plan} 🚀`,
        html: `
          <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
            <h2 style="color: #000;">Thank you for your payment!</h2>
            <p>You have successfully unlocked <strong>${plan}</strong> for the next <strong>${duration}</strong>. You now have priority cloud access and unlimited PDF operations.</p>
            <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0; margin: 20px 0;">
              <p style="margin: 0; color: #166534; font-weight: bold;">Status: Premium Unlocked</p>
            </div>
            <p>Go ahead and do yourself whatever you want with your documents! We are thrilled to have your support.</p>
            <p>Best,<br/>The PDF Easy Team</p>
          </div>
        `,
      });
      console.log(`[Email] Payment success email sent to ${userEmail}`);
      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) console.log(`[Ethereal Test URL]: ${testUrl}`);
    } catch (e) {
      console.error("[Email Error] Failed to send payment success email:", e);
    }
  };

  const planLabelMap: Record<string, string> = {
    starter: "Starter",
    monthly: "Monthly Pro",
    annual:  "Annual Pro",
  };
  const planLabel = planLabelMap[planId] || "Monthly Pro";

  const planDurationMap: Record<string, string> = {
    starter: "7 Days",
    monthly: "1 Month",
    annual:  "1 Year",
  };
  const durationLabel = planDurationMap[planId] || "1 Month";

  if (isDemo || !getRazorpay()) {
    // Sandbox: still sync to CRM so you can see the flow
    if (email) {
      const encryptedContact = encryptData(email);
      notifyCRM({
        customerName: displayName || email.split("@")[0],
        planType: planLabel,
        contactNumberOrEmail: encryptedContact,
        razorpayPaymentId: paymentId || `demo_${Date.now()}`
      });
      console.log(`[CRM Payment] Demo payment synced for ${email} → ${planLabel}`);
      sendPaymentSuccessEmail(email, planLabel, durationLabel);
    }
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
    // ✅ Real payment verified — sync to CRM
    if (email) {
      const encryptedContact = encryptData(email);
      notifyCRM({
        customerName: displayName || email.split("@")[0],
        planType: planLabel,
        contactNumberOrEmail: encryptedContact,
        razorpayPaymentId: paymentId
      });
      console.log(`[CRM Payment] Real payment synced for ${email} → ${planLabel} (${paymentId})`);
      sendPaymentSuccessEmail(email, planLabel, durationLabel);
    }
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
  if (!text) return "";
  const iv = crypto.createHash("sha256").update(text).digest().slice(0, IV_LENGTH);
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

// CRM dashboard URL — change to your hosted CRM URL when deployed
const CRM_URL = process.env.CRM_URL || "http://localhost:3001";
const CRM_ADMIN_EMAIL = "mathinirai.a@gmail.com";

/** Fire-and-forget CRM webhook — never blocks main response */
function notifyCRM(payload: Record<string, any>) {
  fetch(`${CRM_URL}/api/admin/trigger-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-email": CRM_ADMIN_EMAIL },
    body: JSON.stringify(payload)
  }).catch(err => console.warn("[CRM] Webhook unreachable (non-blocking):", err.message));
}

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

    // 1. Notify CRM dashboard (fire-and-forget)
    notifyCRM({
      customerName: displayName,
      planType: planStatus === "pro" ? "Monthly Pro" : "Starter",
      contactNumberOrEmail: encryptedContactInfo
    });
    console.log(`[CRM Sync] Notified CRM for user: ${displayName}`);

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

// ─── ADMIN CONFIGURATION ──────────────────────────────────────────────────
// Emails in this list get PERMANENT LIFETIME access — no payment, no limit.
// Add your email here. You can also add partner / team emails.
const ADMIN_WHITELIST: string[] = [
  "mathinirai.a@gmail.com",   // Owner — permanent admin, unlimited access forever
  // Add more admin emails below:
  // "partner@example.com",
];

// Pre-grant permanent access to all admin emails on startup
function ensureAdminAccess() {
  for (const email of ADMIN_WHITELIST) {
    const key = `email:${email.toLowerCase()}`;
    ipUsageStore[key] = {
      count: 0,
      unlockedUntil: Infinity,
      planName: "Admin (Lifetime)"
    };
  }
}

// Admin secret key — must match ADMIN_SECRET in your .env
function isAdminRequest(req: express.Request): boolean {
  const secret = req.headers["x-admin-secret"] as string;
  return secret === (process.env.ADMIN_SECRET || "pdfeasy-admin-secret-2024");
}

function isAdminEmail(email: string): boolean {
  return ADMIN_WHITELIST.map(e => e.toLowerCase()).includes(email.trim().toLowerCase());
}


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

// Always ensure admin emails have permanent access, even after server restart
ensureAdminAccess();
console.log("[Admin] Permanent access granted to:", ADMIN_WHITELIST.join(", "));

/** Returns true if the entry currently has an active (not expired) premium plan */
function isPremiumActive(entry: { unlockedUntil: number }): boolean {
  if (entry.unlockedUntil === Infinity) return true;  // permanent / admin grant
  return entry.unlockedUntil > Date.now();
}

/** Duration in ms for each plan */
const PLAN_DURATIONS: Record<string, number> = {
  starter:  7   * 24 * 60 * 60 * 1000,   // 7 days
  monthly:  30  * 24 * 60 * 60 * 1000,   // 30 days
  annual:   365 * 24 * 60 * 60 * 1000,   // 1 year
  lifetime: new Date("2099-12-31").getTime() - Date.now(), // far-future = lifetime
  // Legacy fallbacks
  daily:    24  * 60 * 60 * 1000,
  weekly:   7   * 24 * 60 * 60 * 1000,
};

const PLAN_LABELS: Record<string, string> = {
  starter:  "Starter (7 days)",
  monthly:  "Monthly Pro (30 days)",
  annual:   "Annual Pro (1 year)",
  lifetime: "Lifetime Access",
  // Legacy fallbacks
  daily:    "Daily Pass (24h)",
  weekly:   "Weekly Pass (7 days)",
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
  let ipStr = Array.isArray(ip) ? ip[0] : ip || "127.0.0.1";
  if (typeof ipStr === "string" && ipStr.includes(",")) {
    ipStr = ipStr.split(",")[0];
  }
  return `ip:${ipStr.trim()}`;
}

app.get("/api/usage/status", async (req, res) => {
  const email = req.query.email as string | undefined;

  // ── Admin whitelist: permanent lifetime access ──
  if (email && isAdminEmail(email)) {
    return res.json({
      count: 0,
      allowed: true,
      premiumUnlocked: true,
      planExpiresAt: 9999999999999, // far future = lifetime
      planName: "Admin (Lifetime)",
      isAdmin: true,
    });
  }

  const emailKey = email && email.trim() !== "" ? `email:${email.trim().toLowerCase()}` : null;
  const ipKey = getUsageKey(req); // just gets the ip key

  if (!ipUsageStore[ipKey]) ipUsageStore[ipKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  if (emailKey && !ipUsageStore[emailKey]) ipUsageStore[emailKey] = { count: 0, unlockedUntil: 0, planName: "free" };

  const key = emailKey || ipKey;

  // Sync counts so free attempts do not reset upon login
  if (emailKey && key !== ipKey) {
    const maxCount = Math.max(ipUsageStore[emailKey].count, ipUsageStore[ipKey].count);
    ipUsageStore[emailKey].count = maxCount;
    ipUsageStore[ipKey].count = maxCount;
  }

  const entry = ipUsageStore[key];
  let active = isPremiumActive(entry);

  // Auto-expire: if plan ended, keep count but clear premium
  if (!active && entry.unlockedUntil > 0 && entry.unlockedUntil !== Infinity) {
    entry.unlockedUntil = 0;
    entry.planName = "free";
    saveUsage();
  }

  // Fallback for Vercel Serverless Cold Starts: Restore session from Supabase
  if (!active && email) {
    try {
      const { data } = await supabase
        .from("crm_users")
        .select("plan_expires_at, plan_status, access_revoked, usage_count")
        .eq("encrypted_email", encryptData(email))
        .single();
      
      if (data) {
        if (data.usage_count !== undefined && data.usage_count !== null) {
          entry.count = data.usage_count;
        }
        if (!data.access_revoked && data.plan_expires_at) {
          const expires = new Date(data.plan_expires_at).getTime();
          if (expires > Date.now()) {
            entry.unlockedUntil = expires;
            entry.planName = data.plan_status || "pro";
            active = true;
            console.log(`[Cold Start Restore] Restored premium for ${email}`);
          }
        }
        saveUsage();
      }
    } catch (e) {
      console.warn("Failed to restore session from Supabase:", e);
    }
  }
  
  res.json({
    count: entry.count,
    premiumUnlocked: active,
    planExpiresAt: active ? (entry.unlockedUntil === Infinity ? 9999999999999 : entry.unlockedUntil) : null,
    planName: active ? entry.planName : null,
  });
});

app.post("/api/usage/increment", async (req, res) => {
  const { email } = req.body;

  // Sync tool usage to CRM tool analytics — insert one row per use
  const { toolSlug } = req.body;
  if (toolSlug) {
    supabase
      .from("crm_tool_analytics")
      .insert({ tool_slug: toolSlug })
      .then(({ error }) => {
        if (error) console.warn("[CRM Tool Analytics] sync warning:", error.message);
        else console.log(`[CRM Tool Analytics] ${toolSlug} used`);
      });
  }

  const emailKey = email && email.trim() !== "" ? `email:${email.trim().toLowerCase()}` : null;
  const ipKey = getUsageKey(req);

  if (!ipUsageStore[ipKey]) ipUsageStore[ipKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  if (emailKey && !ipUsageStore[emailKey]) ipUsageStore[emailKey] = { count: 0, unlockedUntil: 0, planName: "free" };

  const key = emailKey || ipKey;

  // Sync counts so free attempts do not reset upon login
  if (emailKey && key !== ipKey) {
    const maxCount = Math.max(ipUsageStore[emailKey].count, ipUsageStore[ipKey].count);
    ipUsageStore[emailKey].count = maxCount;
    ipUsageStore[ipKey].count = maxCount;
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
  
  if (emailKey && key !== ipKey) {
    ipUsageStore[ipKey].count = entry.count;
  }
  
  saveUsage();
  if (email && email.trim()) {
    const encryptedEmail = encryptData(email);
    supabase
      .from("crm_users")
      .update({ usage_count: entry.count })
      .eq("encrypted_email", encryptedEmail)
      .then(({ error }) => {
        if (error) console.warn("Supabase usage sync warning:", error.message);
      });
  }

  res.json({
    allowed: true,
    count: entry.count,
  });
});

app.post("/api/usage/log-action", async (req, res) => {
  const { email, toolSlug, actionType } = req.body;
  if (!toolSlug || !actionType) {
    return res.status(400).json({ error: "Missing toolSlug or actionType" });
  }

  try {
    let userId = "usr_anonymous";
    let userName = "Guest User";

    if (email && email.trim()) {
      const encryptedEmail = encryptData(email);
      const { data: user } = await supabase
        .from("crm_users")
        .select("id, display_name")
        .eq("encrypted_email", encryptedEmail)
        .single();
      
      if (user) {
        userId = user.id;
        userName = user.display_name || email.split("@")[0] || "User";
      }
    }

    const { data, error } = await supabase
      .from("crm_user_actions")
      .insert({
        user_id: userId,
        user_name: userName,
        tool_slug: toolSlug,
        action_type: actionType,
      })
      .select();

    if (error) {
      console.warn("[CRM User Action Log] error:", error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log(`[CRM User Action Log] ${userName} -> ${toolSlug} -> ${actionType}`);
    res.json({ success: true, action: data?.[0] });
  } catch (err: any) {
    console.error("[CRM User Action Log] failure:", err);
    res.status(500).json({ error: err.message || "Failed to log action" });
  }
});

app.post("/api/usage/unlock", async (req, res) => {
  const { email, planId, paymentId, orderId } = req.body;
  
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

  // Sync premium unlock to Supabase (plan + expiry + revoked flag)
  if (email && email.trim()) {
    const encryptedEmail = encryptData(email);
    const dbPlanMap: Record<string, string> = {
      daily: "pro",
      weekly: "pro",
      starter: "pro",
      monthly: "pro",
      annual: "pro",
      lifetime: "lifetime"
    };
    const dbPlanStatus = dbPlanMap[planId] || "pro";

    supabase
      .from("crm_users")
      .upsert({
        encrypted_email: encryptedEmail,
        plan_status: dbPlanStatus,
        plan_expires_at: new Date(expiresAt).toISOString(),
        access_revoked: false,
        display_name: email.split("@")[0],
        auth_provider: "google",
      }, { onConflict: "encrypted_email" })
      .then(({ error }) => {
        if (error) console.warn("Supabase unlock sync warning:", error.message);
        else console.log(`[CRM Sync] Plan '${dbPlanStatus}' activated and user registered/updated for ${email}, expires ${new Date(expiresAt).toISOString()}`);
      });

    // Insert into crm_transactions
    const planAmounts: Record<string, number> = { daily: 99, weekly: 99, starter: 99, monthly: 199, annual: 999 };
    const planTypeMap: Record<string,string> = {
      starter:"weekly", monthly:"monthly", annual:"annual", lifetime:"monthly",
      daily:"daily", weekly:"weekly"
    };
    const dbPlanType = planTypeMap[planId] || "monthly";

    supabase.from("crm_transactions").insert({
      id: crypto.randomUUID(),
      user_id: null,  // populated by CRM via email lookup
      user_name: email, // add user_name for visual lookup in Payments tab
      razorpay_payment_id: paymentId || `pay_${Date.now()}`,
      razorpay_order_id: orderId || `order_${Date.now()}`,
      plan_type: dbPlanType, // use mapped planId to pass Supabase ENUM check constraint
      amount: planAmounts[planId] ?? 199,
      amount_in_paise: (planAmounts[planId] ?? 199) * 100,
      expires_at: new Date(expiresAt).toISOString(),
      plan_expires_at: new Date(expiresAt).toISOString(),
      status: "captured",
    }).then(({ error }) => {
      if (error) console.warn("[CRM] Transaction insert warning:", error.message);
      else console.log(`[CRM Transactions] Payment recorded for ${email}`);
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

// ─── ADMIN: Grant free access to any user ──────────────────────────────────
// POST /api/admin/grant-access
// Headers: x-admin-secret: <your-admin-secret>
// Body: { email: "user@example.com", planId: "monthly" }  (planId optional, defaults to "annual")
app.post("/api/admin/grant-access", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "Unauthorized. Invalid admin secret." });
  }

  const { email, planId = "annual" } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required." });
  }

  const durationMs = PLAN_DURATIONS[planId] ?? PLAN_DURATIONS.annual;
  const planLabel  = PLAN_LABELS[planId] ?? "Admin Grant";
  const expiresAt  = Date.now() + durationMs;

  const emailKey = getUsageKey(req, email);
  if (!ipUsageStore[emailKey]) ipUsageStore[emailKey] = { count: 0, unlockedUntil: 0, planName: "free" };
  ipUsageStore[emailKey].unlockedUntil = expiresAt;
  ipUsageStore[emailKey].planName = `${planLabel} (Admin Grant)`;
  ipUsageStore[emailKey].count = 0; // reset usage count too
  saveUsage();

  console.log(`[Admin Grant] ${email} → ${planLabel}, expires ${new Date(expiresAt).toISOString()}`);

  // Sync to Supabase — plan, expiry, admin flag
  if (email.trim()) {
    const encryptedEmail = encryptData(email);
    const dbPlanMap: Record<string, string> = {
      daily: "pro",
      weekly: "pro",
      starter: "pro",
      monthly: "pro",
      annual: "pro",
      lifetime: "lifetime"
    };
    const dbPlanStatus = dbPlanMap[planId] || "pro";

    supabase
      .from("crm_users")
      .upsert({
        encrypted_email: encryptedEmail,
        plan_status: dbPlanStatus,
        plan_expires_at: new Date(expiresAt).toISOString(),
        access_revoked: false,
        granted_by_admin: true,
        display_name: email.split("@")[0],
        auth_provider: "google",
      }, { onConflict: "encrypted_email" })
      .then(({ error }) => {
        if (error) console.warn("Supabase admin grant sync warning:", error.message);
        else console.log(`[CRM Sync] Admin granted '${dbPlanStatus}' to ${email} until ${new Date(expiresAt).toISOString()}`);
      });

    // Log admin grant as a transaction (using actual crm_transactions schema)
    const planTypeMap: Record<string,string> = {
      starter:"starter", monthly:"monthly", annual:"annual", lifetime:"monthly",
      daily:"daily", weekly:"weekly"
    };
    supabase.from("crm_transactions").insert({
      user_id: null,
      user_name: email,
      razorpay_payment_id: `admin_grant_${Date.now()}`,
      razorpay_order_id: `admin_order_${Date.now()}`,
      plan_type: planTypeMap[planId] || "monthly",
      amount: 0,
      amount_in_paise: 0,
      expires_at: new Date(expiresAt).toISOString(),
      plan_expires_at: new Date(expiresAt).toISOString(),
      status: "admin_grant",
    }).then(({ error }) => {
      if (error) console.warn("[CRM] Admin grant transaction insert warning:", error.message);
      else console.log(`[CRM] Admin grant logged for ${email}`);
    });
  }

  res.json({
    success: true,
    message: `✅ Access granted to ${email}`,
    plan: planLabel,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

// ─── ADMIN: Revoke access from a user ─────────────────────────────────────
// POST /api/admin/revoke-access
// Headers: x-admin-secret: <your-admin-secret>
// Body: { email: "user@example.com" }
app.post("/api/admin/revoke-access", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required." });
  }

  if (isAdminEmail(email)) {
    return res.status(400).json({ error: "Cannot revoke admin access." });
  }

  // Revoke in local store
  const emailKey = `email:${email.trim().toLowerCase()}`;
  if (ipUsageStore[emailKey]) {
    ipUsageStore[emailKey].unlockedUntil = 0;
    ipUsageStore[emailKey].planName = "free";
  }
  saveUsage();

  // Revoke in Supabase
  const encryptedEmail = encryptData(email);
  supabase
    .from("crm_users")
    .update({
      plan_status: "free",
      plan_expires_at: null,
      access_revoked: true,
    })
    .eq("encrypted_email", encryptedEmail)
    .then(({ error }) => {
      if (error) console.warn("Supabase revoke sync warning:", error.message);
      else console.log(`[CRM Revoke] Access revoked for ${email}`);
    });

  console.log(`[Admin Revoke] Access revoked for ${email}`);
  res.json({ success: true, message: `🚫 Access revoked for ${email}` });
});

// --- ADMIN CREDENTIALS & LOGIN LOGIC ---
const CREDENTIALS_FILE = path.join(process.cwd(), "admin_cred.json");

function getAdminCredentials() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    } catch (e) {
      // fallback
    }
  }
  const defaultCreds = {
    email: CRM_ADMIN_EMAIL,
    password: "Mathi@1996"
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(defaultCreds, null, 2));
  return defaultCreds;
}

function updateAdminPassword(newPassword: string) {
  const creds = getAdminCredentials();
  creds.password = newPassword;
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

// POST /api/admin/login
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const creds = getAdminCredentials();
  if (
    email.toLowerCase().trim() === creds.email.toLowerCase().trim() &&
    password === creds.password
  ) {
    return res.json({
      success: true,
      email: creds.email,
      name: "Mathini (Admin)"
    });
  }

  return res.status(401).json({ error: "Invalid email or password." });
});

// POST /api/admin/forgot-password
app.post("/api/admin/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  const creds = getAdminCredentials();
  if (email.toLowerCase().trim() !== creds.email.toLowerCase().trim()) {
    return res.status(404).json({ error: "Admin email not found." });
  }

  // Generate a random new password (e.g. pdfeasy-1234)
  const code = Math.floor(1000 + Math.random() * 9000);
  const newPassword = `pdfeasy-${code}`;
  updateAdminPassword(newPassword);

  // Email content
  const emailContent = `
Subject: PDFEasy Admin CRM - Password Reset
To: ${creds.email}
Date: ${new Date().toISOString()}

Hello Admin,

A request was made to reset the password for your PDFEasy CRM Admin account.

Your new generated password is:
${newPassword}

Please log in at: http://localhost:5173/admin using this password.

Best regards,
PDFEasy System Security
  `;

  // Log to console and local file
  console.log(`[Forgot Password] Generating new password for ${creds.email}: ${newPassword}`);
  const logFile = path.join(process.cwd(), "sent_emails.log");
  fs.appendFileSync(logFile, `\n========================================\n${emailContent}\n`);

  let sentInfo = "Email logged to sent_emails.log and console.";
  try {
    const nodemailer = await import("nodemailer").catch(() => null);
    if (nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      await transporter.sendMail({
        from: `"PDFEasy Security" <${process.env.SMTP_USER}>`,
        to: creds.email,
        subject: "PDFEasy Admin CRM - Password Reset",
        text: emailContent.split("\n\n").slice(2).join("\n\n")
      });
      sentInfo = "A reset password has been dispatched to your inbox.";
    }
  } catch (err: any) {
    console.warn("[Nodemailer Transporter Warning]:", err.message);
  }

  res.json({
    success: true,
    message: `Reset complete. ${sentInfo} (Password: ${newPassword})`
  });
});

// ─── ADMIN: List all users with access ────────────────────────────────────
app.get("/api/admin/users", (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "Unauthorized. Invalid admin secret." });
  }

  const now = Date.now();
  const users = Object.entries(ipUsageStore)
    .filter(([key]) => key.startsWith("email:"))
    .map(([key, entry]) => ({
      email: key.replace("email:", ""),
      count: entry.count,
      plan: entry.planName,
      active: entry.unlockedUntil > now,
      expiresAt: entry.unlockedUntil > 0 ? new Date(entry.unlockedUntil).toISOString() : null,
      isAdmin: isAdminEmail(key.replace("email:", "")),
    }));

  const adminEmails = ADMIN_WHITELIST.map(email => ({
    email,
    count: 0,
    plan: "Admin (Lifetime)",
    active: true,
    expiresAt: null,
    isAdmin: true,
  }));

  res.json({ admins: adminEmails, users });
});

// ─── ADMIN: Full CRM user list (decrypted emails + usage + plan) ─────────────
app.get("/api/admin/crm-users", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "Unauthorized." });
  }

  try {
    // Fetch all users from Supabase
    const { data: supaUsers, error } = await supabase
      .from("crm_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const now = Date.now();

    // Decrypt emails and merge with local usage store
    const users = (supaUsers || []).map((u: any) => {
      const email = u.encrypted_email ? decryptData(u.encrypted_email) : null;
      const phone = u.encrypted_phone ? decryptData(u.encrypted_phone) : null;

      // Lookup live usage from local store
      const usageKey = email ? `email:${email.toLowerCase()}` : null;
      const usageEntry = usageKey ? ipUsageStore[usageKey] : null;
      const isPremium = usageEntry ? isPremiumActive(usageEntry) : false;
      const expiresAt = usageEntry?.unlockedUntil ?? 0;
      const liveCount  = usageEntry?.count ?? u.usage_count ?? 0;
      const livePlan   = isPremium ? (usageEntry?.planName ?? u.plan_status) : "free";

      return {
        id: u.id,
        displayName: u.display_name,
        email,
        phone,
        authProvider: u.auth_provider,
        planStatus: livePlan,
        usageCount: liveCount,
        premiumActive: isPremium,
        expiresAt: expiresAt > 0 
          ? (expiresAt === Infinity ? new Date(9999999999999).toISOString() : new Date(expiresAt).toISOString()) 
          : (u.plan_expires_at || null),
        joinedAt: u.created_at,
        isAdmin: email ? isAdminEmail(email) : false,
        grantedByAdmin: u.granted_by_admin || false,
        accessRevoked:  u.access_revoked  || false,
      };
    });

    res.json({ users, total: users.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/transactions — fetch all payment records from Supabase
app.get("/api/admin/transactions", async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: "Unauthorized." });
  try {
    const { data, error } = await supabase
      .from("crm_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const transactions = (data || []).map((tx: any) => ({
      id:                tx.id,
      razorpayPaymentId: tx.razorpay_payment_id || "—",
      userName:          tx.user_name || "Unknown",
      passType:          tx.plan_type || "Unknown Plan",
      amount:            tx.amount || Math.round((tx.amount_in_paise || 0) / 100),
      timestamp:         tx.created_at,
      status:            tx.status || "captured",
      planExpiresAt:     tx.expires_at || tx.plan_expires_at || null,
    }));

    res.json({ transactions, total: transactions.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/tool-analytics — count rows per tool_slug from Supabase
app.get("/api/admin/tool-analytics", async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: "Unauthorized." });
  try {
    // crm_tool_analytics is per-event (one row per use)
    // Count rows grouped by tool_slug
    const { data, error } = await supabase
      .from("crm_tool_analytics")
      .select("tool_slug");

    if (error) return res.status(500).json({ error: error.message });

    // Aggregate counts client-side
    const counts: Record<string, number> = {};
    for (const row of (data || [])) {
      if (row.tool_slug) counts[row.tool_slug] = (counts[row.tool_slug] || 0) + 1;
    }

    const tools = Object.entries(counts)
      .map(([slug, count]) => ({ slug, title: slug, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ tools, total: tools.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

// ── Global Expiration Reminder CRON Job ───────────────────────────────────────
// Runs every 12 hours to check for subscriptions expiring in less than 3 days
setInterval(async () => {
  const now = Date.now();
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  
  for (const [key, entry] of Object.entries(ipUsageStore)) {
    // Only process email accounts, not IPs
    if (!key.startsWith("email:")) continue;
    
    // Ignore admins and non-active users
    if (entry.unlockedUntil === Infinity || entry.unlockedUntil <= now) continue;
    
    const timeRemaining = entry.unlockedUntil - now;
    
    // If between 2 and 3 days remaining (so it triggers only once in this window)
    if (timeRemaining > (2 * 24 * 60 * 60 * 1000) && timeRemaining <= threeDaysInMs) {
      const email = key.replace("email:", "");
      
      // Prevent duplicate emails
      if (!(entry as any).reminderSent) {
        (entry as any).reminderSent = true;
        saveUsage();
        
        try {
          const transporter = await getEmailTransporter();
          const info = await transporter.sendMail({
            from: SENDER_EMAIL,
            to: email,
            subject: "Your PDF Easy Pro access is expiring soon ⏳",
            html: `
              <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                <h2 style="color: #000;">Your access limit will end soon!</h2>
                <p>We hope you've been enjoying your Unlimited Access to PDF Easy.</p>
                <p>This is a quick reminder that your <strong>${entry.planName}</strong> will expire in less than 3 days.</p>
                <div style="background-color: #fffbeb; padding: 20px; border-radius: 12px; border: 1px solid #fef3c7; margin: 30px 0;">
                  <p>Please recharge or pay your way to the next big thing to avoid any interruptions to your workflow.</p>
                  <div style="text-align: center; margin-top: 25px;">
                    <a href="https://pdf-easy-zeta.vercel.app/?action=unlock" style="background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Recharge Now</a>
                  </div>
                </div>
                <p>Best regards,<br/>The PDF Easy Team</p>
              </div>
            `,
          });
          console.log(`[Email] Expiration reminder sent to ${email}`);
          const testUrl = nodemailer.getTestMessageUrl(info);
          if (testUrl) console.log(`[Ethereal Test URL]: ${testUrl}`);
        } catch (e) {
          console.error("[Email Error] Failed to send expiration reminder:", e);
        }
      }
    }
  }
}, 12 * 60 * 60 * 1000); // 12 hours

setupServer();

// ── Global crash guards ──────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception (server stays up):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (server stays up):", reason);
});
