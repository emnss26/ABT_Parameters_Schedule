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
const BASE_PATH = "/ControlPlanos";

const toOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
};

const frontendOrigin = toOrigin(config.frontendUrl);

const getRequestOrigin = (req) => {
  const originHeader = toOrigin(req.headers.origin);
  if (originHeader) return originHeader;
  return toOrigin(req.headers.referer);
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
    message: {
      success: false,
      message: "Demasiadas solicitudes. Intenta nuevamente más tarde.",
    },
  })
);

app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: jsonBodyLimit }));
app.use(cookieParser());

app.use(
  cors({
    origin(origin, callback) {
      
      if (!origin) return callback(null, true);

      const normalizedOrigin = toOrigin(origin);
      if (normalizedOrigin && normalizedOrigin === frontendOrigin) {
        return callback(null, true);
      }

      return callback(new Error("CORS: origen no permitido."));
    },
    credentials: true,
  })
);

// Protección CSRF/origin exacta para métodos que cambian estado
app.use((req, res, next) => {
  if (isProduction && STATE_CHANGING_METHODS.has(req.method)) {
    const requestOrigin = getRequestOrigin(req);

    if (!frontendOrigin || !requestOrigin || requestOrigin !== frontendOrigin) {
      return res.status(403).json({
        success: false,
        message: "Protección CSRF: origen no permitido.",
      });
    }
  }

  return next();
});

if (!isProduction) {
  app.use(morgan("dev"));
}

app.disable("etag");

// Routers
const authRouter = require("./resources/routers/auth.router");
const aecRouter = require("./resources/routers/aec.router");
const accRouter = require("./resources/routers/acc.router");


// APIs en raíz y en /ControlPlanos para compatibilidad local + IIS
app.use(["/auth", `${BASE_PATH}/auth`], authRouter);
app.use(["/aec", `${BASE_PATH}/aec`], aecRouter);
app.use(["/acc", `${BASE_PATH}/acc`], accRouter);


// Health
app.get(["/health", `${BASE_PATH}/health`], (_req, res) => {
  res.json({
    success: true,
    message: "Backend API is online",
    env: config.env,
  });
});


const publicPath = path.join(__dirname, "public");
const indexPath = path.join(publicPath, "index.html");


app.use(express.static(publicPath));
app.use(BASE_PATH, express.static(publicPath));


app.get("*", (req, res, next) => {
  if (req.method !== "GET") return next();

  const requestPath = req.path || "";

  const isApiPath =
    requestPath.startsWith("/auth") ||
    requestPath.startsWith("/aec") ||
    requestPath.startsWith("/acc") ||
    requestPath.startsWith("/plans") ||

    requestPath.startsWith(`${BASE_PATH}/auth`) ||
    requestPath.startsWith(`${BASE_PATH}/aec`) ||
    requestPath.startsWith(`${BASE_PATH}/acc`) ||
    requestPath.startsWith(`${BASE_PATH}/plans`) ;

  if (isApiPath) return next();


  if (requestPath === "/" || requestPath.startsWith(BASE_PATH)) {
    return res.sendFile(indexPath);
  }

  return next();
});

if (!isProduction) {
  app.get("/boom", (_req, _res) => {
    throw new Error("BOOM test route");
  });
}

app.use(require("./middlewares/errorHandler"));

module.exports = app;