/**
 * =====================================================
 * BOOKINGS API ROUTE
 * =====================================================
 */

const express = require("express");
const router = express.Router();
const moment = require("moment-timezone");
const Booking = require("../models/Booking");
const { getAvailableSlots } = require("../services/slotService");

const TZ = process.env.SALON_TIMEZONE || "Asia/Kolkata";

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== process.env.ADMIN_SECRET_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// GET /api/bookings?date=2024-01-15
router.get("/", requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) filter.date = req.query.date;
    if (req.query.status) filter.status = req.query.status;

    const bookings = await Booking.find(filter)
      .populate("customer", "name phone")
      .populate("service", "name price emoji durationMinutes")
      .sort("date timeSlot");

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/slots?date=2024-01-15&duration=30
router.get("/slots", async (req, res) => {
  try {
    const { date, duration } = req.query;
    if (!date) return res.status(400).json({ error: "date is required" });
    const slots = await getAvailableSlots(date, parseInt(duration) || 30);
    res.json({ date, slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bookings/:id/status
router.put("/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("customer service");
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
