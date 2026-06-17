/**
 * Supabase Client — Browser-side singleton
 * Reads VITE_ prefixed env vars (Vite exposes only VITE_ vars to the client bundle).
 * Wrapped in try-catch so a missing/empty key never crashes the app at module load.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mjxokjbxnujkchdlqtgs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qeG9ramJ4bnVqa2NoZGxxdGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjU1MDQsImV4cCI6MjA5Njk0MTUwNH0.yYPXnG9HP1AeBpWmFIdrJkG_TMJ4e09bS6hC9jUXJ3Y";

const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL || SUPABASE_URL;

const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient>;

try {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} catch (err) {
  console.warn("[Supabase] Failed to init with env vars, using hardcoded fallback:", err);
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export { supabase };
