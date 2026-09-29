import { Router } from "express";
import { listAuditLogs, listMyAuditLogs, getAuditLogById } from "../controllers/auditController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("view_audit_logs"), listAuditLogs);
router.get("/my", listMyAuditLogs);
router.get("/:id", requirePermission("view_audit_logs"), getAuditLogById);

export default router;
