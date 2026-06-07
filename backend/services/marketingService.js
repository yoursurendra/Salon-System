/**
 * =====================================================
 * MARKETING AUTOMATION SERVICE
 * =====================================================
 * Sends re-engagement offers to inactive customers.
 * Runs daily and checks who hasn't visited in X days.
 *
 * Strategy: "It's been 30 days, get 10% off!"
 */

const cron = require("node-cron");
const moment = require("moment-timezone");
const Customer = require("../models/Customer");
const wa = require("./whatsappService");

const TZ = process.env.SALON_TIMEZONE || "Asia/Kolkata";
const INACTIVE_DAYS = parseInt(process.env.INACTIVE_DAYS_TRIGGER) || 30;
const DISCOUNT = parseInt(process.env.DISCOUNT_PERCENTAGE) || 10;

/**
 * Start the marketing cron job
 * Runs every day at 11 AM
 */
function startMarketingCron() {
  cron.schedule("0 11 * * *", async () => {
    console.log("📣 [MARKETING CRON] Running re-engagement campaign...");
    await runReengagementCampaign();
  }, { timezone: TZ });
}

/**
 * Find inactive customers and send them offers
 */
async function runReengagementCampaign() {
  try {
    const cutoffDate = moment().tz(TZ).subtract(INACTIVE_DAYS, "days").toDate();

    // Also don't re-send marketing to the same person within 30 days
    const lastMarketingCutoff = moment().tz(TZ).subtract(30, "days").toDate();

    const inactiveCustomers = await Customer.find({
      marketingOptOut: { $ne: true },
      lastVisitDate: {
        $lt: cutoffDate,
        $ne: null, // Must have visited at least once
      },
      $or: [
        { lastMarketingMessageDate: null },
        { lastMarketingMessageDate: { $lt: lastMarketingCutoff } },
      ],
    }).limit(50); // Process max 50 at a time to avoid API rate limits

    console.log(`📣 [MARKETING] Found ${inactiveCustomers.length} inactive customers`);

    for (const customer of inactiveCustomers) {
      try {
        const daysSince = Math.floor(
          (new Date() - customer.lastVisitDate) / (1000 * 60 * 60 * 24)
        );

        await wa.sendMarketingOffer(
          customer.phone,
          customer.name,
          daysSince,
          DISCOUNT
        );

        // Record that we sent marketing to this customer today
        customer.lastMarketingMessageDate = new Date();
        await customer.save();

        console.log(`📤 Marketing sent to ${customer.name} (${daysSince} days inactive)`);

        // Small delay between messages to avoid WhatsApp rate limiting
        await sleep(1000);
      } catch (err) {
        console.error(`❌ Marketing failed for ${customer.phone}:`, err.message);
      }
    }

    console.log("✅ [MARKETING] Campaign complete");
  } catch (error) {
    console.error("❌ Marketing campaign error:", error.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startMarketingCron, runReengagementCampaign };
