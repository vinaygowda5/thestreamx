const sb = require("../models/db");
const { ok, err } = require("../utils/response");
const { logAudit } = require("../middleware/audit");
const { loadEmployeeContext } = require("../middleware/authorize");

// POST /api/support-tickets — customer-facing, any logged-in user can file one
async function createTicket(req, res) {
  const { subject, message } = req.body;
  if (!subject || !message) return err(res, "subject and message are required");

  const { data, error } = await sb.from("support_tickets").insert({
    customer_id: req.user.id, customer_email: req.user.email,
    subject, message, status: "OPEN",
  }).select().single();
  if (error) return err(res, error.message, 500);
  return ok(res, data, "Your complaint has been submitted");
}

// GET /api/support-tickets — Support department only, scoped like employees
async function listTickets(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName) return err(res, "Forbidden", 403);
  if (ctx.tier !== "SUPER" && ctx.department !== "SUPPORT") return err(res, "Forbidden", 403);

  const status = req.query.status;
  let query = sb.from("support_tickets").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (ctx.tier === "TEAM_LEADER" || ctx.tier === "TEAM_MEMBER") query = query.eq("assigned_to", req.user.id);

  const { data, error } = await query;
  if (error) return err(res, error.message, 500);
  return ok(res, data);
}

async function assignTicket(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName || (ctx.tier !== "SUPER" && ctx.department !== "SUPPORT")) return err(res, "Forbidden", 403);
  const { id } = req.params;
  const { assignTo } = req.body;

  const { error } = await sb.from("support_tickets").update({ assigned_to: assignTo, status: "IN_PROGRESS" }).eq("id", id);
  if (error) return err(res, error.message, 500);
  await logAudit({ req, action: "ASSIGNED_TICKET", resourceType: "support_ticket", resourceId: id, after: { assignTo } });
  return ok(res, null, "Ticket assigned");
}

async function resolveTicket(req, res) {
  const ctx = await loadEmployeeContext(req.user.id);
  if (!ctx?.roleName || (ctx.tier !== "SUPER" && ctx.department !== "SUPPORT")) return err(res, "Forbidden", 403);
  const { id } = req.params;
  const { resolutionNote } = req.body;

  const { error } = await sb.from("support_tickets").update({
    status: "RESOLVED", resolution_note: resolutionNote || null, resolved_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return err(res, error.message, 500);
  await logAudit({ req, action: "RESOLVED_TICKET", resourceType: "support_ticket", resourceId: id });
  return ok(res, null, "Ticket resolved");
}

module.exports = { createTicket, listTickets, assignTicket, resolveTicket };