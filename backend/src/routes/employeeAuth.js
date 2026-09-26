const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const { employeeLogin, employeeLogout, checkEmail } = require("../controllers/employeeAuthController");

router.get("/check-email", checkEmail);
router.post("/login",  employeeLogin);
router.post("/logout", requireAuth, employeeLogout);

module.exports = router;