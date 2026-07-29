import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import routes from "./routes";
import globalErrorHandler, {
  notFoundHandler,
} from "./middlewares/error.middleware";
import { globalLimiter } from "./middlewares/rateLimit.middleware";
import { corsOrigins } from "./config/env";

const app = express();

// Trust the reverse proxy so req.ip is the real client address rather than the
// proxy's -- session rows would otherwise all record the same IP.
app.set("trust proxy", 1);

// credentials:true is required for the refresh-token cookie to survive a
// cross-origin request. With it, the origin cannot be "*" -- hence an explicit
// allowlist (local dev servers + the deployed storefront).
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

app.use(helmet());

app.use(compression());

app.use(morgan("dev"));

app.use(express.json({ limit: "1mb" }));

app.use(cookieParser());

// Blunt backstop across the whole API. Per-endpoint limits on the auth routes
// are tighter — see rateLimit.middleware.ts.
app.use("/api/v1", globalLimiter);

app.use("/api/v1", routes);

// Order matters: unmatched routes 404 as JSON, then the error handler last.
app.use(notFoundHandler);

app.use(globalErrorHandler);

export default app;
