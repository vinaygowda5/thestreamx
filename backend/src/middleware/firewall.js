/*
  ═══════════════════════════════════════════════════════════
  THESTREAMX — 3-LAYER FIREWALL SYSTEM
  ═══════════════════════════════════════════════════════════

  LAYER 1: RATE LIMITER
  - Blocks brute force attacks (too many requests)
  - OTP endpoint: max 5 requests per 15 minutes per IP
  - API endpoints: max 100 requests per minute per IP
  - Admin endpoints: max 30 requests per minute per IP

  LAYER 2: REQUEST VALIDATOR
  - Blocks SQL injection attempts
  - Blocks XSS (script injection) attacks
  - Blocks path traversal attacks (../../etc/passwd)
  - Validates Content-Type headers
  - Blocks suspiciously large payloads

  LAYER 3: IP & ORIGIN GUARD
  - Only allows requests from your frontend domain
  - Blocks all unknown origins
  - Logs and blocks repeated suspicious IPs
  - Adds security headers to every response
  ═══════════════════════════════════════════════════════════
*/

const { log } = require("../utils/logger");

// ── In-memory stores (use Redis in production for multi-server) ──
const rateLimitStore  = new Map(); // IP -> { count, resetAt }
const suspiciousIPs   = new Map(); // IP -> { strikes, bannedUntil }

// ════════════════════════════════════════════════════════
// LAYER 1 — RATE LIMITER
// ════════════════════════════════════════════════════════
function createRateLimiter({ windowMs, max, message }) {
  return (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress || "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      // Fresh window
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;

    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      log("warn", "Rate limit exceeded", { ip, path: req.path, count: record.count });

      // Track as suspicious
      addSuspiciousStrike(ip, "rate_limit_exceeded");

      return res.status(429).json({
        success: false,
        msg: message || "Too many requests. Please wait and try again.",
        retryAfter,
      });
    }

    next();
  };
}

// Specific rate limiters for different endpoints
const otpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many OTP requests. Please wait 15 minutes before trying again.",
});

const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many requests. Please slow down.",
});

const adminLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many admin requests.",
});

const loginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: "Too many login attempts. Please wait 10 minutes.",
});

// ════════════════════════════════════════════════════════
// LAYER 2 — REQUEST VALIDATOR (SQL injection, XSS, etc.)
// ════════════════════════════════════════════════════════

// Patterns that indicate attacks
const ATTACK_PATTERNS = [
  // SQL Injection
  /(\bUNION\b.*\bSELECT\b|\bSELECT\b.*\bFROM\b|\bDROP\b.*\bTABLE\b|\bINSERT\b.*\bINTO\b|\bDELETE\b.*\bFROM\b)/gi,
  /('|(--|;).*--|\bOR\b\s+\d+\s*=\s*\d+|\bAND\b\s+\d+\s*=\s*\d+)/gi,
  // XSS
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /on(load|click|error|mouseover|focus|blur)\s*=/gi,
  /<iframe|<img.*onerror|<svg.*onload/gi,
  // Path traversal
  /\.\.\//g,
  /\.\.\\/g,
  // Command injection
  /[;&|`$]\s*(ls|cat|rm|wget|curl|bash|sh|python|perl|ruby|nc|ncat)/gi,
];

function containsAttackPattern(value) {
  if (typeof value !== "string") return false;
  const decoded = decodeURIComponent(value).toLowerCase();
  return ATTACK_PATTERNS.some(pattern => {
    pattern.lastIndex = 0; // reset regex state
    return pattern.test(decoded);
  });
}

function deepScanObject(obj, depth = 0) {
  if (depth > 5) return false; // prevent deep nesting attacks
  if (typeof obj === "string") return containsAttackPattern(obj);
  if (typeof obj === "object" && obj !== null) {
    return Object.values(obj).some(val => deepScanObject(val, depth + 1));
  }
  return false;
}

function requestValidator(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";

  // 1. Check payload size (max 10MB)
  const contentLength = parseInt(req.headers["content-length"] || "0");
  if (contentLength > 10 * 1024 * 1024) {
    log("warn", "Payload too large", { ip, size: contentLength });
    return res.status(413).json({ success: false, msg: "Payload too large." });
  }

  // 2. Scan URL/query params for attack patterns
  const urlToCheck = req.originalUrl || req.url || "";
  if (containsAttackPattern(urlToCheck)) {
    log("warn", "Attack pattern in URL", { ip, url: urlToCheck });
    addSuspiciousStrike(ip, "attack_in_url");
    return res.status(400).json({ success: false, msg: "Invalid request." });
  }

  // 3. Scan request body for attack patterns
  if (req.body && typeof req.body === "object") {
    if (deepScanObject(req.body)) {
      log("warn", "Attack pattern in body", { ip, path: req.path });
      addSuspiciousStrike(ip, "attack_in_body");
      return res.status(400).json({ success: false, msg: "Invalid request content." });
    }
  }

  // 4. Block suspicious user agents (bots, scanners)
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const blockedAgents = ["sqlmap", "nikto", "nmap", "masscan", "zgrab", "nuclei", "burpsuite", "dirbuster", "hydra"];
  if (blockedAgents.some(bot => ua.includes(bot))) {
    log("warn", "Blocked bot/scanner", { ip, ua });
    return res.status(403).json({ success: false, msg: "Forbidden." });
  }

  next();
}

// ════════════════════════════════════════════════════════
// LAYER 3 — IP & ORIGIN GUARD + SECURITY HEADERS
// ════════════════════════════════════════════════════════

function addSuspiciousStrike(ip, reason) {
  const now = Date.now();
  const record = suspiciousIPs.get(ip) || { strikes: 0, bannedUntil: 0 };
  record.strikes++;
  record.lastReason = reason;
  record.lastSeen = now;

  // After 10 strikes — ban for 1 hour
  if (record.strikes >= 10) {
    record.bannedUntil = now + 60 * 60 * 1000;
    log("warn", "IP banned for 1 hour", { ip, reason, strikes: record.strikes });
  }

  suspiciousIPs.set(ip, record);
}

function ipGuard(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  // Check if IP is banned
  const suspect = suspiciousIPs.get(ip);
  if (suspect && suspect.bannedUntil > now) {
    const minutesLeft = Math.ceil((suspect.bannedUntil - now) / 60000);
    log("warn", "Blocked banned IP", { ip });
    return res.status(403).json({
      success: false,
      msg: `Access temporarily blocked. Try again in ${minutesLeft} minutes.`,
    });
  }

  // Validate origin — only allow your frontend
  const origin  = req.headers.origin  || "";
  const referer = req.headers.referer || "";
  const allowed = [
    process.env.FRONTEND_URL || "https://streamx-ott.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4000",
  ];

  const isAllowed = allowed.some(a => origin.startsWith(a) || referer.startsWith(a));

  // Allow requests with no origin (server-to-server, Postman in dev)
  const isDev     = process.env.NODE_ENV !== "production";
  const noOrigin  = !origin && !referer;

  if (!isAllowed && !noOrigin && !isDev) {
    log("warn", "Blocked unknown origin", { ip, origin, referer });
    addSuspiciousStrike(ip, "unknown_origin");
    return res.status(403).json({ success: false, msg: "Forbidden." });
  }

  next();
}

function securityHeaders(req, res, next) {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Remove server info
  res.removeHeader("X-Powered-By");
  res.setHeader("Server", "TheStreamx");
  // HTTPS only (enable when you have SSL)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Content Security Policy
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.razorpay.com; " +
    "img-src 'self' data: https:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "script-src 'self'"
  );
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

// ════════════════════════════════════════════════════════
// EXPORT ALL
// ════════════════════════════════════════════════════════
module.exports = {
  // Rate limiters
  otpLimiter,
  apiLimiter,
  adminLimiter,
  loginLimiter,
  // Validators
  requestValidator,
  // Guards
  ipGuard,
  securityHeaders,
};
