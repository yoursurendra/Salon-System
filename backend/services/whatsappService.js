/**
 * ================================================================
 * FILE:    backend/services/whatsappService.js
 * PURPOSE: Send WhatsApp messages using Meta WhatsApp Cloud API
 * ================================================================
 *
 * HOW META CLOUD API WORKS — read once, understand everything:
 * ─────────────────────────────────────────────────────────────
 *
 * To send a message you make an HTTP POST request to:
 *   https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
 *
 * With these headers:
 *   Authorization: Bearer {WHATSAPP_TOKEN}
 *   Content-Type: application/json
 *
 * The body is a JSON object describing the message.
 *
 * THREE MESSAGE TYPES USED IN THIS FILE:
 *
 *   1. TEXT — plain text message
 *      { type: "text", text: { body: "hello" } }
 *
 *   2. INTERACTIVE BUTTON — up to 3 clickable buttons
 *      Used for: date selection (Today/Tomorrow), YES/NO confirmation
 *      { type: "interactive", interactive: { type: "button", ... } }
 *
 *   3. INTERACTIVE LIST — scrollable list of up to 10 items
 *      Used for: service menu, time slot selection
 *      { type: "interactive", interactive: { type: "list", ... } }
 *
 * REQUIRED .env VARIABLES:
 * ─────────────────────────
 *   WHATSAPP_TOKEN          = your permanent access token
 *   WHATSAPP_PHONE_NUMBER_ID = your phone number ID (not the number itself)
 *
 * ================================================================
 */

const axios = require("axios");

// Meta Graph API version — update this if Meta releases a newer version
const GRAPH_API_VERSION = "v19.0";

// ================================================================
// CORE SEND FUNCTION
// Every other function calls this. This is the only place
// that talks to Meta's API.
// ================================================================

/**
 * sendToMeta — sends any message payload to Meta's API
 *
 * @param {string} to      - customer phone number, e.g. "918529690405"
 *                           Meta format: no "+", no "whatsapp:" prefix
 *                           Example: "918529690405" not "+918529690405"
 * @param {object} payload - the message object (text, interactive, etc.)
 */
async function sendToMeta(to, payload) {
  // Read env variables inside the function — never at the top of the file.
  // This guarantees they are always loaded from .env before use.
  const token         = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Guard: if env variables are missing, log clearly and stop
  if (!token || !phoneNumberId) {
    console.error("═══════════════════════════════════════════════════════");
    console.error("❌ META API CONFIG ERROR — missing .env variables");
    console.error("   WHATSAPP_TOKEN          :", token         ? "✅ set" : "❌ MISSING");
    console.error("   WHATSAPP_PHONE_NUMBER_ID:", phoneNumberId ? "✅ set" : "❌ MISSING");
    console.error("   Open your .env file and add the missing values.");
    console.error("   Get them from: developers.facebook.com → your app → WhatsApp → API Setup");
    console.error("═══════════════════════════════════════════════════════");
    throw new Error("Meta WhatsApp env variables not configured");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  // Build the full request body
  const body = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                to,          // e.g. "918529690405"
    ...payload,
  };

  console.log("─────────────────────────────────────────────────────────");
  console.log("📤 OUTGOING MESSAGE → Meta API");
  console.log("   To  :", to);
  console.log("   Type:", payload.type);
  if (payload.type === "text") {
    console.log("   Text:", payload.text.body.slice(0, 80).replace(/\n/g, " ") + "...");
  }
  console.log("─────────────────────────────────────────────────────────");

  try {
    const response = await axios.post(url, body, {
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Meta API → message sent | ID:", response.data?.messages?.[0]?.id);
    return response.data;

  } catch (err) {
    // Meta returns detailed error info inside err.response.data
    const metaError = err.response?.data?.error;

    console.error("❌ META API SEND FAILED");
    console.error("   HTTP Status :", err.response?.status);
    console.error("   Error Code  :", metaError?.code);
    console.error("   Error Type  :", metaError?.type);
    console.error("   Message     :", metaError?.message || err.message);

    // Print the full payload so you can see exactly what was sent
    console.error("   PAYLOAD SENT:", JSON.stringify(body, null, 2));
    console.log(
  JSON.stringify(err.response?.data, null, 2)
);

    // Explain common errors
    if (metaError?.code === 131009) {
      console.error("   CAUSE 131009: A field in the payload is invalid.");
      console.error("   Common reasons:");
      console.error("     - Section has more than 10 rows");
      console.error("     - Row ID contains : or special characters");
      console.error("     - Section title contains & or emoji");
      console.error("     - A field exceeds its character limit");
    } else if (metaError?.code === 190) {
      console.error("   CAUSE: Access token is invalid or expired.");
      console.error("   FIX  : Go to developers.facebook.com → your app →");
      console.error("          WhatsApp → API Setup → generate a new token.");
    } else if (metaError?.code === 100) {
      console.error("   CAUSE: Invalid WHATSAPP_PHONE_NUMBER_ID.");
      console.error("   FIX  : Copy the Phone Number ID (not the phone number)");
      console.error("          from WhatsApp → API Setup.");
    } else if (metaError?.code === 131030) {
      console.error("   CAUSE: Phone number not in allowed list.");
      console.error("   FIX  : Go to WhatsApp → API Setup → add your personal");
      console.error("          number to the test recipients list.");
    } else if (metaError?.code === 131047) {
      console.error("   CAUSE: Message outside 24-hour customer service window.");
      console.error("   FIX  : Customer must message you first, then you have");
      console.error("          24 hours to reply.");
    }

    throw err;
  }
}

// ================================================================
// SIMPLE TEXT MESSAGE
// ================================================================

/**
 * sendText — sends a plain text message
 * Use this for: confirmations, errors, simple replies
 */
async function sendText(to, text) {
  return sendToMeta(to, {
    type: "text",
    text: { body: text },
  });
}

// ================================================================
// INTERACTIVE LIST MESSAGE
// Displays a scrollable list — customer taps to select
// Best for: service menu (many items), time slots
// Limit: up to 10 items per section, up to 5 sections
// ================================================================

/**
 * sendList — sends an interactive list message
 *
 * @param {string}   to          - customer phone
 * @param {string}   bodyText    - main message body text
 * @param {string}   buttonLabel - text on the button that opens the list (max 20 chars)
 * @param {Array}    sections    - array of { title, rows: [{ id, title, description }] }
 * @param {string}   headerText  - optional header above the body
 */
async function sendList(to, bodyText, buttonLabel, sections, headerText = null) {
  const interactive = {
    type: "list",
    body: { text: bodyText },
    action: {
      button:   buttonLabel.slice(0, 20), // Meta limit: 20 chars
      sections: sections.map((section) => ({
        title: section.title,
        rows:  section.rows.map((row) => ({
          id:          row.id.slice(0, 200),          // Meta limit: 200 chars
          title:       row.title.slice(0, 24),         // Meta limit: 24 chars
          description: (row.description || "").slice(0, 72), // Meta limit: 72 chars
        })),
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: "text", text: headerText.slice(0, 60) };
  }

  return sendToMeta(to, {
    type: "interactive",
    interactive,
  });
}

// ================================================================
// INTERACTIVE BUTTON MESSAGE
// Displays up to 3 tap-to-select buttons
// Best for: Today/Tomorrow, YES/NO, small fixed choices
// Limit: max 3 buttons, max 20 chars per button title
// ================================================================

/**
 * sendButtons — sends an interactive button message
 *
 * @param {string}   to        - customer phone
 * @param {string}   bodyText  - main message body
 * @param {Array}    buttons   - array of { id, title } (max 3)
 * @param {string}   headerText - optional header text
 */
async function sendButtons(to, bodyText, buttons, headerText = null) {
  const interactive = {
    type: "button",
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map((btn) => ({
        type:  "reply",
        reply: {
          id:    btn.id.slice(0, 256),    // Meta limit: 256 chars
          title: btn.title.slice(0, 20),  // Meta limit: 20 chars
        },
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: "text", text: headerText.slice(0, 60) };
  }

  return sendToMeta(to, {
    type: "interactive",
    interactive,
  });
}

// ================================================================
// SALON MESSAGE FUNCTIONS
// These build the message content and call sendList/sendButtons/sendText
// ================================================================

/**
 * sendServiceMenu
 * Shows the list of services — called when customer says "hi"
 */
async function sendServiceMenu(to, services, customerName) {
  const salonName = process.env.SALON_NAME || "Our Salon";

  const bodyText =
    `🙏 *Namaste ${customerName}!*\n\n` +
    `Welcome to *${salonName}* 💇‍♂️\n\n` +
    `Please select a service to book your appointment:`;

  const rows = services.map((svc, i) => ({
    id:          `service_${i}`,           // used to identify selection
    title:       `${svc.emoji} ${svc.name}`,
    description: `₹${svc.price} · ${svc.durationMinutes} mins`,
  }));

  return sendList(
    to,
    bodyText,
    "View Services",
    [{ title: "Our Services", rows }],
    salonName
  );
}

/**
 * sendDateOptions
 * Asks customer to choose Today or Tomorrow
 */
async function sendDateOptions(to, serviceName, serviceEmoji, price) {
  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "short",
  });
  const tomorrowLabel = new Date(Date.now() + 86400000).toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "short",
  });

  const bodyText =
    `${serviceEmoji} *${serviceName}* — ₹${price}\n\n` +
    `Choose your appointment date:`;

  return sendButtons(
    to,
    bodyText,
    [
      { id: "date_today",    title: `Today` },
      { id: "date_tomorrow", title: `Tomorrow` },
    ],
    "📅 Select Date"
  );
}

/**
 * sendTimeSlots
 * Shows available time slots for the selected date.
 *
 * META HARD LIMITS (causes error 131009 if exceeded):
 *   - Max 10 rows per section
 *   - Max 10 sections total
 *   - Row ID: no colons or special characters
 *   - Section title: no & or special characters, max 24 chars
 *
 * We cap each section at 8 rows (under the 10 limit for safety)
 * and split into Morning / Afternoon / Evening.
 */
async function sendTimeSlots(to, slots, serviceName, displayDate) {
  if (!slots || slots.length === 0) {
    return sendText(
      to,
      `😔 *No available slots on ${displayDate}*\n\n` +
      `Type *MENU* to choose a different date or service.`
    );
  }

  // ── Split slots into three groups ──────────────────────────────
  // Strict cap of 8 per section — safely under Meta's 10-row limit.
  const MAX_PER_SECTION = 8;

  // Morning:   09:00 – 12:30
  /*const morning   = slots
    .filter((s) => parseInt(s) < 13)
    .slice(0, MAX_PER_SECTION);

  // Afternoon: 13:00 – 16:30
  const afternoon = slots
    .filter((s) => parseInt(s) >= 13 && parseInt(s) < 17)
    .slice(0, MAX_PER_SECTION);

  // Evening:   17:00 – 19:30
  const evening   = slots
    .filter((s) => parseInt(s) >= 17)
    .slice(0, MAX_PER_SECTION);*/

  // ── Build sections (only include non-empty groups) ─────────────
  const sections = [
    {
    title: "Times",
    rows: [
      {
        id: "slot_0900",
        title: "9:00 AM"
      },
      {
        id: "slot_1000",
        title: "10:00 AM"
      }
    ]
  }
  ];

  /*if (morning.length > 0) {
    sections.push({
      title: "Morning",           // plain text only — no emoji, no &
      rows: morning.map((slot) => ({
        id:          `slot_${slot.replace(":", "")}`, // "09:00" → "slot_0900"
        title:       formatTime(slot),                // "9:00 AM"
        description: "Available",
      })),
    });
  }

  if (afternoon.length > 0) {
    sections.push({
      title: "Afternoon",         // no ampersand, no emoji
      rows: afternoon.map((slot) => ({
        id:          `slot_${slot.replace(":", "")}`,
        title:       formatTime(slot),
        description: "Available",
      })),
    });
  }

  if (evening.length > 0) {
    sections.push({
      title: "Evening",
      rows: evening.map((slot) => ({
        id:          `slot_${slot.replace(":", "")}`,
        title:       formatTime(slot),
        description: "Available",
      })),
    });
  } */

  // ── Safety fallback: if all groups empty somehow, send text ────
  if (sections.length === 0) {
    return sendText(
      to,
      `😔 *No available slots on ${displayDate}*\n\n` +
      `Type *MENU* to start again.`
    );
  }

  const bodyText =
    `📅 *${displayDate}*\n` +
    `Service: *${serviceName}*\n\n` +
    `Select your preferred time:`;

  return sendList(to, bodyText, "Choose Time", sections);
}

/**
 * sendBookingSummary
 * Shows booking details and asks for YES/NO confirmation
 */
async function sendBookingSummary(to, customerName, serviceName, serviceEmoji, displayDate, slot, price) {
  const bodyText =
    `📋 *Booking Summary*\n\n` +
    `👤 *Name    :* ${customerName}\n` +
    `${serviceEmoji} *Service :* ${serviceName}\n` +
    `📅 *Date    :* ${displayDate}\n` +
    `⏰ *Time    :* ${formatTime(slot)}\n` +
    `💰 *Price   :* ₹${price}\n\n` +
    `Confirm this booking?`;

  return sendButtons(
    to,
    bodyText,
    [
      { id: "confirm_yes", title: "✅ Confirm" },
      { id: "confirm_no",  title: "❌ Cancel"  },
    ],
    "Booking Confirmation"
  );
}

/**
 * sendBookingConfirmation
 * Final message after booking is saved to MongoDB
 */
async function sendBookingConfirmation(to, customerName, serviceName, serviceEmoji, displayDate, slot, price) {
  const salonName    = process.env.SALON_NAME    || "Our Salon";
  const salonAddress = process.env.SALON_ADDRESS || "";
  const salonPhone   = process.env.SALON_PHONE   || "";

  const text =
    `✅ *Booking Confirmed!*\n\n` +
    `🙏 Dear *${customerName}*,\n\n` +
    `Your appointment at *${salonName}* is confirmed!\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${serviceEmoji} *Service :* ${serviceName}\n` +
    `📅 *Date    :* ${displayDate}\n` +
    `⏰ *Time    :* ${formatTime(slot)}\n` +
    `💰 *Price   :* ₹${price}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    (salonAddress ? `📍 ${salonAddress}\n\n` : "") +
    (salonPhone   ? `📞 ${salonPhone}\n\n`   : "") +
    `_We will remind you 2 hours before_ ⏰\n` +
    `_Type *CANCEL* to cancel your booking_`;

  return sendText(to, text);
}

/**
 * sendReminder
 * Sent 2 hours before appointment by the cron job
 */
async function sendReminder(to, customerName, serviceName, serviceEmoji, slot) {
  const text =
    `⏰ *Appointment Reminder!*\n\n` +
    `Hi *${customerName}* 🙏\n\n` +
    `Your appointment is *2 hours away!*\n\n` +
    `${serviceEmoji} *${serviceName}*\n` +
    `⏰ *${formatTime(slot)}* today\n` +
    `📍 *${process.env.SALON_NAME || "Our Salon"}*\n\n` +
    `See you soon! 😊\n` +
    `_Type *CANCEL* if you cannot make it_`;

  return sendText(to, text);
}

/**
 * sendReviewRequest
 * Sent after appointment is completed by the cron job
 */
async function sendReviewRequest(to, customerName, serviceName) {
  const bodyText =
    `🙏 *Thank you for visiting ${process.env.SALON_NAME || "Our Salon"}!*\n\n` +
    `Hi *${customerName}*, how was your *${serviceName}* experience?\n\n` +
    `Please rate us:`;

  return sendButtons(
    to,
    bodyText,
    [
      { id: "review_5", title: "⭐⭐⭐⭐⭐ Excellent" },
      { id: "review_4", title: "⭐⭐⭐⭐ Good"      },
      { id: "review_3", title: "⭐⭐⭐ Average"     },
    ],
    "Rate Your Experience"
  );
}

/**
 * sendMarketingOffer
 * Sent by the marketing cron job after X days of inactivity
 */
async function sendMarketingOffer(to, customerName, daysSince, discountPercent) {
  const bodyText =
    `💇‍♂️ *We Miss You, ${customerName}!*\n\n` +
    `It has been *${daysSince} days* since your last visit.\n\n` +
    `Special offer just for you:\n` +
    `🎉 *${discountPercent}% OFF* on your next appointment!\n\n` +
    `_Valid for 7 days only_ ⏳`;

  return sendButtons(
    to,
    bodyText,
    [
      { id: "marketing_book", title: "📅 Book Now" },
      { id: "marketing_stop", title: "🚫 Stop Offers" },
    ],
    `Special Offer 🎉`
  );
}

// ================================================================
// HELPER: 24h → 12h time format
// "14:30" → "2:30 PM"
// "09:00" → "9:00 AM"
// ================================================================
function formatTime(timeStr) {
  if (!timeStr) return "";
  const [hourStr, minStr] = timeStr.split(":");
  const hour = parseInt(hourStr, 10);
  const min  = minStr || "00";
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12  = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h12}:${min} ${ampm}`;
}

// ================================================================
// EXPORTS
// ================================================================
module.exports = {
  sendText,
  sendList,
  sendButtons,
  sendServiceMenu,
  sendDateOptions,
  sendTimeSlots,
  sendBookingSummary,
  sendBookingConfirmation,
  sendReminder,
  sendReviewRequest,
  sendMarketingOffer,
};