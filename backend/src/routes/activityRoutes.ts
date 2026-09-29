import { Router } from "express";
import { getStaffPerformance, getRecentActivity } from "../controllers/activityController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.get("/performance", requirePermission("view_reports"), getStaffPerformance);
router.get("/recent", requirePermission("view_audit_logs"), getRecentActivity);

export default router;
