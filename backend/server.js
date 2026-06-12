/**
 * server.js
 * =========
 * Railway-compatible Express server.
 *
 * KEY FIX vs the broken version:
 * ───────────────────────────────
 * BROKEN:  app.listen(PORT, callback)
 * FIXED:   app.listen(PORT, "0.0.0.0", callback)
 *
 * Without "0.0.0.0", Node.js may bind only to the loopback interface
 * (127.0.0.1) inside Railway's container. Railway's ingress proxy
 * lives outside the container and cannot reach loopback — so every
 * request returns 502 even though the process is alive.
 *
 * "0.0.0.0" tells Node.js to accept connections on ALL network
 * interfaces, including the container's external-facing eth0 that
 * Railway's proxy uses.
 */

require("dotenv").config();
const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const helmet     = require("helmet");
const morgan     = require("morgan");
const rateLimit  = require("express-rate-limit");

const whatsappRoutes  = require("./routes/whatsapp");
const bookingRoutes   = require("./routes/bookings");
const serviceRoutes   = require("./routes/services");
const customerRoutes  = require("./routes/customers");
const dashboardRoutes = require("./routes/dashboard");

const { startReminderCron }  = require("./services/reminderService");
const { startMarketingCron } = require("./services/marketingService");

const app = express();

// ── Read PORT from environment ────────────────────────────────────
// Railway injects PORT automatically. Never hardcode this.
// If PORT is missing for some reason, fall back to 8080.
const PORT = process.env.PORT || 8080;

// ── Startup diagnostics ───────────────────────────────────────────
// These log at process start so you can verify Railway picked up
// the correct values before the DB connection even begins.
console.log("🔧 Starting server...");
console.log("   NODE_ENV :", process.env.NODE_ENV || "not set");
console.log("   PORT     :", PORT);
console.log("   MONGODB  :", process.env.MONGODB_URI
  ? process.env.MONGODB_URI.replace(/:\/\/.*@/, "://<credentials>@")  // hide password in logs
  : "❌ MONGODB_URI not set"
);

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — applied to /api routes only, not /webhook
// (Meta sends webhook calls frequently; rate-limiting them causes missed messages)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// ── Health route ──────────────────────────────────────────────────
// MUST be defined BEFORE other routes.
// Railway and monitoring tools call this to check if the app is up.
// Also useful for your own debugging — visit /health in the browser.
app.get("/health", (req, res) => {
  res.json({
    status:    "OK",
    salon:     process.env.SALON_NAME || "not set",
    port:      PORT,
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()) + "s",
    mongodb:   mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ── Routes ────────────────────────────────────────────────────────
app.use("/webhook",        whatsappRoutes);
app.use("/api/bookings",   bookingRoutes);
app.use("/api/services",   serviceRoutes);
app.use("/api/customers",  customerRoutes);
app.use("/api/dashboard",  dashboardRoutes);

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// ── Database connection → then start server ───────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");

    // ── THE FIX: pass "0.0.0.0" as the host argument ─────────────
    //
    // app.listen(PORT)              ← may bind to 127.0.0.1 only → 502 on Railway
    // app.listen(PORT, "0.0.0.0")  ← binds to all interfaces    → Railway proxy works
    //
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server listening on 0.0.0.0:${PORT}`);
      console.log(`💇 Salon: ${process.env.SALON_NAME || "not set"}`);
      console.log(`🌐 Health: https://<your-railway-domain>/health`);
      console.log(`🔗 Webhook: https://<your-railway-domain>/webhook`);
    });

    // Start cron jobs after server is ready
    startReminderCron();
    startMarketingCron();
    console.log("⏰ Cron jobs started");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

module.exports = app;
