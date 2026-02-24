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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Cors configuration
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

// Middleware para protección CSRF básica
app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;

    if (isProduction && origin && !origin.startsWith(config.frontendUrl)) {
      return res
        .status(403)
        .json({ success: false, message: "CSRF Protection: Origin not allowed" });
    }
  }
  next();
});

if (!isProduction) {
  app.use(morgan("dev"));
}

app.disable("etag");

// API routes
app.use("/auth", require("./resources/routers/auth.router"));
app.use("/aec", require("./resources/routers/aec.router"));
app.use("/acc", require("./resources/routers/acc.router"));
app.use("/plans", require("./resources/routers/plans.router"));
app.use("/dm", require("./resources/routers/dm.router"));

// Health Check
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Backend API is online 🚀",
    env: config.env,
  });
});

/**
 * ✅ SPA fallback SOLO en producción
 * Evita el ENOENT en dev (cuando no existe /dist)
 * y evita que el backend intente servir index.html para rutas API por error.
 */
if (isProduction) {
  const distPath = path.join(__dirname, "dist");
  const indexPath = path.join(distPath, "index.html");

  app.use(express.static(distPath));

  // Fallback a index.html solo para rutas NO-API
  app.get("*", (req, res, next) => {
    const p = req.path || "";

    // Si por alguna razón cae aquí una ruta API, no la conviertas en index.html
    if (
      p.startsWith("/auth") ||
      p.startsWith("/aec") ||
      p.startsWith("/acc") ||
      p.startsWith("/plans") ||
      p.startsWith("/dm") ||
      p.startsWith("/health")
    ) {
      return next(); // que responda 404 o lo que siga
    }

    return res.sendFile(indexPath);
  });
}

app.get("/boom", (_req, _res) => {
  throw new Error("BOOM test (si no ves esto, no estás viendo la consola correcta)");
});

app.use(require("./middlewares/errorHandler"));

module.exports = app;