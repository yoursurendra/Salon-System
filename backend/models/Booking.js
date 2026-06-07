/**
 * =====================================================
 * BOOKING MODEL
 * =====================================================
 * Represents a single salon appointment.
 * Handles slot locking to prevent double-bookings.
 */

const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    // --- Relationships ---
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    // --- Appointment Details ---
    date: {
      type: String, // "2024-01-15" - stored as string for easy querying
      required: true,
    },
    timeSlot: {
      type: String, // "10:00" - 24-hour format
      required: true,
    },
    // Full datetime for comparisons and sorting
    appointmentDateTime: {
      type: Date,
      required: true,
    },

    // --- Status Lifecycle ---
    // pending → confirmed → completed → cancelled
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "no_show"],
      default: "confirmed",
    },

    // --- Price (snapshot at booking time) ---
    // Store price at booking time so price changes don't affect history
    pricePaid: {
      type: Number,
      default: 0,
    },
    discountApplied: {
      type: Number,
      default: 0, // Percentage discount
    },

    // --- Automated Actions Tracking ---
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderSentAt: Date,

    reviewRequested: {
      type: Boolean,
      default: false,
    },
    reviewRequestedAt: Date,

    // --- Notes ---
    notes: String, // Staff notes
  },
  {
    timestamps: true,
  }
);

// Compound index: prevents duplicate bookings for same date+slot
BookingSchema.index({ date: 1, timeSlot: 1 }, { unique: true, sparse: false });

// Index for date queries (dashboard, reminders)
BookingSchema.index({ date: 1, status: 1 });
BookingSchema.index({ appointmentDateTime: 1 });
BookingSchema.index({ customer: 1 });

module.exports = mongoose.model("Booking", BookingSchema);
