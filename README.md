# 💈 AI-Powered Salon Management System
### WhatsApp-First, India-Ready, Fully Automated

> Built for small Indian salons to automate bookings, marketing, and customer management via WhatsApp.

---

## 📋 Table of Contents
1. [System Overview](#-system-overview)
2. [Architecture](#-architecture)
3. [Quick Start](#-quick-start)
4. [WhatsApp Setup](#-whatsapp-cloud-api-setup)
5. [API Endpoints](#-api-endpoints)
6. [Database Schema](#-database-schema)
7. [Bot Conversation Flow](#-bot-conversation-flow)
8. [Deployment Guide](#-deployment-to-production)
9. [Selling to Salons](#-how-to-sell-this-system)

---

## 🏗 System Overview

```
Customer WhatsApp → Meta Cloud API → Your Server → MongoDB
                                          ↓
                              Admin Dashboard (Browser)
                                          ↓
                              Cron Jobs (Reminders + Marketing)
```

### What's Automated:
| Feature | How |
|---------|-----|
| Booking via WhatsApp | State machine conversation bot |
| Appointment Reminders | Cron job every 15 mins |
| Post-Visit Reviews | Auto-sent at 9 PM |
| Re-engagement Offers | Daily cron at 11 AM |
| Smart Replies | Claude AI (Anthropic) |
| Double-booking Prevention | MongoDB unique index |

---

## ⚡ Quick Start (Local Development)

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas free tier)
- ngrok (for WhatsApp webhook testing)

### Steps

```bash
# 1. Clone / download project
cd salon-system/backend

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your values

# 4. Seed database with sample data
npm run seed

# 5. Start server
npm run dev

# 6. Expose local server for WhatsApp webhook
ngrok http 3000
# Copy the https URL — you'll need it for Meta setup
```

---

## 📱 WhatsApp Cloud API Setup

### Step 1: Create Meta App
1. Go to https://developers.facebook.com/apps/
2. Click **Create App** → Select **Business**
3. Add **WhatsApp** product to your app

### Step 2: Get Your Credentials
From the WhatsApp → API Setup page, copy:
- **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- **Access Token** → `WHATSAPP_TOKEN` (generate permanent token)
- **Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`

### Step 3: Configure Webhook
1. In Meta App → WhatsApp → Configuration → Webhooks
2. **Callback URL:** `https://your-ngrok-url.ngrok.io/webhook`
3. **Verify Token:** Same as your `WHATSAPP_VERIFY_TOKEN` in `.env`
4. Subscribe to: `messages`

### Step 4: Test
Send "hi" to your WhatsApp Business number — the bot should reply!

---

## 🔌 API Endpoints

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/webhook` | WhatsApp webhook verification |
| POST | `/webhook` | Incoming WhatsApp messages |
| GET | `/api/services` | List active services |
| GET | `/api/bookings/slots?date=YYYY-MM-DD&duration=30` | Available time slots |

### Admin Endpoints (require `x-admin-key` header)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/overview` | Today's stats + monthly summary |
| GET | `/api/dashboard/revenue?days=30` | Revenue chart data |
| GET | `/api/dashboard/recent-reviews` | Latest customer reviews |
| GET | `/api/bookings?date=YYYY-MM-DD` | List bookings |
| PUT | `/api/bookings/:id/status` | Update booking status |
| GET | `/api/customers` | Customer list |
| GET | `/api/customers/:id/history` | Customer visit history |
| POST | `/api/services` | Add new service |
| PUT | `/api/services/:id` | Edit service |

---

## 🗃 Database Schema

### Customer
```
phone (unique)      → WhatsApp number, primary identifier
name                → From WhatsApp profile
conversationState   → idle | selecting_service | selecting_slot | confirming | awaiting_review
pendingBooking      → { serviceId, date, slot } during conversation
lastVisitDate       → For marketing automation
totalVisits         → Visit count
totalSpent          → Revenue from this customer
marketingOptOut     → Respects opt-out
lastMarketingDate   → Prevents spam
```

### Booking
```
customer (ref)      → Customer ObjectId
service (ref)       → Service ObjectId
date                → "YYYY-MM-DD"
timeSlot            → "HH:MM" (24-hour)
appointmentDateTime → Full Date object for cron queries
status              → confirmed | completed | cancelled | no_show
pricePaid           → Snapshot of price at booking time
reminderSent        → Boolean, prevents duplicate reminders
reviewRequested     → Boolean, tracks review flow
```

### Service
```
name                → "Haircut"
nameHindi           → "बाल कटाई" (optional)
price               → In INR (₹)
durationMinutes     → Service duration
emoji               → Used in WhatsApp messages
isActive            → Soft delete
displayOrder        → Menu ordering
category            → hair | beard | skin | combo
```

### Review
```
booking (ref)       → Linked booking
customer (ref)      → Who reviewed
rating              → 1-5 stars
reviewText          → Optional text
aiReplySuggestion   → Claude-generated reply for owner
```

---

## 💬 Bot Conversation Flow

```
Customer: "Hi"
Bot: [Service Menu List]
    ✂️ Haircut - ₹100 • 30 mins
    🪒 Beard Trim - ₹60 • 20 mins
    💈 Hair + Beard - ₹150 • 45 mins
    ...

Customer: [Selects "Haircut"]
Bot: [Date picker buttons]
    📅 Today (15 Jan 2024)
    📅 Tomorrow (16 Jan 2024)

Customer: [Selects Today]
Bot: [Time slot list]
    🌅 Morning: 9:00 AM, 9:30 AM, 10:00 AM...
    🌆 Evening: 2:00 PM, 2:30 PM, 3:00 PM...

Customer: [Selects 10:00 AM]
Bot: 📋 Booking Summary
    ✂️ Haircut | 15 Jan | 10:00 AM | ₹100
    [✅ Confirm] [❌ Cancel]

Customer: [Confirms]
Bot: ✅ Booking Confirmed! (with all details)

-- 2 hours before appointment --
Bot: ⏰ Reminder! Your appointment is in 2 hours...

-- After appointment --
Bot: ⭐ How was your experience? [Rate 5★] [Rate 4★] [Rate 3★]

-- After 30 days of inactivity --
Bot: 💇 We miss you! 10% OFF on your next visit [Book Now]
```

---

## 🚀 Deployment to Production

### Option A: Railway (Recommended, Free Tier)
```bash
# 1. Push code to GitHub
# 2. Go to railway.app → New Project → Deploy from GitHub
# 3. Add environment variables in Railway dashboard
# 4. Railway provides auto HTTPS URL for webhook
```

### Option B: Render
```bash
# 1. Push to GitHub
# 2. render.com → New Web Service → Connect repo
# 3. Build Command: npm install
# 4. Start Command: node server.js
# 5. Add env vars → Auto-deploys on push
```

### Option C: VPS (DigitalOcean $4/mo)
```bash
# On your VPS:
apt update && apt install nodejs npm nginx certbot -y

# Clone your code
git clone your-repo
cd salon-system/backend
npm install
cp .env.example .env && nano .env  # Fill in values

# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name salon
pm2 startup && pm2 save

# Nginx reverse proxy
# Configure /etc/nginx/sites-available/salon
# Point to localhost:3000
# Run certbot for free SSL
```

### MongoDB: Use MongoDB Atlas (Free 512MB)
1. atlas.mongodb.com → Create free cluster
2. Get connection string → paste in `MONGODB_URI`

---

## 💼 How to Sell This System

### Target Customers
- Barbershops and salons in Tier 1, 2, 3 Indian cities
- Salons with 5-50 clients/day
- Owners who use WhatsApp for business already

### Pricing Model (Suggested)
| Plan | Price | What's Included |
|------|-------|-----------------|
| Starter | ₹1,999/month | WhatsApp bot + Bookings + Reminders |
| Growth | ₹3,499/month | + Marketing automation + Reviews + Dashboard |
| Premium | ₹5,999/month | + AI replies + Priority support + Custom branding |

### Key Sales Pitch Points
1. **"Never miss a booking"** — Bot works 24/7, even when shop is closed
2. **"Reduce no-shows by 60%"** — Automated WhatsApp reminders
3. **"Get repeat customers"** — Auto re-engagement after 30 days
4. **"No app to download"** — Works on WhatsApp which they already use
5. **"See your business live"** — Dashboard shows daily revenue & bookings

### Demo Script
> "Bhai, ek baar apna number do, main abhi demo karata hoon. 
> Aap WhatsApp karo salon ko, bot khud sab handle kar lega."

### Setup Fee: ₹5,000 one-time (domain, hosting setup, WhatsApp API setup)

---

## 🔧 Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SALON_OPENING_HOUR` | 9 | Opening time (24h) |
| `SALON_CLOSING_HOUR` | 20 | Closing time (24h) |
| `SLOT_DURATION_MINUTES` | 30 | Appointment slot size |
| `INACTIVE_DAYS_TRIGGER` | 30 | Days before re-engagement |
| `DISCOUNT_PERCENTAGE` | 10 | Marketing offer discount |
| `SALON_TIMEZONE` | Asia/Kolkata | IST timezone |

---

## 📞 Support

Built with ❤️ for Indian salon owners.
All amounts in INR (₹). Timezone: IST (Asia/Kolkata).
