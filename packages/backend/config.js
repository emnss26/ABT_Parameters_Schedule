const path = require("path");
const dotenv = require("dotenv");

const ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = ENV === "production";
// En IIS suele ser útil tener un .env.production, si no, lee el .env normal
const ENV_FILE = ENV === "production" ? ".env.production" : ".env";
const ENV_PATH = path.resolve(__dirname, ENV_FILE);

dotenv.config({
  path: ENV_PATH,
});

const FALLBACK_FRONTEND_URL = "http://localhost:5173";
const FRONTEND_URL_ENTRIES = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const normalizeUrl = (value) => {
  try {
    return new URL(String(value || "").trim()).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const VALID_FRONTEND_URLS = FRONTEND_URL_ENTRIES.map(normalizeUrl).filter(Boolean);

if (FRONTEND_URL_ENTRIES.length > 0 && VALID_FRONTEND_URLS.length !== FRONTEND_URL_ENTRIES.length) {
  const message = "Invalid FRONTEND_URL value. Use one or more absolute URLs separated by commas.";
  if (IS_PRODUCTION) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

if (IS_PRODUCTION && VALID_FRONTEND_URLS.length === 0) {
  console.error("Missing required environment variable: FRONTEND_URL");
  process.exit(1);
}

const REQUIRED_ENV_VARS = [
  "APS_CLIENT_ID",
  "APS_CLIENT_SECRET",
  "APS_CALLBACK_URL",
  "DB_HOST",
  "DB_USER",
  "DB_NAME",
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const dbPort = Number.parseInt(process.env.DB_PORT || "3307", 10);
const frontendUrls =
  VALID_FRONTEND_URLS.length > 0 ? VALID_FRONTEND_URLS : [FALLBACK_FRONTEND_URL];
const frontendOrigins = [...new Set(frontendUrls.map((value) => new URL(value).origin))];

const config = {
  env: ENV,
  envFile: ENV_FILE,
  envPath: ENV_PATH,
  port: Number(process.env.PORT || 3000),
  frontendUrl: frontendUrls[0], // Usado para CORS default
  frontendUrls,
  frontendOrigins,
  aps: {
    clientId: process.env.APS_CLIENT_ID,
    clientSecret: process.env.APS_CLIENT_SECRET,
    callbackUrl: process.env.APS_CALLBACK_URL,
    baseUrl:
      process.env.AUTODESK_BASE_URL ||
      process.env.APS_BASE_URL ||
      "https://developer.api.autodesk.com",
  },
  database: {
    client: process.env.DB_CLIENT || "mysql2",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME,
      port: Number.isFinite(dbPort) ? dbPort : 3307,
    },
  },
};

module.exports = config;