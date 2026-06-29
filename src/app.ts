import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import routes from "./routes";
import globalErrorHandler from "./middlewares/error.middleware";

const app = express();

app.use(cors());

app.use(helmet());

app.use(compression());

app.use(morgan("dev"));

app.use(express.json());

app.use(cookieParser());

app.use("/api/v1", routes);

app.use(globalErrorHandler);

export default app;
