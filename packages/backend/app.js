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

// --- CAMBIO CLAVE PARA IIS ---
const BASE_PATH = "/SeguimientoParametros";

// Obtener IP real detrás de IIS / Proxies
const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "unknown-ip"
  );
};

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
    validate: { ip: false },
    keyGenerator: (req) => getClientIp(req),
    message: {
      success: false,
      message: "Demasiadas solicitudes. Intenta nuevamente más tarde.",
    },
  })
);

app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: jsonBodyLimit }));
app.use(cookieParser());

// Cors configuration
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

// Protección CSRF
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
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

// Routers de la nueva App
const authRouter = require("./resources/routers/auth.router");
const aecRouter = require("./resources/routers/aec.router");
const accRouter = require("./resources/routers/acc.router");

// APIs en raíz y en /SeguimientoParametros para compatibilidad local + IIS
app.use(["/auth", `${BASE_PATH}/auth`], authRouter);
app.use(["/aec", `${BASE_PATH}/aec`], aecRouter);
app.use(["/acc", `${BASE_PATH}/acc`], accRouter);

// Health
app.get(["/health", `${BASE_PATH}/health`], (_req, res) => {
  res.json({
    success: true,
    message: "Backend API is online 🚀",
    env: config.env,
    app: "SeguimientoParametros"
  });
});

// Servir frontend estático
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));
app.use(BASE_PATH, express.static(publicPath));

// Fallback para React Router (SPA)
app.get("*", (req, res, next) => {
  if (req.method !== "GET") return next();

  const requestPath = req.path || "";
  
 
  const isApiPath =
    requestPath.startsWith("/auth/") || requestPath === "/auth" ||
    requestPath.startsWith("/aec/") || requestPath === "/aec" ||
    requestPath.startsWith("/acc/") || requestPath === "/acc" ||
    requestPath.startsWith(`${BASE_PATH}/auth/`) || requestPath === `${BASE_PATH}/auth` ||
    requestPath.startsWith(`${BASE_PATH}/aec/`) || requestPath === `${BASE_PATH}/aec` ||
    requestPath.startsWith(`${BASE_PATH}/acc/`) || requestPath === `${BASE_PATH}/acc`;

  if (isApiPath) return next();

  res.sendFile(path.join(publicPath, "index.html"));
});

if (!isProduction) {
  app.get("/boom", (_req, _res) => {
    throw new Error("BOOM test route");
  });
}

app.use(require("./middlewares/errorHandler"));

module.exports = app;