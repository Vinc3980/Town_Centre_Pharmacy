import { Router } from "express";
import {
  listUsers, getUserById, createUser, updateUser,
  deactivateUser, reactivateUser, adminResetPassword, requestPasswordReset,
  uploadStaffImage,
} from "../controllers/userController";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permit";
import { uploadProfilePicture } from "../middleware/upload";

const router = Router();

router.post("/request-password-reset", requestPasswordReset);

router.use(requireAuth);

router.get("/", requirePermission("manage_users"), listUsers);
router.get("/:id", requirePermission("manage_users"), getUserById);
router.post("/", requirePermission("manage_users"), createUser);
router.put("/:id", requirePermission("manage_users"), updateUser);
router.post("/:id/deactivate", requirePermission("manage_users"), deactivateUser);
router.post("/:id/reactivate", requirePermission("manage_users"), reactivateUser);
router.post("/:id/reset-password", requirePermission("manage_users"), adminResetPassword);
router.post("/:id/image", requirePermission("manage_users"), uploadProfilePicture.single("image"), uploadStaffImage);

export default router;
