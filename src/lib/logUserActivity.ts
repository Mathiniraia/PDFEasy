/**
 * logUserActivity — Global activity logging utility
 *
 * Inserts a row into the `user_page_visits` Supabase table whenever a
 * user performs a meaningful action (page visit, tool use, auth event).
 *
 * Designed to be called fire-and-forget — errors are caught silently so
 * they never interrupt the user experience or block any UI flows.
 *
 * Usage:
 *   import { logUserActivity } from "@/lib/logUserActivity";
 *   logUserActivity(user.uid, user.displayName, "/merge-pdf");
 */

import { supabase } from "./supabase";

export async function logUserActivity(
  userId: string,
  userName: string,
  slug: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("user_page_visits")
      .insert([
        {
          user_id: userId,
          user_name: userName,
          slug: slug,
          visited_at: new Date().toISOString(),
        },
      ]);

    if (error) {
      console.warn(
        "[logUserActivity] Supabase insert failed:",
        error.message
      );
    } else {
      console.log(
        `[logUserActivity] ✅ Activity logged → user: "${userName}" | slug: "${slug}"`
      );
    }
  } catch (err: any) {
    // Silent catch — logging must never crash the app
    console.warn(
      "[logUserActivity] Unexpected error during activity log:",
      err?.message || err
    );
  }
}
