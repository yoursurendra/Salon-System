const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer");
const Booking = require("../models/Booking");

function requireAdmin(req, res, next) {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_SECRET_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

router.use(requireAdmin);

// GET all customers with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search;

    const filter = search
      ? { $or: [{ name: new RegExp(search, "i") }, { phone: new RegExp(search, "i") }] }
      : {};

    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Customer.countDocuments(filter);
    res.json({ customers, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET customer history
router.get("/:id/history", async (req, res) => {
  try {
    const bookings = await Booking.find({ customer: req.params.id })
      .populate("service", "name price emoji")
      .sort({ date: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update customer notes/tags
router.put("/:id", async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
