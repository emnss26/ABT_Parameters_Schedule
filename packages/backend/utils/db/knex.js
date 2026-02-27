const knexLib = require("knex");
const knexfile = require("../../knexfile");

const env = process.env.NODE_ENV || "development";
const cfg = knexfile[env];

if (!cfg) {
  throw new Error(`Knex config not found for env: ${env}`);
}

const knex = knexLib(cfg);

module.exports = knex;
