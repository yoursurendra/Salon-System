/**
 * ================================================================
 * FILE:    backend/routes/whatsapp.js
 * PURPOSE: Receive and process Meta WhatsApp Cloud API webhooks
 * ================================================================
 *
 * TWO THINGS THIS FILE DOES:
 *
 *   GET /webhook  — webhook verification (one-time setup with Meta)
 *   POST /webhook — receive every incoming customer message
 *
 * HOW META SENDS MESSAGES TO YOUR SERVER:
 * ─────────────────────────────────────────
 * When a customer messages your WhatsApp number, Meta calls
 * POST /webhook with a JSON body like this:
 *
 *   {
 *     entry: [{
 *       changes: [{
 *         value: {
 *           messages: [{
 *             from: "918529690405",    ← customer phone, NO whatsapp: prefix
 *             type: "text",
 *             text: { body: "hi" }
 *           }],
 *           contacts: [{
 *             profile: { name: "Rahul" }
 *           }]
 *         }
 *       }]
 *     }]
 *   }
 *
 * When customer taps an interactive button or list item:
 *   message.type = "interactive"
 *   message.interactive.type = "button_reply" or "list_reply"
 *   message.interactive.button_reply.id = "confirm_yes"
 *   message.interactive.list_reply.id   = "service_0"
 *
 * CONVERSATION STATES (stored in MongoDB Customer document):
 * ──────────────────────────────────────────────────────────
 *   "idle"              → no active booking flow, show menu
 *   "selecting_service" → waiting for service choice
 *   "selecting_date"    → waiting for Today/Tomorrow choice
 *   "selecting_slot"    → waiting for time slot choice
 *   "confirming"        → waiting for YES/NO
 *   "awaiting_review"   → waiting for star rating 1–5
 *
 * ================================================================
 */

const express = require("express");
const router  = express.Router();

const Customer        = require("../models/Customer");
const Booking         = require("../models/Booking");
const { Service, Review } = require("../models/Service");
const wa              = require("../services/whatsappService");

// ================================================================
// GET /webhook — Meta Webhook Verification
//
// When you register your webhook URL in the Meta Developer dashboard,
// Meta sends a GET request to verify it. This handler responds
// correctly so Meta accepts your URL.
//
// Meta sends three query params:
//   hub.mode         = "subscribe"
//   hub.verify_token = whatever you typed in Meta dashboard
//   hub.challenge    = a random string you must echo back
// ================================================================
router.get("/", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🔐 Webhook verification request received");
  console.log("   hub.mode        :", mode);
  console.log("   hub.verify_token:", token);

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully!");
    // Echo back the challenge string — Meta requires this
    return res.status(200).send(challenge);
  }

  console.error("❌ Webhook verification FAILED");
  console.error("   Expected token:", process.env.WHATSAPP_VERIFY_TOKEN);
  console.error("   Received token:", token);
  console.error("   Fix: make sure WHATSAPP_VERIFY_TOKEN in .env matches");
  console.error("   what you typed in the Meta developer dashboard.");
  return res.sendStatus(403);
});

// ================================================================
// POST /webhook — Incoming Message Handler
//
// Meta calls this every time a customer sends a message,
// reacts to a message, or your message status changes.
// ================================================================
router.post("/", async (req, res) => {
  // Always send 200 OK immediately.
  // Meta requires a response within 20 seconds.
  // If you don't respond, Meta retries and sends duplicate messages.
  res.sendStatus(200);

  try {
    // ── Parse the Meta webhook payload ──────────────────────────
    const body = req.body;

    // Meta sends many types of updates — only process messages
    const entry   = body?.entry?.[0];
    const change  = entry?.changes?.[0];
    const value   = change?.value;

    // value.statuses exists for message delivery/read receipts — ignore those
    if (!value?.messages) {
      console.log("📭 Webhook received (no message — status update, ignoring)");
      return;
    }

    const message  = value.messages[0];
    const contacts = value.contacts?.[0];

    // ── Extract message data ─────────────────────────────────────
    const from     = message.from;          // "918529690405" — no "whatsapp:" prefix
    const msgType  = message.type;          // "text" or "interactive"
    const senderName = contacts?.profile?.name || "Friend";

    console.log("══════════════════════════════════════════════════════");
    console.log("📨 INCOMING MESSAGE");
    console.log("   From    :", from);
    console.log("   Name    :", senderName);
    console.log("   Type    :", msgType);
    console.log("══════════════════════════════════════════════════════");

    // ── Extract what the customer actually said or tapped ────────
    let msgText      = "";  // text they typed (lowercased)
    let interactiveId = ""; // ID of button/list item they tapped

    if (msgType === "text") {
      msgText = message.text.body.trim().toLowerCase();
      console.log("   Text    :", message.text.body);

    } else if (msgType === "interactive") {
      const interactive = message.interactive;

      if (interactive.type === "button_reply") {
        // Customer tapped an interactive button
        interactiveId = interactive.button_reply.id;
        console.log("   Button  :", interactiveId, "(", interactive.button_reply.title, ")");

      } else if (interactive.type === "list_reply") {
        // Customer selected from an interactive list
        interactiveId = interactive.list_reply.id;
        console.log("   List    :", interactiveId, "(", interactive.list_reply.title, ")");
      }

      // Also set msgText to the ID for unified handling in the switch below
      msgText = interactiveId.toLowerCase();

    } else {
      // Customer sent an image, audio, location, etc. — handle gracefully
      console.log("   Unsupported message type:", msgType);
      await wa.sendText(from,
        "Sorry, I can only understand text messages and button/list selections.\n\n" +
        "Type *MENU* to see our services."
      );
      return;
    }

    // ── Find or create customer ──────────────────────────────────
    const customer = await findOrCreateCustomer(from, senderName);
    console.log("👤 Customer:", customer.name, "| State:", customer.conversationState);

    // ── Route to the correct handler ─────────────────────────────
    await handleMessage(customer, msgText, interactiveId, from);

  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
    console.error(err.stack);
    // Already sent 200, so Meta will not retry
  }
});

// ================================================================
// FIND OR CREATE CUSTOMER
// ================================================================
async function findOrCreateCustomer(phone, nameFromMeta) {
  let customer = await Customer.findOne({ phone });

  if (!customer) {
    // Use the name Meta gives us from the customer's WhatsApp profile
    customer = await Customer.create({
      phone,
      name:              nameFromMeta || "Friend",
      conversationState: "idle",
      pendingBooking:    {},
    });
    console.log("🆕 New customer:", nameFromMeta, phone);
  }

  return customer;
}

// ================================================================
// MAIN MESSAGE ROUTER
// ================================================================
async function handleMessage(customer, msgText, interactiveId, phone) {

  // ── GLOBAL COMMANDS — work from any state ────────────────────
  const globalTriggers = [
    "hi", "hello", "hey", "hii", "helo",
    "namaste", "namaskar",
    "book", "booking",
    "menu", "services",
    "start", "help",
  ];

  if (globalTriggers.includes(msgText)) {
    return startBookingFlow(customer, phone);
  }

  if (msgText === "cancel") {
    return handleCancellation(customer, phone);
  }

  if (interactiveId === "marketing_book") {
    return startBookingFlow(customer, phone);
  }

  if (interactiveId === "marketing_stop" || msgText === "stop") {
    customer.marketingOptOut   = true;
    customer.conversationState = "idle";
    await customer.save();
    return wa.sendText(phone,
      "✅ You have been unsubscribed from promotional messages.\n\n" +
      "Type *MENU* anytime to book an appointment."
    );
  }

  // ── STATE MACHINE ─────────────────────────────────────────────
  switch (customer.conversationState) {

    case "idle":
      return startBookingFlow(customer, phone);

    case "selecting_service":
      return handleServiceSelected(customer, interactiveId, msgText, phone);

    case "selecting_date":
      return handleDateSelected(customer, interactiveId, msgText, phone);

    case "selecting_slot":
      return handleSlotSelected(customer, interactiveId, msgText, phone);

    case "confirming":
      if (interactiveId === "confirm_yes" || msgText === "yes" || msgText === "y") {
        return handleConfirmBooking(customer, phone);
      }
      if (interactiveId === "confirm_no" || msgText === "no" || msgText === "n") {
        customer.conversationState = "idle";
        customer.pendingBooking    = {};
        await customer.save();
        return wa.sendText(phone, "❌ Booking cancelled.\n\nType *MENU* to start again.");
      }
      return wa.sendText(phone, "Please tap *Confirm* or *Cancel* to respond.");

    case "awaiting_review":
      if (interactiveId.startsWith("review_") || ["1","2","3","4","5"].includes(msgText)) {
        const rating = parseInt(interactiveId.replace("review_", "")) || parseInt(msgText);
        return handleReviewReceived(customer, rating, phone);
      }
      return wa.sendText(phone, "Please select a rating from the options above.");

    default:
      customer.conversationState = "idle";
      await customer.save();
      return startBookingFlow(customer, phone);
  }
}

// ================================================================
// STEP 1 — Show service menu
// ================================================================
async function startBookingFlow(customer, phone) {
  console.log("📋 Starting booking flow for:", phone);

  const services = await Service.find({ isActive: true }).sort({ displayOrder: 1 });

  if (!services.length) {
    return wa.sendText(phone,
      `Sorry, no services are available right now.\n\n` +
      `Please call us at ${process.env.SALON_PHONE || "our number"}.`
    );
  }

  customer.conversationState = "selecting_service";
  customer.pendingBooking    = {};
  await customer.save();

  return wa.sendServiceMenu(phone, services, customer.name);
}

// ================================================================
// STEP 2 — Customer selected a service from the list
// ================================================================
async function handleServiceSelected(customer, interactiveId, msgText, phone) {
  // interactiveId from list = "service_0", "service_1", etc.
  const services = await Service.find({ isActive: true }).sort({ displayOrder: 1 });

  let serviceIndex = -1;

  if (interactiveId.startsWith("service_")) {
    serviceIndex = parseInt(interactiveId.replace("service_", ""));
  } else {
    // Customer typed a number instead of tapping
    const n = parseInt(msgText) - 1;
    if (!isNaN(n)) serviceIndex = n;
  }

  if (serviceIndex < 0 || serviceIndex >= services.length) {
    return wa.sendText(phone,
      `Please select a service from the list.\n\nType *MENU* to see the services again.`
    );
  }

  const service = services[serviceIndex];
  console.log("✅ Service selected:", service.name, "for", phone);

  customer.pendingBooking    = { serviceId: service._id.toString() };
  customer.conversationState = "selecting_date";
  await customer.save();

  return wa.sendDateOptions(phone, service.name, service.emoji, service.price);
}

// ================================================================
// STEP 3 — Customer chose Today or Tomorrow
// ================================================================
async function handleDateSelected(customer, interactiveId, msgText, phone) {
  let dateStr;

  if (interactiveId === "date_today" || msgText === "today" || msgText === "1") {
    dateStr = todayString();
  } else if (interactiveId === "date_tomorrow" || msgText === "tomorrow" || msgText === "2") {
    dateStr = tomorrowString();
  } else {
    return wa.sendButtons(
      phone,
      "Please choose your appointment date:",
      [
        { id: "date_today",    title: "Today"    },
        { id: "date_tomorrow", title: "Tomorrow" },
      ]
    );
  }

  const service = await Service.findById(customer.pendingBooking?.serviceId);
  if (!service) {
    customer.conversationState = "idle";
    await customer.save();
    return wa.sendText(phone, "Something went wrong. Type *MENU* to start again.");
  }

  console.log("📅 Date selected:", dateStr, "for", phone);

  const slots       = await getAvailableSlots(dateStr);
  const displayDate = formatDate(dateStr);

  if (!slots.length) {
    return wa.sendText(phone,
      `😔 No slots available on *${displayDate}*.\n\n` +
      `Type *MENU* to try again or call us at ${process.env.SALON_PHONE || "our number"}.`
    );
  }

  customer.pendingBooking = {
    ...customer.pendingBooking,
    date:           dateStr,
    availableSlots: slots,
  };
  customer.conversationState = "selecting_slot";
  await customer.save();

  return wa.sendTimeSlots(phone, slots, service.name, displayDate);
}

// ================================================================
// STEP 4 — Customer chose a time slot from the list
// ================================================================
async function handleSlotSelected(customer, interactiveId, msgText, phone) {
  // interactiveId = "slot_0900", "slot_1030", etc.
  // The colon was stripped from the ID when building the list message
  // because Meta rejects ":" in list row IDs (error 131009).
  // We restore it here: "slot_0900" → "09:00"
  let chosenSlot;

  if (interactiveId.startsWith("slot_")) {
    const raw = interactiveId.replace("slot_", ""); // "0900" or "1030"
    // Re-insert the colon between hour and minute: "0900" → "09:00"
    chosenSlot = raw.slice(0, 2) + ":" + raw.slice(2); // "09:00"
  } else {
    // Customer typed a number instead of tapping (fallback)
    const savedSlots = customer.pendingBooking?.availableSlots || [];
    const n = parseInt(msgText) - 1;
    if (!isNaN(n) && n >= 0 && n < savedSlots.length) {
      chosenSlot = savedSlots[n];
    }
  }

  if (!chosenSlot) {
    return wa.sendText(phone, "Please select a time slot from the list above.");
  }

  const service = await Service.findById(customer.pendingBooking?.serviceId);
  if (!service) {
    customer.conversationState = "idle";
    await customer.save();
    return wa.sendText(phone, "Something went wrong. Type *MENU* to start again.");
  }

  console.log("⏰ Slot selected:", chosenSlot, "for", phone);

  customer.pendingBooking = {
    ...customer.pendingBooking,
    slot: chosenSlot,
  };
  customer.conversationState = "confirming";
  await customer.save();

  const displayDate = formatDate(customer.pendingBooking.date);

  return wa.sendBookingSummary(
    phone,
    customer.name,
    service.name,
    service.emoji,
    displayDate,
    chosenSlot,
    service.price
  );
}

// ================================================================
// STEP 5 — Customer confirmed the booking
// ================================================================
async function handleConfirmBooking(customer, phone) {
  const { serviceId, date, slot } = customer.pendingBooking || {};

  if (!serviceId || !date || !slot) {
    customer.conversationState = "idle";
    await customer.save();
    return wa.sendText(phone, "Something went wrong. Type *MENU* to start again.");
  }

  // Check slot is still free (someone else might have booked it)
  const conflict = await Booking.findOne({
    date,
    timeSlot: slot,
    status:   { $in: ["confirmed", "pending"] },
  });

  if (conflict) {
    customer.conversationState = "selecting_date";
    await customer.save();
    return wa.sendText(phone,
      "😔 Sorry! That slot was just taken by someone else.\n\n" +
      "Type *MENU* to choose a new time."
    );
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    customer.conversationState = "idle";
    await customer.save();
    return wa.sendText(phone, "Service not found. Type *MENU* to start again.");
  }

  // Create booking in MongoDB
  const booking = await Booking.create({
    customer:            customer._id,
    service:             serviceId,
    date,
    timeSlot:            slot,
    appointmentDateTime: new Date(`${date}T${slot}:00.000+05:30`),
    status:              "confirmed",
    pricePaid:           service.price,
    discountApplied:     0,
    reminderSent:        false,
    reviewRequested:     false,
  });

  console.log("📅 BOOKING SAVED TO DB");
  console.log("   ID      :", booking._id);
  console.log("   Customer:", customer.name, phone);
  console.log("   Service :", service.name);
  console.log("   Date    :", date, "at", slot);

  customer.conversationState = "idle";
  customer.pendingBooking    = {};
  await customer.save();

  return wa.sendBookingConfirmation(
    phone,
    customer.name,
    service.name,
    service.emoji,
    formatDate(date),
    slot,
    service.price
  );
}

// ================================================================
// CANCELLATION
// ================================================================
async function handleCancellation(customer, phone) {
  const today   = todayString();
  const booking = await Booking.findOne({
    customer: customer._id,
    status:   "confirmed",
    date:     { $gte: today },
  })
    .populate("service")
    .sort({ date: 1, timeSlot: 1 });

  customer.conversationState = "idle";
  customer.pendingBooking    = {};
  await customer.save();

  if (!booking) {
    return wa.sendText(phone,
      "You have no upcoming bookings to cancel.\n\nType *MENU* to make a new appointment."
    );
  }

  booking.status = "cancelled";
  await booking.save();

  console.log("❌ Booking cancelled:", booking._id, "for", phone);

  return wa.sendText(phone,
    `✅ Your *${booking.service.name}* appointment on *${booking.date}* ` +
    `at *${booking.timeSlot}* has been cancelled.\n\n` +
    `Type *MENU* to book again. 🙏`
  );
}

// ================================================================
// REVIEW HANDLING
// ================================================================
async function handleReviewReceived(customer, rating, phone) {
  console.log("⭐ Review:", rating, "stars from", phone);

  const booking = await Booking.findOne({
    customer: customer._id,
    status:   "completed",
  }).sort({ createdAt: -1 });

  if (booking) {
    try {
      await Review.create({
        booking:  booking._id,
        customer: customer._id,
        rating,
        source:   "whatsapp",
      });
      console.log("💾 Review saved:", rating, "stars");
    } catch (err) {
      console.error("⚠️  Review save failed:", err.message);
    }
  }

  customer.conversationState = "idle";
  await customer.save();

  const messages = {
    5: `⭐⭐⭐⭐⭐ Thank you so much, *${customer.name}* ji! 🙏\nYour 5-star review means everything to us!`,
    4: `⭐⭐⭐⭐ Thank you, *${customer.name}* ji! 😊\nSo glad you had a great experience!`,
    3: `⭐⭐⭐ Thank you for the feedback, *${customer.name}* ji.\nWe will keep improving! 💪`,
    2: `⭐⭐ Thank you for being honest, *${customer.name}* ji.\nWe will do better next time.`,
    1: `⭐ We are truly sorry, *${customer.name}* ji.\nPlease call us so we can make it right.`,
  };

  return wa.sendText(phone,
    (messages[rating] || messages[5]) +
    "\n\nSee you next time! Type *MENU* to book again 💇‍♂️"
  );
}

// ================================================================
// SLOT AVAILABILITY ENGINE
// ================================================================
async function getAvailableSlots(date) {
  const openHour  = parseInt(process.env.SALON_OPENING_HOUR)    || 9;
  const closeHour = parseInt(process.env.SALON_CLOSING_HOUR)    || 20;
  const duration  = parseInt(process.env.SLOT_DURATION_MINUTES) || 30;

  // Generate all possible slots
  const all = [];
  for (let h = openHour; h < closeHour; h++) {
    for (let m = 0; m < 60; m += duration) {
      all.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  }

  // Find already-booked slots
  const booked = await Booking.find({
    date,
    status: { $in: ["confirmed", "pending"] },
  }).select("timeSlot");
  const bookedSet = new Set(booked.map((b) => b.timeSlot));

  // For today, remove past slots
  const isToday     = date === todayString();
  const cutoffTime  = Date.now() + 30 * 60 * 1000; // 30 min from now

  return all.filter((slot) => {
    if (bookedSet.has(slot)) return false;
    if (isToday) {
      const [h, m] = slot.split(":").map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      if (t.getTime() < cutoffTime) return false;
    }
    return true;
  });
}

// ================================================================
// DATE HELPERS
// ================================================================
function todayString()    { return new Date().toISOString().split("T")[0]; }
function tomorrowString() { return new Date(Date.now() + 86400000).toISOString().split("T")[0]; }
function formatDate(s)    {
  return new Date(s).toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "short",
  });
}

module.exports = router;