require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    await client.connect();

    const result = await client.query("SELECT NOW()");

    console.log("✅ PostgreSQL connected successfully!");
    console.log(result.rows[0]);

    await client.end();
  } catch (error) {
    console.error("❌ Database connection failed:");
    console.error(error.message);
  }
}

testConnection();