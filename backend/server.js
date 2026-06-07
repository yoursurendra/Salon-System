/**
 * =====================================================
 * SALON MANAGEMENT SYSTEM - Main Server
 * =====================================================
 * Entry point for the Node.js/Express backend.
 * Handles routing, middleware, DB connection, and cron jobs.
 */

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

// --- Import Routes ---
const whatsappRoutes = require("./routes/whatsapp");
const bookingRoutes = require("./routes/bookings");
const serviceRoutes = require("./routes/services");
const customerRoutes = require("./routes/customers");
const dashboardRoutes = require("./routes/dashboard");

// --- Import Cron Jobs ---
const { startReminderCron } = require("./services/reminderService");
const { startMarketingCron } = require("./services/marketingService");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE SETUP
// =====================================================

// Security headers
app.use(helmet());

// CORS - allow your frontend domain in production
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://yoursalon.com", "https://admin.yoursalon.com"]
    : "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
}));

// Request logging
app.use(morgan("dev"));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// =====================================================
// ROUTES
// =====================================================

// WhatsApp Webhook (no rate limit - Meta sends frequently)
app.use("/webhook", whatsappRoutes);

// REST API routes
app.use("/api/bookings", bookingRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    salon: process.env.SALON_NAME,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// =====================================================
// DATABASE CONNECTION
// =====================================================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");

    // Start the Express server after DB connects
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`💇 Salon: ${process.env.SALON_NAME}`);
      console.log(`🌐 Webhook URL: http://localhost:${PORT}/webhook`);
    });

    // Start automated cron jobs
    startReminderCron();    // Sends appointment reminders
    startMarketingCron();   // Sends re-engagement offers
    console.log("⏰ Cron jobs started");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

module.exports = app;
