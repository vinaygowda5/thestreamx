/*
  StreamX Monitoring
  Add this as: frontend/src/monitoring.js
  Tracks: errors, page views, user actions — all sent to your backend
*/
import { API } from "./config.js";


// ── Track page view ──
export function trackPageView(page, user) {
  send("page_view", { page, userId: user?.id, plan: user?.plan });
}

// ── Track user action ──
export function trackEvent(event, data = {}) {
  send("event", { event, ...data });
}

// ── Track error ──
export function trackError(error, context = {}) {
  send("error", {
    message: error?.message || String(error),
    stack:   error?.stack?.slice(0, 500),
    context,
  });
}

// ── Auto-catch all JS errors ──
export function initMonitoring(user) {
  window.onerror = (msg, src, line, col, error) => {
    trackError(error || new Error(msg), { src, line, col });
    return false;
  };
  window.onunhandledrejection = e => {
    trackError(e.reason, { type: "unhandled_promise" });
  };
  // Track first page view
  trackPageView(window.location.pathname, user);
}

async function send(type, data) {
  try {
    await fetch(`${API}/api/analytics`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type, data, ts: Date.now(), ua: navigator.userAgent }),
    });
  } catch(e) {
    // Silently fail — never block the app for analytics
  }
}