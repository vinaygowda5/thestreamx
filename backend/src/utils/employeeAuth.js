const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// STX-XXXXXX — short, unique, easy to read aloud/type. Collision chance is
// negligible at your scale; the DB's UNIQUE constraint on employee_id is
// the real safety net if it's ever generated twice.
function generateEmployeeId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids confusion when read aloud
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
  return `STX-${code}`;
}

// A genuinely random password — shown to the Super Admin/Manager ONCE at
// creation time, then only its bcrypt hash is ever stored.
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[crypto.randomInt(chars.length)];
  return pw;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// Basic device detection — the frontend also checks this for a better
// experience, but THIS is the real enforcement boundary since it runs
// server-side and can't be bypassed by editing frontend code.
function isMobileUserAgent(userAgent = "") {
  return /Android|iPhone|iPad|iPod|Mobile|BlackBerry|Windows Phone|Opera Mini/i.test(userAgent);
}

module.exports = { generateEmployeeId, generatePassword, hashPassword, verifyPassword, isMobileUserAgent };