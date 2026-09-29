import { Router } from "express";
import { listExpenses, getExpenseById, createExpense, updateExpense, approveExpense } from "../controllers/expenseController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";
import { uploadReceipt } from "../middleware/upload";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("manage_expenses"), listExpenses);
router.get("/:id", requirePermission("manage_expenses"), getExpenseById);
router.post("/", requirePermission("manage_expenses"), uploadReceipt.single("receipt"), createExpense);
router.put("/:id", requirePermission("manage_expenses"), uploadReceipt.single("receipt"), updateExpense);
router.post("/:id/approve", requirePermission("manage_expenses"), approveExpense);

export default router;
