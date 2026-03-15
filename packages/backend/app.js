const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const config = require("./config");

const app = express();

const isProduction = config.env === "production";
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "15mb";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests, please try again later.",
    },
  })
);

app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: jsonBodyLimit }));
app.use(cookieParser());

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

// Basic origin validation for state-changing methods in production.
app.use((req, res, next) => {
  if (isProduction && STATE_CHANGING_METHODS.has(req.method)) {
    const origin = String(req.headers.origin || req.headers.referer || "").trim();
    if (!origin || !origin.startsWith(config.frontendUrl)) {
      return res
        .status(403)
        .json({ success: false, message: "CSRF Protection: Origin not allowed" });
    }
  }
  return next();
});

if (!isProduction) {
  app.use(morgan("dev"));
}

app.disable("etag");

app.use("/auth", require("./resources/routers/auth.router"));
app.use("/aec", require("./resources/routers/aec.router"));
app.use("/acc", require("./resources/routers/acc.router"));
app.use("/plans", require("./resources/routers/plans.router"));
app.use("/dm", require("./resources/routers/dm.router"));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Backend API is online",
    env: config.env,
  });
});

// Serve SPA only in production and never for API prefixes.
if (isProduction) {
  const distPath = path.join(__dirname, "dist");
  const indexPath = path.join(distPath, "index.html");

  app.use(express.static(distPath));

  app.get("*", (req, res, next) => {
    const requestPath = req.path || "";
    if (
      requestPath.startsWith("/auth") ||
      requestPath.startsWith("/aec") ||
      requestPath.startsWith("/acc") ||
      requestPath.startsWith("/plans") ||
      requestPath.startsWith("/dm") ||
      requestPath.startsWith("/health")
    ) {
      return next();
    }

    return res.sendFile(indexPath);
  });
}

if (!isProduction) {
  app.get("/boom", (_req, _res) => {
    throw new Error("BOOM test route");
  });
}

app.use(require("./middlewares/errorHandler"));

module.exports = app;
