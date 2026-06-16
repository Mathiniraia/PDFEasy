/**
 * Supabase Client — Browser-side singleton
 * Reads VITE_ prefixed env vars (Vite exposes only VITE_ vars to the client bundle).
 * Used by client-side utilities such as logUserActivity.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta as any).env.VITE_SUPABASE_URL ||
  "https://mjxokjbxnujkchdlqtgs.supabase.co";

const supabaseAnonKey =
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY ||
  (import.meta as any).env.VITE_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
