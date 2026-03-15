require("dotenv").config();

const ENV = process.env.NODE_ENV || "development";

const REQUIRED_ENV_VARS = ["APS_CLIENT_ID", "APS_CLIENT_SECRET", "APS_CALLBACK_URL"];

if (ENV === "production") {
  REQUIRED_ENV_VARS.push("SESSION_COOKIE_SECRET");
}

for (const key of REQUIRED_ENV_VARS) {
  if (!String(process.env[key] ?? "").trim()) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const config = {
  env: ENV,
  port: process.env.PORT || 3000,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  aps: {
    clientId: process.env.APS_CLIENT_ID,
    clientSecret: process.env.APS_CLIENT_SECRET,
    callbackUrl: process.env.APS_CALLBACK_URL,
    baseUrl: process.env.APS_BASE_URL || "https://developer.api.autodesk.com",
  },
  database: {
    client: process.env.DB_CLIENT || "mysql2",
    connection: {
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "abt_parameters_db",
      port: Number(process.env.DB_PORT || 3306),
    },
  },
};

module.exports = config;
