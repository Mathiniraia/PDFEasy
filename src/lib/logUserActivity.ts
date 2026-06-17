/**
 * logUserActivity — Global activity logging utility
 *
 * Inserts a row into the `user_page_visits` Supabase table whenever a
 * user performs a meaningful action (page visit, tool use, auth event).
 *
 * Uses the Supabase REST API directly via fetch to avoid TypeScript
 * generated-type conflicts when the table has no auto-generated types.
 *
 * Designed to be called fire-and-forget — errors are caught silently so
 * they never interrupt the user experience or block any UI flows.
 *
 * Usage:
 *   import { logUserActivity } from "./lib/logUserActivity";
 *   logUserActivity(user.uid, user.displayName, "/merge-pdf");
 */

const SUPABASE_URL = "https://mjxokjbxnujkchdlqtgs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qeG9ramJ4bnVqa2NoZGxxdGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjU1MDQsImV4cCI6MjA5Njk0MTUwNH0.yYPXnG9HP1AeBpWmFIdrJkG_TMJ4e09bS6hC9jUXJ3Y";

export async function logUserActivity(
  userId: string,
  userName: string,
  slug: string
): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_page_visits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        user_name: userName,
        slug: slug,
        visited_at: new Date().toISOString(),
      }),
    });

    if (res.ok) {
      console.log(
        `[logUserActivity] ✅ Activity logged → user: "${userName}" | slug: "${slug}"`
      );
    } else {
      const errText = await res.text();
      console.warn("[logUserActivity] Supabase insert failed:", errText);
    }
  } catch (err: unknown) {
    // Silent catch — logging must never crash the app
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[logUserActivity] Unexpected error during activity log:", msg);
  }
}
