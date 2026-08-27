const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  // DO NOT use keepAlive with Supavisor pooler, it causes unexpectedly terminated connections
});

// Handle idle connection errors gracefully (prevents ECONNRESET process crashes)
pool.on("error", (err, client) => {
  console.warn("PostgreSQL pool idle client error (Supabase pooler closed it):", err.message);
});

module.exports = pool;