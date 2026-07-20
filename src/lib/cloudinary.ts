import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { env } from "../config/env";
import ApiError from "../utils/ApiError";

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const assertConfigured = () => {
  if (!isCloudinaryConfigured) {
    throw new ApiError(
      503,
      "Image uploads are not configured on this server",
    );
  }
};

/**
 * Uploads a buffer held in memory -- multer never writes to disk, so there are
 * no temp files to clean up or leak.
 */
export const uploadImage = (
  buffer: Buffer,
  folder: string,
): Promise<UploadApiResponse> => {
  assertConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) {
          return reject(
            new ApiError(502, error?.message ?? "Image upload failed"),
          );
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });
};

/**
 * Best-effort delete. A failure here must not fail the request that triggered
 * it: the new avatar is already saved, so throwing would leave the user staring
 * at an error over an orphaned file they cannot see.
 */
export const deleteImage = async (publicId: string): Promise<void> => {
  if (!isCloudinaryConfigured) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error(`[cloudinary] failed to delete ${publicId}`, error);
  }
};
