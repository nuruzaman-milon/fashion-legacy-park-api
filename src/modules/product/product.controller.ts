import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { sendResponse } from "../../utils/response";
import { pathParam } from "../../utils/pathParam";
import * as productService from "./product.service";
import * as variantService from "./variant.service";
import * as imageService from "./image.service";
import * as browseService from "./browse.service";
import { BrowseQuery, ListManageQuery } from "./product.validation";

/** Present on every manage route -- `authenticate` guarantees req.user. */
const actor = (req: Request): productService.Actor => ({
  id: req.user!.id,
  role: req.user!.role,
});

// ---- public storefront ----------------------------------------------------

export const browse = catchAsync(async (req: Request, res: Response) => {
  const data = await browseService.browse(req.validatedQuery as BrowseQuery);

  sendResponse(res, 200, {
    success: true,
    message: "Products fetched",
    data,
  });
});

export const detail = catchAsync(async (req: Request, res: Response) => {
  const product = await browseService.getBySlug(pathParam(req, "slug"));

  // Fire and forget: the counter must not add latency to the page.
  browseService.recordView(product.id);

  sendResponse(res, 200, {
    success: true,
    message: "Product fetched",
    data: product,
  });
});

// ---- manage: products -----------------------------------------------------

export const list = catchAsync(async (req: Request, res: Response) => {
  const data = await productService.listManageable(
    actor(req),
    req.validatedQuery as ListManageQuery,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Products fetched",
    data,
  });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
  const product = await productService.getManageable(
    actor(req),
    pathParam(req, "id"),
  );

  sendResponse(res, 200, {
    success: true,
    message: "Product fetched",
    data: product,
  });
});

export const create = catchAsync(async (req: Request, res: Response) => {
  const product = await productService.createProduct(actor(req), req.body);

  sendResponse(res, 201, {
    success: true,
    message: "Product created as a draft",
    data: product,
  });
});

export const update = catchAsync(async (req: Request, res: Response) => {
  const product = await productService.updateProduct(
    actor(req),
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message:
      product.status === "PENDING_APPROVAL"
        ? "Product updated and sent back for review"
        : "Product updated",
    data: product,
  });
});

export const submit = catchAsync(async (req: Request, res: Response) => {
  const product = await productService.submitForReview(
    actor(req),
    pathParam(req, "id"),
  );

  sendResponse(res, 200, {
    success: true,
    message: "Submitted for review",
    data: product,
  });
});

export const setStatus = catchAsync(async (req: Request, res: Response) => {
  const product = await productService.setStatus(
    actor(req),
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message: `Product status set to ${product.status}`,
    data: product,
  });
});

export const remove = catchAsync(async (req: Request, res: Response) => {
  await productService.deleteProduct(actor(req), pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Product deleted",
  });
});

// ---- manage: options & variants -------------------------------------------

export const attachOptions = catchAsync(async (req: Request, res: Response) => {
  const options = await variantService.attachOptions(
    actor(req),
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Options attached",
    data: options,
  });
});

export const generateVariants = catchAsync(
  async (req: Request, res: Response) => {
    const result = await variantService.generateVariants(
      actor(req),
      pathParam(req, "id"),
      req.body,
    );

    sendResponse(res, 201, {
      success: true,
      message: `${result.created} variant(s) created, ${result.skipped} already existed`,
      data: result,
    });
  },
);

export const listVariants = catchAsync(async (req: Request, res: Response) => {
  const variants = await variantService.listVariants(
    actor(req),
    pathParam(req, "id"),
  );

  sendResponse(res, 200, {
    success: true,
    message: "Variants fetched",
    data: variants,
  });
});

export const createVariant = catchAsync(async (req: Request, res: Response) => {
  const variant = await variantService.createVariant(
    actor(req),
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 201, {
    success: true,
    message: "Variant created",
    data: variant,
  });
});

export const bulkUpdateVariants = catchAsync(
  async (req: Request, res: Response) => {
    const count = await variantService.bulkUpdateVariants(
      actor(req),
      pathParam(req, "id"),
      req.body,
    );

    sendResponse(res, 200, {
      success: true,
      message: `${count} variant(s) updated`,
    });
  },
);

export const updateVariant = catchAsync(async (req: Request, res: Response) => {
  const variant = await variantService.updateVariant(
    actor(req),
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 200, {
    success: true,
    message: "Variant updated",
    data: variant,
  });
});

export const deleteVariant = catchAsync(async (req: Request, res: Response) => {
  await variantService.deleteVariant(actor(req), pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Variant deleted",
  });
});

// ---- manage: images -------------------------------------------------------

export const listImages = catchAsync(async (req: Request, res: Response) => {
  const images = await imageService.listImages(actor(req), pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Images fetched",
    data: images,
  });
});

export const addImage = catchAsync(async (req: Request, res: Response) => {
  const image = await imageService.addImage(
    actor(req),
    pathParam(req, "id"),
    req.body,
  );

  sendResponse(res, 201, {
    success: true,
    message: "Image added",
    data: image,
  });
});

export const reorderImages = catchAsync(async (req: Request, res: Response) => {
  await imageService.reorderImages(actor(req), pathParam(req, "id"), req.body);

  sendResponse(res, 200, {
    success: true,
    message: "Images reordered",
  });
});

export const setPrimaryImage = catchAsync(
  async (req: Request, res: Response) => {
    const image = await imageService.setPrimaryImage(
      actor(req),
      pathParam(req, "id"),
    );

    sendResponse(res, 200, {
      success: true,
      message: "Primary image updated",
      data: image,
    });
  },
);

export const deleteImage = catchAsync(async (req: Request, res: Response) => {
  await imageService.deleteImage_(actor(req), pathParam(req, "id"));

  sendResponse(res, 200, {
    success: true,
    message: "Image deleted",
  });
});
