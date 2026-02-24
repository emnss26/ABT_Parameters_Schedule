// utils/db/knex.js
const path = require("path");
const knexLib = require("knex");
const knexfile = require("../../knexfile");

const env = process.env.NODE_ENV || "development";
const cfg = knexfile[env];

// ✅ filename absoluto (evita “estoy en otra DB sin querer”)
const filename = cfg?.connection?.filename
  ? path.resolve(process.cwd(), cfg.connection.filename)
  : undefined;

const knex = knexLib({
  ...cfg,
  connection: filename ? { ...cfg.connection, filename } : cfg.connection,
  pool: {
    ...cfg.pool,
    afterCreate: (conn, done) => {
      // ✅ reduce “SQLITE_BUSY: database is locked”
      conn.run("PRAGMA journal_mode = WAL;", (err) => {
        if (err) return done(err);
        conn.run("PRAGMA busy_timeout = 5000;", done);
      });
    },
  },
});

module.exports = knex;
