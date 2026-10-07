const sb        = require("../models/db");
const { signToken } = require("../utils/jwt");
const { ok, err }   = require("../utils/response");
const { Resend }    = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// Store OTPs in memory (use Redis in production)
const otpStore = new Map(); // email -> { code, expires }

// STEP 1 — Send OTP to email
async function sendOTP(req, res) {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err(res, "Valid email required");
  }

  const code    = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStore.set(email.toLowerCase(), { code, expires });

  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL || "noreply@streamx.in",
      to:   email,
      subject: `${code} is your StreamX verification code`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#07070c;color:#fff;border-radius:12px;">
          <div style="font-size:28px;font-weight:900;margin-bottom:8px;">
            <span style="color:#e50914">STREAM</span>X
          </div>
          <div style="font-size:16px;color:#aaa;margin-bottom:28px;">India's Premium OTT Platform</div>
          <div style="font-size:14px;color:#ccc;margin-bottom:16px;">Your verification code is:</div>
          <div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#fff;text-align:center;padding:24px;background:#111120;border-radius:10px;margin-bottom:24px;">${code}</div>
          <div style="font-size:13px;color:#555;">This code expires in 10 minutes. Don't share it with anyone.</div>
        </div>
      `,
    });
    return ok(res, null, "OTP sent to " + email);
  } catch(e) {
    console.error("Email send error:", e);
    return err(res, "Failed to send OTP email. Check RESEND_API_KEY in backend .env");
  }
}

// STEP 2 — Verify OTP + login/register
async function verifyOTP(req, res) {
  const { email, code, phone } = req.body;
  if (!email || !code) return err(res, "Email and code required");

  const clean = email.toLowerCase();
  const stored = otpStore.get(clean);

  if (!stored)                     return err(res, "No OTP found. Request a new code.");
  if (Date.now() > stored.expires) return err(res, "OTP expired. Request a new code.");
  if (stored.code !== code)        return err(res, "Wrong OTP. Please try again.");

  // OTP verified — clear it
  otpStore.delete(clean);

  try {
    // Find existing user by email
    let { data: user } = await sb.from("users").select("*").eq("email", clean).single();

    // If phone provided — check it's not used by a different account
    if (phone && !user) {
      const { data: phoneUser } = await sb.from("users").select("*").eq("phone", phone).single();
      if (phoneUser && phoneUser.email !== clean) {
        return err(res, `An account already exists for this phone number (${phoneUser.email}). Please use that email to log in.`);
      }
    }

    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean); // no built-in default admin
    const isAdmin = ADMIN_EMAILS.includes(clean);

    if (!user) {
      // New user — create account
      const { data: newUser, error: createErr } = await sb.from("users")
        .insert({
          name:      clean.split("@")[0],
          email:     clean,
          phone:     phone || "",
          role:      isAdmin ? "admin" : "user",
          plan:      isAdmin ? "premium" : "free",
          is_active: true,
        })
        .select().single();

      if (createErr) return err(res, "Failed to create account: " + createErr.message);
      user = newUser;

      // Welcome notification
      await sb.from("notifications").insert({
        user_id: user.id, type: "welcome",
        title: "Welcome to StreamX! 🎉",
        message: "Start watching amazing content.",
      }).catch(() => {});
    }

    if (!user.is_active) return err(res, "Account suspended. Contact support@streamx.in");

    // Issue JWT
    const token = signToken({ id: user.id, email: user.email, role: user.role, plan: user.plan });
    return ok(res, { token, user: { id:user.id, name:user.name, email:user.email, phone:user.phone, role:user.role, plan:user.plan, is_active:user.is_active } });

  } catch(e) {
    console.error("verifyOTP error:", e);
    return err(res, "Login failed: " + e.message, 500);
  }
}

// STEP 3 — Mint a backend JWT for an already Supabase-verified user.
// (Login.jsx authenticates via Supabase Auth directly; this endpoint bridges
// that to a StreamX JWT so backend-only routes like Payment/subscriptions work.)
async function createSession(req, res) {
  const { email } = req.body;
  if (!email) return err(res, "Email required");
  const clean = email.toLowerCase();
  try {
    const { data: user } = await sb.from("users").select("*").eq("email", clean).single();
    if (!user) return err(res, "User not found", 404);
    if (!user.is_active) return err(res, "Account suspended. Contact support@streamx.in");

    const token = signToken({ id: user.id, email: user.email, role: user.role, plan: user.plan });
    return ok(res, { token, user: { id:user.id, name:user.name, email:user.email, phone:user.phone, role:user.role, plan:user.plan, is_active:user.is_active } });
  } catch(e) {
    console.error("createSession error:", e);
    return err(res, "Session creation failed: " + e.message, 500);
  }
}

module.exports = { sendOTP, verifyOTP, createSession };