const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// SECURITY: never fall back to a known default secret — anyone who knew it
// could forge an admin token. If JWT_SECRET is missing we generate a random
// one for this process (everyone is simply logged out on each restart) and
// shout about it. Set JWT_SECRET (64+ random chars) in Render to fix.
let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  SECRET = crypto.randomBytes(48).toString("hex");
  console.error("⚠️  JWT_SECRET is missing or too short (<32 chars). Using a temporary random secret. Set a strong JWT_SECRET in your hosting environment.");
}
const signToken  = p  => jwt.sign(p, SECRET, { expiresIn: "30d", algorithm: "HS256" });
const verifyToken = t => jwt.verify(t, SECRET, { algorithms: ["HS256"] });
module.exports = { signToken, verifyToken };