/**
 * =====================================================
 * REMINDER SERVICE
 * =====================================================
 * Cron job that runs every 15 minutes to check for
 * upcoming appointments and send WhatsApp reminders.
 *
 * Logic: Find bookings where appointment is 2 hours away
 * AND reminder hasn't been sent yet.
 */

const cron = require("node-cron");
const moment = require("moment-timezone");
const Booking = require("../models/Booking");
const Customer = require("../models/Customer");
const { Service } = require("../models/Service");
const wa = require("./whatsappService");

const TZ = process.env.SALON_TIMEZONE || "Asia/Kolkata";

/**
* Start the reminder cron job
* Runs every 15 minutes: every 15 minutes
*/
function startReminderCron() {
  cron.schedule("*/15 * * * *", async () => {
    console.log("⏰ [REMINDER CRON] Checking for upcoming appointments...");
    await sendUpcomingReminders();
  }, { timezone: TZ });

  // Also run a daily job at 8 PM to mark no-shows
  cron.schedule("0 20 * * *", async () => {
    await markNoShows();
  }, { timezone: TZ });

  // Run a job at 9 PM to request reviews for completed appointments
  cron.schedule("0 21 * * *", async () => {
    await requestReviewsForCompletedAppointments();
  }, { timezone: TZ });
}

/**
 * Send reminders for appointments happening in ~2 hours
 */
async function sendUpcomingReminders() {
  try {
    const now = moment().tz(TZ);
    // Target window: appointments starting in 1h45m to 2h15m from now
    const windowStart = now.clone().add(105, "minutes"); // 1h45m
    const windowEnd = now.clone().add(135, "minutes");   // 2h15m

    const bookings = await Booking.find({
      appointmentDateTime: {
        $gte: windowStart.toDate(),
        $lte: windowEnd.toDate(),
      },
      status: "confirmed",
      reminderSent: false,
    }).populate("customer service");

    console.log(`📨 [REMINDER] Found ${bookings.length} appointments to remind`);

    for (const booking of bookings) {
      try {
        await wa.sendReminder(
          booking.customer.phone,
          booking,
          booking.customer,
          booking.service
        );

        // Mark reminder as sent
        booking.reminderSent = true;
        booking.reminderSentAt = new Date();
        await booking.save();

        console.log(`✅ Reminder sent to ${booking.customer.name} (${booking.customer.phone})`);
      } catch (err) {
        console.error(`❌ Failed to send reminder to ${booking.customer.phone}:`, err.message);
      }
    }
  } catch (error) {
    console.error("❌ Reminder cron error:", error.message);
  }
}

/**
 * Mark past confirmed bookings as "no_show" or "completed"
 * Runs at 8 PM daily — marks all past-day appointments
 */
async function markNoShows() {
  try {
    const today = moment().tz(TZ).format("YYYY-MM-DD");
    const yesterday = moment().tz(TZ).subtract(1, "day").format("YYYY-MM-DD");

    // In a real system, staff would mark completed via dashboard
    // This auto-marks as "completed" for automation purposes
    const result = await Booking.updateMany(
      {
        date: yesterday,
        status: "confirmed",
      },
      { $set: { status: "completed" } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ [AUTO] Marked ${result.modifiedCount} appointments as completed`);

      // Update customer last visit dates
      const completedBookings = await Booking.find({
        date: yesterday,
        status: "completed",
      }).populate("customer service");

      for (const booking of completedBookings) {
        await Customer.findByIdAndUpdate(booking.customer._id, {
          lastVisitDate: new Date(),
          $inc: { totalVisits: 1, totalSpent: booking.pricePaid },
        });
      }
    }
  } catch (error) {
    console.error("❌ No-show marking error:", error.message);
  }
}

/**
 * Request reviews for appointments completed today
 */
async function requestReviewsForCompletedAppointments() {
  try {
    const today = moment().tz(TZ).format("YYYY-MM-DD");

    const bookings = await Booking.find({
      date: today,
      status: "completed",
      reviewRequested: false,
    }).populate("customer service");

    for (const booking of bookings) {
      try {
        await wa.sendReviewRequest(
          booking.customer.phone,
          booking.customer.name,
          booking.service.name
        );

        booking.reviewRequested = true;
        booking.reviewRequestedAt = new Date();
        booking.customer.conversationState = "awaiting_review";

        await booking.save();
        await booking.customer.save();

        console.log(`⭐ Review request sent to ${booking.customer.name}`);
      } catch (err) {
        console.error(`❌ Failed review request for ${booking.customer.phone}:`, err.message);
      }
    }
  } catch (error) {
    console.error("❌ Review request error:", error.message);
  }
}

module.exports = { startReminderCron };
