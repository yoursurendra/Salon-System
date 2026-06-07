/**
 * =====================================================
 * AI SERVICE (Powered by Claude)
 * =====================================================
 * Uses Anthropic's Claude API to generate:
 * - Smart replies for unknown messages
 * - Review response suggestions for the salon owner
 * - Natural, friendly conversation in Hindi/English
 */

const Anthropic = require("@anthropic-ai/sdk");

let anthropic;
try {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (e) {
  console.warn("⚠️  Anthropic SDK not initialized — AI features disabled");
}

const SALON_NAME = process.env.SALON_NAME || "Our Salon";
const SALON_PHONE = process.env.SALON_PHONE || "";

/**
 * Generate a smart, context-aware reply for WhatsApp
 *
 * @param {string} userMessage - what the customer said
 * @param {string} customerName - for personalization
 * @param {string} mode - "chat" | "review_response"
 */
async function generateAIReply(userMessage, customerName = "Friend", mode = "chat") {
  if (!anthropic) {
    return getDefaultReply(mode, customerName);
  }

  try {
    let systemPrompt;

    if (mode === "review_response") {
      systemPrompt = `You are a friendly salon owner at ${SALON_NAME} in India. 
Write a warm, grateful, and professional reply to a customer review in 1-2 sentences.
Use simple English with occasional Hindi words like "Shukriya" or "Dhanyawad" naturally.
Keep it personal and genuine. Never use emojis excessively.`;
    } else {
      systemPrompt = `You are a helpful WhatsApp assistant for ${SALON_NAME}, a salon in India.
Your job is to help customers with their queries in a friendly, warm way.
Keep replies SHORT (2-3 lines max) and use simple English or mix in Hindi naturally.
Always end by suggesting they type BOOK to make an appointment.
Salon phone: ${SALON_PHONE}.
Never make up prices or services — direct them to type MENU to see services.
Be warm and use "ji" suffix occasionally for politeness.`;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Customer name: ${customerName}\nMessage: ${userMessage}`,
        },
      ],
    });

    return response.content[0].text.trim();
  } catch (error) {
    console.error("❌ AI generation error:", error.message);
    return getDefaultReply(mode, customerName);
  }
}

/**
 * Fallback replies when AI is unavailable
 */
function getDefaultReply(mode, customerName) {
  if (mode === "review_response") {
    return `Thank you so much for your feedback, ${customerName} ji! We truly appreciate your kind words. 🙏`;
  }
  return (
    `Namaste ${customerName} ji! 🙏 Welcome to ${SALON_NAME}.\n\n` +
    `Type *MENU* to see our services or *BOOK* to make an appointment.\n` +
    `For urgent queries, call us at ${SALON_PHONE}.`
  );
}

module.exports = { generateAIReply };
