import { Router, Request, Response, NextFunction } from "express";
import {
  createAdjustment,
  listAdjustments,
  getAdjustment,
  approveAdjustment,
  rejectAdjustment,
  deleteAdjustment,
} from "../controllers/stockAdjustmentController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";
import { ApiError } from "../utils/ApiError";

function requireManagerRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new ApiError(401, "Not authenticated"));
  const managerRoles = ["branch_manager", "admin"];
  if (!managerRoles.includes(req.user.role)) {
    return next(new ApiError(403, "You don't have permission to do that"));
  }
  next();
}

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("view_reports"), listAdjustments);
router.get("/:id", requirePermission("view_reports"), getAdjustment);
router.post("/", requirePermission("manage_inventory"), createAdjustment);
router.post("/:id/approve", requireManagerRole, approveAdjustment);
router.post("/:id/reject", requireManagerRole, rejectAdjustment);
router.delete("/:id", requirePermission("manage_inventory"), deleteAdjustment);

export default router;
