import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "abcdefghijklmnopqrstuvwxyz123456";

function decryptData(text: string): string {
  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift()!, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return text;
  }
}

async function sendMissedEmails() {
  console.log("Fetching all users from Supabase...");
  const { data: allUsers, error } = await supabase.from("crm_users").select("*");

  if (error) {
    console.error("Failed to fetch users:", error);
    return;
  }

  if (!allUsers || allUsers.length === 0) {
    console.log("No users found.");
    return;
  }

  // Get the last 5 users only
  const users = allUsers.slice(-5);

  console.log(`Sending to the last ${users.length} users. Decrypting emails and triggering Welcome API...`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    if (!user.encrypted_email) continue;
    
    const email = decryptData(user.encrypted_email);
    console.log(`Sending email to: ${email}`);

    try {
      const response = await fetch("https://pdfeasy-backend.onrender.com/api/emails/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, displayName: user.display_name }),
      });

      if (response.ok) {
        successCount++;
        console.log(`✅ Success for ${email}`);
      } else {
        failCount++;
        console.error(`❌ Failed for ${email}. Server returned:`, await response.text());
      }
    } catch (err: any) {
      failCount++;
      console.error(`❌ Network error for ${email}:`, err.message);
    }
  }

  console.log("-----------------------------------------");
  console.log(`Finished processing. ${successCount} sent successfully, ${failCount} failed.`);
}

sendMissedEmails();
