/**
 * =====================================================
 * DATABASE SEED SCRIPT — SalonIQ
 * =====================================================
 * Populates your MongoDB database with:
 *   - 8 salon services (menu items)
 *   - 5 sample customers
 *   - 6 bookings (4 today + 2 yesterday)
 *
 * HOW TO RUN (from inside the backend folder):
 *   node config/seed.js
 *
 * SAFE TO RE-RUN: clears old data before inserting.
 * =====================================================
 */

// path.resolve(__dirname) correctly finds .env regardless of
// which folder you run the script from.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { Service } = require("../models/Service");
const Customer    = require("../models/Customer");
const Booking     = require("../models/Booking");

// ─────────────────────────────────────────
// 1. SERVICES  (8 items — shown in WhatsApp bot menu)
// ─────────────────────────────────────────
const SERVICES = [
  {
    name:            "Haircut",
    nameHindi:       "बाल कटाई",
    description:     "Classic haircut with blow-dry styling",
    price:           100,
    durationMinutes: 30,
    emoji:           "✂️",
    category:        "hair",
    displayOrder:    1,
    isActive:        true,
  },
  {
    name:            "Beard Trim",
    nameHindi:       "दाढ़ी",
    description:     "Neat beard shaping and trimming",
    price:           60,
    durationMinutes: 20,
    emoji:           "🪒",
    category:        "beard",
    displayOrder:    2,
    isActive:        true,
  },
  {
    name:            "Hair + Beard Combo",
    nameHindi:       "हेयर + दाढ़ी",
    description:     "Complete grooming package — haircut + beard",
    price:           150,
    durationMinutes: 45,
    emoji:           "💈",
    category:        "combo",
    displayOrder:    3,
    isActive:        true,
  },
  {
    name:            "Facial",
    nameHindi:       "फेशियल",
    description:     "Deep cleansing facial treatment",
    price:           250,
    durationMinutes: 45,
    emoji:           "🧖",
    category:        "skin",
    displayOrder:    4,
    isActive:        true,
  },
  {
    name:            "Head Massage",
    nameHindi:       "सिर मालिश",
    description:     "Relaxing champi with coconut oil",
    price:           80,
    durationMinutes: 20,
    emoji:           "💆",
    category:        "hair",
    displayOrder:    5,
    isActive:        true,
  },
  {
    name:            "Shave",
    nameHindi:       "शेव",
    description:     "Traditional blade shave with hot towel",
    price:           50,
    durationMinutes: 15,
    emoji:           "🪒",
    category:        "beard",
    displayOrder:    6,
    isActive:        true,
  },
  {
    name:            "Hair Color",
    nameHindi:       "बाल रंग",
    description:     "Full hair coloring with quality dye",
    price:           400,
    durationMinutes: 60,
    emoji:           "🎨",
    category:        "hair",
    displayOrder:    7,
    isActive:        true,
  },
  {
    name:            "D-tan",
    nameHindi:       "डी-टैन",
    description:     "Skin de-tanning and brightening treatment",
    price:           200,
    durationMinutes: 30,
    emoji:           "✨",
    category:        "skin",
    displayOrder:    8,
    isActive:        true,
  },
];

// ─────────────────────────────────────────
// 2. CUSTOMERS  (5 sample customers)
// ─────────────────────────────────────────
const CUSTOMERS = [
  {
    name:              "Rahul Sharma",
    phone:             "+919876543201",
    conversationState: "idle",
    totalVisits:       8,
    totalSpent:        1200,
    lastVisitDate:     new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),   // 5 days ago
    marketingOptOut:   false,
    tags:              [],
  },
  {
    name:              "Amit Kumar",
    phone:             "+919876543202",
    conversationState: "idle",
    totalVisits:       3,
    totalSpent:        450,
    lastVisitDate:     new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),  // 35 days ago — gets marketing offer
    marketingOptOut:   false,
    tags:              [],
  },
  {
    name:              "Vijay Singh",
    phone:             "+919876543203",
    conversationState: "idle",
    totalVisits:       12,
    totalSpent:        1800,
    lastVisitDate:     new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),   // 2 days ago — VIP
    marketingOptOut:   false,
    tags:              ["vip", "loyal"],
  },
  {
    name:              "Deepak Verma",
    phone:             "+919876543204",
    conversationState: "idle",
    totalVisits:       1,
    totalSpent:        100,
    lastVisitDate:     new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),  // 45 days ago — inactive
    marketingOptOut:   false,
    tags:              ["new"],
  },
  {
    name:              "Suresh Patel",
    phone:             "+919876543205",
    conversationState: "idle",
    totalVisits:       6,
    totalSpent:        900,
    lastVisitDate:     new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),  // 10 days ago
    marketingOptOut:   false,
    tags:              [],
  },
];

// ─────────────────────────────────────────
// MAIN SEED FUNCTION
// ─────────────────────────────────────────
async function seed() {
  // Guard: make sure .env loaded correctly
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not found in environment.");
    console.error("   Make sure .env exists in the backend folder.");
    console.error("   Run: copy .env.example .env  (then fill in the values)");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB...");
  console.log("   URI:", process.env.MONGODB_URI);

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected\n");

    // ── Step 1: Clear old data ──────────────────
    console.log("🗑️  Clearing old data...");
    await Booking.deleteMany({});
    await Customer.deleteMany({});
    await Service.deleteMany({});
    console.log("   Cleared bookings, customers, services\n");

    // ── Step 2: Insert services ─────────────────
    console.log("✂️  Inserting 8 services...");
    const services = await Service.insertMany(SERVICES);
    services.forEach((s) =>
      console.log(`   ${s.emoji}  ${s.name.padEnd(20)} ₹${s.price}  (${s.durationMinutes} mins)`)
    );
    console.log(`✅ ${services.length} services inserted\n`);

    // ── Step 3: Insert customers ────────────────
    console.log("👥 Inserting 5 customers...");
    const customers = await Customer.insertMany(CUSTOMERS);
    customers.forEach((c) =>
      console.log(`   ${c.name.padEnd(18)} ${c.phone}  visits:${c.totalVisits}`)
    );
    console.log(`✅ ${customers.length} customers inserted\n`);

    // ── Step 4: Insert bookings ─────────────────
    // Always use today and yesterday so data is always fresh
    const todayStr     = new Date().toISOString().split("T")[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    // Helper: build IST-aware Date from date string + "HH:MM"
    function toIST(dateStr, slot) {
      // +05:30 offset keeps the time correct in IST
      return new Date(`${dateStr}T${slot}:00.000+05:30`);
    }

    // Each entry references actual inserted customer/service objects
    // so we can use their _id AND their name/price in the log below.
    const bookingsRaw = [
      // ── Today ──────────────────────────────
      { c: customers[0], s: services[0], date: todayStr,     slot: "09:00", status: "confirmed"  },
      { c: customers[2], s: services[2], date: todayStr,     slot: "10:00", status: "confirmed"  },
      { c: customers[4], s: services[3], date: todayStr,     slot: "11:30", status: "confirmed"  },
      { c: customers[1], s: services[1], date: todayStr,     slot: "14:00", status: "confirmed"  },
      // ── Yesterday (completed) ──────────────
      { c: customers[0], s: services[0], date: yesterdayStr, slot: "10:00", status: "completed"  },
      { c: customers[2], s: services[3], date: yesterdayStr, slot: "15:00", status: "completed"  },
    ];

    const bookingDocs = bookingsRaw.map((b) => ({
      customer:            b.c._id,
      service:             b.s._id,
      date:                b.date,
      timeSlot:            b.slot,
      appointmentDateTime: toIST(b.date, b.slot),
      status:              b.status,
      pricePaid:           b.s.price,
      discountApplied:     0,
      reminderSent:        b.status === "completed",
      reviewRequested:     b.status === "completed",
    }));

    console.log("📅 Inserting 6 bookings...");
    const bookings = await Booking.insertMany(bookingDocs);
    bookingsRaw.forEach((b, i) =>
      console.log(
        `   ${b.date}  ${b.slot}  ${b.c.name.padEnd(16)}  ${b.s.name.padEnd(20)}  [${b.status}]`
      )
    );
    console.log(`✅ ${bookings.length} bookings inserted\n`);

    // ── Done ─────────────────────────────────────
    console.log("══════════════════════════════════════════════");
    console.log("🎉 Database seeded successfully!");
    console.log("══════════════════════════════════════════════");
    console.log(`   Services  : ${services.length}`);
    console.log(`   Customers : ${customers.length}`);
    console.log(`   Bookings  : ${bookings.length}`);
    console.log(`              (${todayStr}: 4 confirmed)`);
    console.log(`              (${yesterdayStr}: 2 completed)`);
    console.log("\n🚀 Next step — start the server:");
    console.log("   npm run dev\n");

    await mongoose.disconnect();
    process.exit(0);

  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);

    if (err.message.includes("ECONNREFUSED")) {
      console.error("\n💡 MongoDB is not running. Fix:");
      console.error("   Open Command Prompt as Administrator → run:");
      console.error("   net start MongoDB");
    } else if (err.code === 11000) {
      console.error("\n💡 Duplicate key error. Fix:");
      console.error("   Open MongoDB Compass → delete the 'salon_db' database → re-run seed.");
    } else if (err.message.includes("Cannot read") || err.message.includes("is not a constructor")) {
      console.error("\n💡 Model import error. Check these files exist and export correctly:");
      console.error("   backend/models/Service.js  — must export { Service }");
      console.error("   backend/models/Customer.js — must export Customer");
      console.error("   backend/models/Booking.js  — must export Booking");
    }

    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

seed();