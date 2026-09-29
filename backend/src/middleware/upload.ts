import path from "path";
import fs from "fs";
import multer from "multer";
import { ApiError } from "../utils/ApiError";

const receiptsDir = path.join(__dirname, "../../uploads/receipts");
const profilesDir = path.join(__dirname, "../../uploads/profiles");
const medicinesDir = path.join(__dirname, "../../uploads/medicines");
const logosDir = path.join(__dirname, "../../uploads/logos");

if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });
if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
if (!fs.existsSync(medicinesDir)) fs.mkdirSync(medicinesDir, { recursive: true });
if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, receiptsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, profilesDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const medicineImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, medicinesDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${unique}${ext}`);
  },
});

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const RECEIPT_MIMES = [...IMAGE_MIMES, "application/pdf"];
const RECEIPT_EXTENSIONS = [...IMAGE_EXTENSIONS, ".pdf"];

export const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!RECEIPT_EXTENSIONS.includes(ext)) {
      return cb(new ApiError(400, "Only .jpg, .jpeg, .png, .webp, and .pdf files are allowed"));
    }
    if (!RECEIPT_MIMES.includes(file.mimetype)) {
      return cb(new ApiError(400, "Invalid file type"));
    }
    cb(null, true);
  },
});

export const uploadProfilePicture = multer({
  storage: profileStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      return cb(new ApiError(400, "Only .jpg, .jpeg, .png, and .webp files are allowed"));
    }
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return cb(new ApiError(400, "Invalid file type"));
    }
    cb(null, true);
  },
});

export const uploadMedicineImage = multer({
  storage: medicineImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      return cb(new ApiError(400, "Only .jpg, .jpeg, .png, and .webp files are allowed"));
    }
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return cb(new ApiError(400, "Invalid file type"));
    }
    cb(null, true);
  },
});

export const uploadPharmacyLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      return cb(new ApiError(400, "Only .jpg, .jpeg, .png, and .webp files are allowed"));
    }
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return cb(new ApiError(400, "Invalid file type"));
    }
    cb(null, true);
  },
});
