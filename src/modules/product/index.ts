export {
  publicProductRoutes,
  adminProductRoutes,
  adminCatalogResourceRoutes,
  sellerProductRoutes,
  sellerCatalogResourceRoutes,
} from "./product.routes";
export * as productService from "./product.service";
export { refreshProduct, recalcProductAggregates } from "./denormalize";
