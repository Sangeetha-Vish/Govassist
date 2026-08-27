const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

// Handle idle connection errors gracefully (prevents ECONNRESET process crashes)
pool.on("error", (err) => {
  console.warn("PostgreSQL pool idle client notice (reconnected automatically):", err.message);
});

module.exports = pool;