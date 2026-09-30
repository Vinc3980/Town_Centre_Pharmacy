import { Router } from "express";
import { getBranchDaily, createBranch, listBranches } from "../controllers/branchController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("manage_users"), listBranches);
router.post("/", requirePermission("manage_users"), createBranch);
router.get("/:id/daily", requirePermission("manage_users"), getBranchDaily);

export default router;
