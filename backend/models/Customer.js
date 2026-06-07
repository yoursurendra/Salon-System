/**
 * =====================================================
 * CUSTOMER MODEL
 * =====================================================
 * Stores customer profile, visit history, preferences,
 * and marketing automation state.
 */

const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema(
  {
    // --- Identity ---
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: +919876543210
    },

    // --- WhatsApp State Machine ---
    // Tracks where the customer is in the booking conversation
    conversationState: {
      type: String,
      enum: [
        "idle",           // No active conversation
        "selecting_service",  // Viewing service menu
        "selecting_date",
        "selecting_slot",     // Choosing a time slot
        "confirming",         // Confirming booking details
        "awaiting_review",  // Asked for review after appointment
      ],
      default: "idle",
    },

    // Temporary data held during booking conversation
    pendingBooking: {
      serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
      date: String,         // "2024-01-15"
      slot: String,         // "10:00"
    },

    // --- Visit Tracking ---
    lastVisitDate: {
      type: Date,
      default: null,
    },
    totalVisits: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },

    // --- Marketing Automation ---
    // Prevent sending the same marketing message multiple times
    lastMarketingMessageDate: {
      type: Date,
      default: null,
    },
    marketingOptOut: {
      type: Boolean,
      default: false,
    },

    // --- Tags ---
    // e.g. ["loyal", "vip", "new"]
    tags: [String],

    notes: String, // Internal notes by salon staff
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Index for fast lookups by phone (used in every WhatsApp message)
CustomerSchema.index({ phone: 1 });

// Virtual: days since last visit
CustomerSchema.virtual("daysSinceLastVisit").get(function () {
  if (!this.lastVisitDate) return null;
  const now = new Date();
  const diff = now - this.lastVisitDate;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model("Customer", CustomerSchema);
