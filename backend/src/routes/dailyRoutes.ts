import { Router } from "express";
import {
  openSession, closeSession, getCurrentSession, listSessions, getSessionSales,
  listPendingSessions, approveSession, approveSessionClose,
  rejectSession, rejectSessionClose,
  submitReport, getReportById, listPendingReports, listAllReports,
  approveReport, rejectReport,
} from "../controllers/dailyController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.post("/sessions", requirePermission("process_sales"), openSession);
router.post("/sessions/close", requirePermission("process_sales"), closeSession);
router.get("/sessions/current", requirePermission("process_sales"), getCurrentSession);
router.get("/sessions", requirePermission("view_reports"), listSessions);
router.get("/sessions/pending", requirePermission("view_reports"), listPendingSessions);
router.get("/sessions/:id/sales", requirePermission("view_reports"), getSessionSales);
router.post("/sessions/:id/approve", requirePermission("view_reports"), approveSession);
router.post("/sessions/:id/approve-close", requirePermission("view_reports"), approveSessionClose);
router.post("/sessions/:id/reject", requirePermission("view_reports"), rejectSession);
router.post("/sessions/:id/reject-close", requirePermission("view_reports"), rejectSessionClose);

router.post("/reports/submit", requirePermission("process_sales"), submitReport);
router.get("/reports/pending", requirePermission("view_reports"), listPendingReports);
router.get("/reports", requirePermission("view_reports"), listAllReports);
router.get("/reports/:id", requirePermission("view_reports"), getReportById);
router.post("/reports/:id/approve", requirePermission("view_reports"), approveReport);
router.post("/reports/:id/reject", requirePermission("view_reports"), rejectReport);

export default router;
