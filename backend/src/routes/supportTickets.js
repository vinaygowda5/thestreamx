const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const c = require("../controllers/supportTicketController");

router.post("/",            requireAuth, c.createTicket);
router.get("/",             requireAuth, c.listTickets);
router.post("/:id/assign",  requireAuth, c.assignTicket);
router.post("/:id/resolve", requireAuth, c.resolveTicket);

module.exports = router;