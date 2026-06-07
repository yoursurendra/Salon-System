/**
 * =====================================================
 * DASHBOARD API ROUTE
 * =====================================================
 * Provides aggregated data for the admin dashboard.
 * Protected by admin API key.
 */

const express = require("express");
const router = express.Router();
const moment = require("moment-timezone");
const Booking = require("../models/Booking");
const Customer = require("../models/Customer");
const { Service, Review } = require("../models/Service");

const TZ = process.env.SALON_TIMEZONE || "Asia/Kolkata";

// --- Auth Middleware ---
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.use(requireAdmin);

/**
 * GET /api/dashboard/overview
 * Main stats: today's bookings, revenue, customer count
 */
router.get("/overview", async (req, res) => {
  try {
    const today = moment().tz(TZ).format("YYYY-MM-DD");
    const thisMonth = moment().tz(TZ).startOf("month").toDate();

    const [
      todayBookings,
      totalCustomers,
      monthlyBookings,
      avgRating,
      totalReviews,
    ] = await Promise.all([
      Booking.find({ date: today, status: { $ne: "cancelled" } })
        .populate("customer", "name phone")
        .populate("service", "name price emoji")
        .sort("timeSlot"),

      Customer.countDocuments(),

      Booking.aggregate([
        { $match: { status: "completed", createdAt: { $gte: thisMonth } } },
        { $group: { _id: null, revenue: { $sum: "$pricePaid" }, count: { $sum: 1 } } },
      ]),

      Review.aggregate([
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),

      Review.countDocuments(),
    ]);

    const monthData = monthlyBookings[0] || { revenue: 0, count: 0 };
    const ratingData = avgRating[0] || { avg: 0, count: 0 };

    res.json({
      today: {
        date: today,
        bookings: todayBookings,
        count: todayBookings.length,
        revenue: todayBookings.reduce((sum, b) => sum + (b.pricePaid || 0), 0),
      },
      monthly: {
        revenue: monthData.revenue,
        bookings: monthData.count,
      },
      customers: {
        total: totalCustomers,
      },
      reviews: {
        average: Math.round(ratingData.avg * 10) / 10,
        total: totalReviews,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/revenue?days=30
 * Revenue chart data for last N days
 */
router.get("/revenue", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = moment().tz(TZ).subtract(days, "days").format("YYYY-MM-DD");

    const data = await Booking.aggregate([
      {
        $match: {
          date: { $gte: startDate },
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$date",
          revenue: { $sum: "$pricePaid" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(data.map((d) => ({
      date: d._id,
      revenue: d.revenue,
      bookings: d.bookings,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/dashboard/recent-reviews
 */
router.get("/recent-reviews", async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate("customer", "name phone")
      .populate({
        path: "booking",
        populate: { path: "service", select: "name" },
      })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
