import dotenv from "dotenv";

// Must run before anything that reads process.env at import time (config/env).
dotenv.config();

import app from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});
