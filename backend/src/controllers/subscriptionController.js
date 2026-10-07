const sb       = require("../models/db");
const Razorpay = require("razorpay");
const crypto   = require("crypto");
const { ok, err } = require("../utils/response");

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLANS = {
  plan_mobile:  { name:"Mobile",  amount: 99,  months: 1  },
  plan_basic:   { name:"Basic",   amount: 149,  months: 1  },
  plan_premium: { name:"Premium", amount: 249,  months: 1  },
  plan_annual:  { name:"Annual",  amount: 2499,  months: 12 },
};

// Create Razorpay order
async function createOrder(req, res) {
  const { plan_id } = req.body;
  const plan = PLANS[plan_id];
  if (!plan) return err(res, "Invalid plan");

  try {
    const order = await razorpay.orders.create({
      amount:   plan.amount,
      currency: "INR",
      notes:    { user_id: req.user.id, plan_id },
    });
    return ok(res, { order_id: order.id, amount: plan.amount, plan_name: plan.name, key_id: process.env.RAZORPAY_KEY_ID });
  } catch(e) {
    return err(res, "Failed to create order: " + e.message, 500);
  }
}

// Verify payment + activate subscription
async function verifyPayment(req, res) {
  const { order_id, payment_id, signature, plan_id } = req.body;

  // Verify signature
  const body      = order_id + "|" + payment_id;
  const expected  = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
  if (expected !== signature) return err(res, "Payment verification failed", 400);

  const plan = PLANS[plan_id];
  if (!plan) return err(res, "Invalid plan");

  const end = new Date();
  end.setMonth(end.getMonth() + plan.months);

  try {
    // Save subscription
    await sb.from("subscriptions").insert({
      user_id:    req.user.id,
      plan_id,
      status:     "active",
      amount:     plan.amount / 100,
      payment_id,
      end_date:   end.toISOString(),
    });

    // Update user plan
    await sb.from("users").update({ plan: plan_id }).eq("id", req.user.id);

    // Save transaction
    await sb.from("transactions").insert({
      user_id:    req.user.id,
      plan_id,
      amount:     plan.amount / 100,
      status:     "success",
      payment_id,
    });

    // Send notification
    await sb.from("notifications").insert({
      user_id: req.user.id, type: "subscription",
      title:   `${plan.name} Plan Activated 👑`,
      message: `Your ${plan.name} subscription is active until ${end.toLocaleDateString("en-IN")}`,
    });

    return ok(res, { plan_id, end_date: end.toISOString() }, "Subscription activated!");
  } catch(e) {
    return err(res, "Failed to activate subscription: " + e.message, 500);
  }
}

async function getMySub(req, res) {
  const { data } = await sb.from("subscriptions").select("*").eq("user_id", req.user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return ok(res, data);
}

module.exports = { createOrder, verifyPayment, getMySub };
