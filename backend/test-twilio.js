/**
 * test-twilio.js
 * ==============
 * Run this BEFORE changing anything else.
 * It tells you exactly what is wrong.
 *
 * HOW TO RUN (from your backend folder):
 *   node test-twilio.js
 *
 * THEN also run with your phone number:
 *   node test-twilio.js +918529690405
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

console.log("\n========================================");
console.log("        TWILIO DIAGNOSTIC REPORT        ");
console.log("========================================\n");

const SID   = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM  = process.env.TWILIO_WHATSAPP_FROM;

console.log("STEP 1 — Env variables loaded:");
console.log("────────────────────────────────");
console.log("  TWILIO_ACCOUNT_SID    :", !SID   ? "❌ MISSING" : (SID.startsWith("AC")  ? "✅ " + SID.slice(0,8)+"..." : "⚠️  " + SID.slice(0,8)+"... (should start with AC)"));
console.log("  TWILIO_AUTH_TOKEN     :", !TOKEN ? "❌ MISSING" : "✅ " + TOKEN.slice(0,5)+"...");
console.log("  TWILIO_WHATSAPP_FROM  :", !FROM  ? "❌ MISSING  ← LIKELY YOUR BUG" : (!FROM.startsWith("whatsapp:") ? "❌ " + FROM + "  ← missing whatsapp: prefix" : "✅ " + FROM));
console.log("");

let hasError = false;

console.log("STEP 2 — Diagnosis:");
console.log("────────────────────");

if (!SID || !TOKEN || !FROM) {
  hasError = true;
  console.log("❌ One or more Twilio variables are UNDEFINED.");
  console.log("   Open backend/.env and make sure these 3 lines are present:");
  console.log("");
  console.log("   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  console.log("   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  console.log("   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886");
  console.log("");
  console.log("   Rules:");
  console.log("   - No quotes around values");
  console.log("   - No spaces around the = sign");
  console.log("   - TWILIO_WHATSAPP_FROM must include whatsapp: at the start");
}

if (FROM && !FROM.startsWith("whatsapp:")) {
  hasError = true;
  console.log("❌ TWILIO_WHATSAPP_FROM is missing the whatsapp: prefix.");
  console.log("   Current value :", FROM);
  console.log("   Correct value : whatsapp:" + FROM);
}

if (SID && !SID.startsWith("AC")) {
  hasError = true;
  console.log("❌ TWILIO_ACCOUNT_SID looks wrong — should start with AC");
}

if (!hasError) {
  console.log("✅ All env variables look correctly formatted.");
}
console.log("");

const targetPhone = process.argv[2];

if (!targetPhone) {
  console.log("STEP 3 — Live send test:");
  console.log("─────────────────────────");
  console.log("Run again with your phone number:");
  console.log("  node test-twilio.js +918529690405");
  console.log("");
  process.exit(0);
}

if (!SID || !TOKEN || !FROM) {
  console.log("Fix env variables first, then re-run.\n");
  process.exit(1);
}

const twilio = require("twilio");
const client = twilio(SID, TOKEN);
const toFmt  = targetPhone.startsWith("whatsapp:") ? targetPhone : `whatsapp:${targetPhone}`;

console.log("STEP 3 — Live test:");
console.log("────────────────────");
console.log("  from :", FROM);
console.log("  to   :", toFmt);
console.log("Sending...\n");

client.messages
  .create({ from: FROM, to: toFmt, body: "✅ SalonIQ test — Twilio is working!" })
  .then((msg) => {
    console.log("✅ SUCCESS! SID:", msg.sid);
    console.log("Check WhatsApp — message should arrive now.");
    console.log("Your setup is correct. Restart server and Test 3 will work.\n");
  })
  .catch((err) => {
    console.log("❌ FAILED:", err.message, "| code:", err.code);
    console.log("");
    if (err.code === 63007 || err.message.includes("Channel")) {
      console.log("ROOT CAUSE: Account SID + Auth Token do not match.");
      console.log("FIX:");
      console.log("  1. Go to twilio.com → log in");
      console.log("  2. On the main dashboard, copy Account SID (starts with AC)");
      console.log("  3. Click eye icon next to Auth Token, copy it");
      console.log("  4. Paste both into your .env file exactly");
      console.log("  5. Make sure you are on your MAIN account, not a sub-account");
    } else if (err.code === 21608) {
      console.log("FIX: Your phone has not joined the sandbox.");
      console.log("     Send 'join basket-most' to +14155238886 on WhatsApp first.");
    } else if (err.code === 20003) {
      console.log("FIX: Authentication failed — wrong SID or Token.");
      console.log("     Copy them again from twilio.com.");
    }
    console.log("");
  });