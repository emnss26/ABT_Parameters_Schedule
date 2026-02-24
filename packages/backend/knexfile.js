const fs = require("fs")
const path = require("path")

const dbFilename =
  process.env.SQLITE_PATH || path.join(__dirname, "data", "abitat.sqlite3")

const dbDir = path.dirname(dbFilename)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

module.exports = {
  development: {
    client: "sqlite3",
    connection: {
      filename: dbFilename,
    },
    useNullAsDefault: true,
  },
}
