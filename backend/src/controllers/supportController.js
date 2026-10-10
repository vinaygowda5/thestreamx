const { ok, err } = require("../utils/response");

// ─────────────────────────────────────────────────────────────────────────────
// Support chat. Answers come from, in order:
//   1) Anthropic (Claude)  if ANTHROPIC_API_KEY is set
//   2) OpenAI              if OPENAI_API_KEY is set
//   3) the built-in answers below (no API, no cost, never fails)
// If an AI provider is out of credit / down / misconfigured, the customer simply gets the built-in
// answer. Provider error text (billing links, key problems) is only logged on the server, never shown.
// ─────────────────────────────────────────────────────────────────────────────

// Keep these in sync with PLANS in frontend/src/Payment.jsx
const PLANS_TEXT =
  "Plans: Mobile ₹99/mo (1 screen, HD, mobile only) · Basic ₹149/mo (2 screens, Full HD) · " +
  "Premium ₹249/mo (4 screens, 4K HDR, no ads, downloads) · Annual ₹2499/yr (same as Premium, save 83%). " +
  "The Free plan has ads and plays up to 720p.";

const KNOWLEDGE = `You are the friendly customer-support assistant for StreamX, an Indian OTT streaming app (movies, series, live channels, sports, kids).
Facts (do not invent anything else):
- Login: enter email, receive a 6-digit code (check spam, wait 60 s, then resend). No password.
- ${PLANS_TEXT}
- Premium and Annual have no ads. Free, Mobile and Basic show ads during playback.
- Downloads: Premium/Annual only. Files are saved inside the StreamX app (Profile → Downloads), not in the phone gallery. Live channels cannot be downloaded.
- 1080p and 4K need Premium/Annual. Free viewers get up to 720p.
- Refunds: only if the plan is cancelled within 2 hours of payment. After 2 hours there is no refund.
- Live channels: if the picture lags, tap GO LIVE. Scheduled live shows its start time. Ended live channels disappear.
- Languages: titles with several languages show a language switcher under the player.
- Payment is by Razorpay (UPI, cards, net banking). Devices: Premium 4 screens, Basic 2, Mobile 1, Free 1.
If you cannot solve the problem, tell the user to press "Talk to a person" so our team can help. Reply in the user's language (English, Hindi or Kannada), 2-4 short sentences.`;

// ── Built-in answers ────────────────────────────────────────────────────────
const TOPICS = [
  { keys: ["human", "agent", "person", "complaint", "talk to", "call me", "representative", "not solved", "not resolved"],
    reply: "I'll connect you with our support team. Tap “Talk to a person” below, describe the problem, and we'll reply to your registered email or phone.", ticket: true },
  { keys: ["refund", "money back", "cancel"],
    reply: "Refunds are given only if you cancel within 2 hours of payment. After 2 hours there is no refund. If you want to cancel or ask about a charge, tap “Talk to a person” and our team will take care of it.", ticket: true },
  { keys: ["deducted", "payment failed", "paid but", "not activated", "transaction", "razorpay", "upi", "charged"],
    reply: "If money was deducted but your plan is not active: wait about 10 minutes, then log out and log in again. If it still isn't active, tap “Talk to a person” and include your payment ID or a screenshot.", ticket: true },
  { keys: ["delete account", "delete my", "my data", "privacy"],
    reply: "For account deletion or data requests, tap “Talk to a person” so our team can verify your account and help you.", ticket: true },
  { keys: ["download", "offline", "save video"],
    reply: "Downloads are a Premium/Annual feature. Open a movie, tap Download, and watch the percentage. The file is saved inside StreamX only (Profile → Downloads), not in your phone gallery. Live channels can't be downloaded.", plans: true },
  { keys: ["4k", "1080", "720", "quality", "resolution", "hd"],
    reply: "Free viewers get up to 720p. 1080p and 4K are for Premium and Annual members. Open ⚙ Settings in the player to change quality; “Auto” picks the best one for your internet.", plans: true },
  { keys: ["ads", "advert", "ad too long", "too many ads", "skip"],
    reply: "Free, Mobile and Basic plans show ads during playback. Premium and Annual are completely ad-free.", plans: true },
  { keys: ["price", "plan", "cost", "how much", "subscription", "subscribe", "premium", "upgrade", "buy", "annual", "₹"],
    reply: PLANS_TEXT + " You can pay with UPI, cards or net banking.", plans: true },
  { keys: ["device", "screen limit", "limit reached", "logout", "sign out", "another device"],
    reply: "Screens per plan: Free 1, Mobile 1, Basic 2, Premium/Annual 4. If you reached the limit, sign out on another device (Profile → Sign out) or upgrade your plan.", plans: true },
  { keys: ["otp", "code not", "verification", "login", "log in", "sign in", "email"],
    reply: "The 6-digit code goes to your email. Check the spam folder, wait 60 seconds, then tap Resend (only the newest code works). Make sure the email address has no typo. Still stuck? Tap “Talk to a person”.", ticket: true },
  { keys: ["live", "channel", "ended", "stuck", "lag"],
    reply: "On a live channel, tap GO LIVE to jump to the live moment if it lags. A channel with a start time opens when it begins, and ended channels disappear. If a live channel never plays, tell us its name via “Talk to a person”.", ticket: true },
  { keys: ["language", "audio", "subtitle", "dubbed"],
    reply: "If a title has more than one language, a language switcher appears under the player. Audio tracks and subtitles are in ⚙ Settings.", },
  { keys: ["install", "home screen", "add to home"],
    reply: "Android/desktop: Profile → Install App. iPhone: tap the Share button in your browser, then “Add to Home Screen”." },
  { keys: ["video", "play", "buffer", "loading", "black screen", "not working", "hang", "freez", "error", "unavailable"],
    reply: "Try this: 1) check your internet 2) reload the app 3) lower the quality in ⚙ Settings 4) try another browser. If only one title fails, it may be temporarily unavailable. Tell us its name via “Talk to a person”.", ticket: true },
];
const GREETING = /^(hi|hello|hey|namaste|namaskara|hii+|helo)\b/i;

function faqAnswer(text) {
  const t = String(text || "").toLowerCase();
  if (GREETING.test(t.trim()) && t.trim().length < 20)
    return { reply: "Hi! 👋 I can help with video problems, login/OTP, plans and payments, downloads, ads or live channels. What do you need?", ticket: false };
  for (const topic of TOPICS) if (topic.keys.some(k => t.includes(k))) return { reply: topic.reply, ticket: !!topic.ticket, plans: !!topic.plans };
  return { reply: "I'm not sure about that one. I can help with video problems, login/OTP, plans, payments, downloads, ads and live channels. For anything else, tap “Talk to a person” and our team will reply.", ticket: true };
}

// ── AI providers (optional) ──────────────────────────────────────────────────
async function askAnthropic(messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.SUPPORT_AI_MODEL || "claude-haiku-4-5-20251001", max_tokens: 300, system: KNOWLEDGE, messages }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("Anthropic: " + (d.error?.message || r.status));
  return d.content?.map(c => c.text || "").join("").trim();
}
async function askOpenAI(messages) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: process.env.SUPPORT_AI_MODEL || "gpt-4o-mini", max_tokens: 300, temperature: 0.4, messages: [{ role: "system", content: KNOWLEDGE }, ...messages] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("OpenAI: " + (d.error?.code || d.error?.message || r.status));
  return d.choices?.[0]?.message?.content?.trim();
}

async function chat(req, res) {
  const { messages: raw } = req.body || {};
  if (!Array.isArray(raw)) return err(res, "messages array required");
  let messages = raw
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 1000) }))
    .slice(-10);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return err(res, "Please type a question");
  const lastUser = [...messages].reverse().find(m => m.role === "user").content;

  const local = faqAnswer(lastUser);
  const wantsHuman = TOPICS[0].keys.some(k => lastUser.toLowerCase().includes(k));

  let reply = null, source = "faq";
  if (!wantsHuman) {                                     // people asking for a human always get the ticket flow
    try {
      if (process.env.ANTHROPIC_API_KEY) { reply = await askAnthropic(messages); source = "ai"; }
      else if (process.env.OPENAI_API_KEY) { reply = await askOpenAI(messages); source = "ai"; }
    } catch (e) {
      console.error("[support] AI provider failed, using built-in answers:", e.message);   // server log only
      reply = null; source = "faq";
    }
  }
  if (!reply) { reply = local.reply; source = "faq"; }
  const aiAdmitsDefeat = source === "ai" && /talk to a person|support team|contact support/i.test(reply);
  return ok(res, { reply, source, offerTicket: !!local.ticket || aiAdmitsDefeat || wantsHuman, showPlans: !!local.plans });
}

module.exports = { chat, faqAnswer };