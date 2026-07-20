import multer from "multer";
import ApiError from "../utils/ApiError";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Memory storage: the buffer goes straight to Cloudinary, so nothing is written
 * to the server's disk and there are no temp files to clean up.
 *
 * The size limit is enforced by multer BEFORE the whole body is read, so an
 * oversized upload is rejected while streaming rather than after buffering it.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new ApiError(400, "Only image files are allowed"));
    }
    cb(null, true);
  },
});

/** Turns multer's own errors into the app's error contract. */
export const handleUploadError = (err: unknown): never => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      throw new ApiError(400, "Image must be smaller than 2MB");
    }
    throw new ApiError(400, err.message);
  }
  throw err;
};
