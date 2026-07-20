import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { uploadImage as uploadMiddleware } from "../../middlewares/upload.middleware";
import { uploadImage } from "../../lib/cloudinary";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import ApiError from "../../utils/ApiError";

const router = Router();

// Sellers upload their own product photos, so this cannot be admin-only.
// Still authenticated and role-gated: the endpoint costs money per call and
// writes to shared storage.
router.use(
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.ADMIN, Role.SELLER),
);

/**
 * Generic image upload. Returns the URL **and** the Cloudinary public_id.
 *
 * Entity endpoints (category, brand, product image) take JSON only and accept
 * both values, so a later replacement can delete the previous file. Keeping
 * upload separate from entity CRUD avoids mixing multipart with the
 * Zod-validated JSON bodies every other route uses.
 */
router.post(
  "/image",
  uploadMiddleware.single("image"),
  catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, "No image file was provided");
    }

    const folder =
      typeof req.body?.folder === "string" &&
      /^[a-z-]{1,30}$/.test(req.body.folder)
        ? req.body.folder
        : "misc";

    const result = await uploadImage(req.file.buffer, folder);

    sendResponse(res, 201, {
      success: true,
      message: "Image uploaded",
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      },
    });
  }),
);

export default router;
