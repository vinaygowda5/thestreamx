const { ok, err } = require("../utils/response");

const THESTREAMX_CONTEXT = `You are THESTREAMX's friendly AI customer support assistant for an Indian OTT streaming platform.

About THESTREAMX:
- Indian OTT platform with Movies, Web Series, Live Channels, Sports, Kids content
- Login: Email OTP — user enters email, gets 6-digit code to inbox
- Plans: Free (1 screen, ads), Mobile ₹149/mo (1 screen HD), Basic ₹299/mo (2 screens FHD), Premium ₹499/mo (4 screens 4K HDR No Ads), Annual ₹999/yr (Save 83%)
- Premium: No ads, 4K HDR, 4 screens, downloads
- Payment via Razorpay (UPI, cards, net banking)
- Videos on Cloudflare R2 CDN

Common issues:
- "Video not playing" → Check internet, try lower quality in Settings
- "OTP not received" → Check spam folder, wait 60s, try resend
- "Device limit reached" → Sign out from another device or upgrade plan
- "Subscription not showing" → Log out and log back in
- "Can't find a movie" → Use Search, check if it needs Premium
- "Ad too long" → Upgrade to Premium for zero ads

Respond in same language user writes (Hindi or English). Keep responses 2-4 sentences.
If you cannot solve: "Please email support@thestreamx.in"`;

async function chat(req, res) {
  const { messages: rawMessages } = req.body;
  if (!rawMessages || !Array.isArray(rawMessages)) return err(res, "messages array required");
  // Keep only real user/assistant text, cap sizes, and never start with the assistant's greeting
  let messages = rawMessages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 1000) }))
    .slice(-10);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return err(res, "Please type a question");

  if (!process.env.OPENAI_API_KEY) {
    return err(res, "OPENAI_API_KEY is not set in the backend environment (Render → Environment)");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model:       "gpt-4o-mini",
        max_tokens:  300,
        temperature: 0.7,
        messages: [
          { role:"system", content: THESTREAMX_CONTEXT },
          ...messages.slice(-10),
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const code = data.error?.code;
      if (code === "invalid_api_key")      return err(res, "The OpenAI API key in the backend environment is invalid");
      if (code === "insufficient_quota")   return err(res, "OpenAI account has no credits");
      return err(res, data.error?.message || "OpenAI error");
    }

    const reply = data.choices?.[0]?.message?.content || "Sorry, I could not respond. Please try again.";
    return ok(res, { reply });

  } catch(e) {
    return err(res, "Support chat failed: " + e.message, 500);
  }
}

module.exports = { chat };