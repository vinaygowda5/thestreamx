// Plans that count as a paid subscription (can watch "Premium subscribers only" titles)
export const PAID_PLANS = ["plan_mobile", "plan_basic", "plan_premium", "plan_annual", "premium", "basic", "mobile"];
// Plans with the top-tier perks (no ads, 1080p/4K, downloads)
export const TOP_PLANS = ["plan_premium", "plan_annual", "premium"];
export const hasPaidPlan = user => PAID_PLANS.includes(user?.plan);