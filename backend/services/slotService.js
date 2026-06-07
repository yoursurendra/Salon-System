/**
 * =====================================================
 * SLOT SERVICE
 * =====================================================
 * Calculates available time slots for a given date.
 * Accounts for: opening hours, existing bookings,
 * slot duration, and current time.
 */

const moment = require("moment-timezone");
const Booking = require("../models/Booking");

const TZ = process.env.SALON_TIMEZONE || "Asia/Kolkata";
const OPENING_HOUR = parseInt(process.env.SALON_OPENING_HOUR) || 9;  // 9 AM
const CLOSING_HOUR = parseInt(process.env.SALON_CLOSING_HOUR) || 20; // 8 PM
const SLOT_DURATION = parseInt(process.env.SLOT_DURATION_MINUTES) || 30;

/**
 * Get available time slots for a given date
 * @param {string} date - "YYYY-MM-DD"
 * @param {number} serviceDurationMins - how long the service takes
 * @returns {string[]} - array of available slots e.g. ["09:00", "09:30", "10:00"]
 */
async function getAvailableSlots(date, serviceDurationMins = 30) {
  // Get all booked slots for this date
  const bookedSlots = await Booking.find({
    date,
    status: { $in: ["confirmed", "pending"] },
  }).select("timeSlot");

  const bookedTimes = new Set(bookedSlots.map((b) => b.timeSlot));

  // Generate all possible slots
  const allSlots = generateSlots(OPENING_HOUR, CLOSING_HOUR, SLOT_DURATION);

  // Current time (for filtering past slots on today)
  const now = moment().tz(TZ);
  const isToday = date === now.format("YYYY-MM-DD");

  // Filter available slots
  const available = allSlots.filter((slot) => {
    // Skip already booked slots
    if (bookedTimes.has(slot)) return false;

    // Skip past slots if today
    if (isToday) {
      const slotTime = moment.tz(`${date} ${slot}`, "YYYY-MM-DD HH:mm", TZ);
      // Add 30-min buffer so people can't book for the next 30 mins
      if (slotTime.isBefore(now.add(30, "minutes"))) return false;
    }

    // Make sure there's enough time before closing
    const [h, m] = slot.split(":").map(Number);
    const slotEndMinutes = h * 60 + m + serviceDurationMins;
    if (slotEndMinutes > CLOSING_HOUR * 60) return false;

    return true;
  });

  return available;
}

/**
 * Generate all time slots between opening and closing
 */
function generateSlots(openHour, closeHour, durationMins) {
  const slots = [];
  let current = openHour * 60; // minutes from midnight
  const end = closeHour * 60;

  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += durationMins;
  }

  return slots;
}

module.exports = { getAvailableSlots, generateSlots };
