import { Router } from "express";
import { getProfile, updateProfile, changePassword, uploadProfile } from "../controllers/profileController";
import { requireAuth } from "../middleware/auth";
import { uploadProfilePicture } from "../middleware/upload";

const router = Router();
router.use(requireAuth);

router.get("/", getProfile);
router.put("/", updateProfile);
router.put("/password", changePassword);
router.post("/picture", uploadProfilePicture.single("picture"), uploadProfile);

export default router;
