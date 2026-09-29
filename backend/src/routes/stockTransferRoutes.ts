import { Router } from "express";
import { createTransfer, listTransfers, getTransfer, updateTransferStatus, deleteTransfer } from "../controllers/stockTransferController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("view_reports"), listTransfers);
router.get("/:id", requirePermission("view_reports"), getTransfer);
router.post("/", requirePermission("manage_inventory"), createTransfer);
router.put("/:id/status", requirePermission("manage_inventory"), updateTransferStatus);
router.delete("/:id", requirePermission("manage_inventory"), deleteTransfer);

export default router;
