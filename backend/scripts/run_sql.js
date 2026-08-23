require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function runSQL() {
  try {
    await client.connect();
    
    // 1. Run the main schema.sql to create the documents table and its RLS
    const schemaPath = path.join(__dirname, "../config/schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf-8");
    console.log("Running schema.sql...");
    await client.query(sql);
    console.log("schema.sql executed successfully.");

    // 2. Storage Bucket Creation and RLS
    console.log("Setting up storage bucket and RLS...");
    const storageSql = `
      -- Create bucket
      INSERT INTO storage.buckets (id, name, public) 
      VALUES ('citizen_documents', 'citizen_documents', false) 
      ON CONFLICT (id) DO NOTHING;

      -- Allow users to upload to their own folder
      DROP POLICY IF EXISTS "Users can insert own documents in storage" ON storage.objects;
      CREATE POLICY "Users can insert own documents in storage" 
      ON storage.objects FOR INSERT 
      TO authenticated 
      WITH CHECK (bucket_id = 'citizen_documents' AND (storage.foldername(name))[1] = auth.uid()::text);

      -- Allow users to view their own documents
      DROP POLICY IF EXISTS "Users can view own documents in storage" ON storage.objects;
      CREATE POLICY "Users can view own documents in storage" 
      ON storage.objects FOR SELECT 
      TO authenticated 
      USING (bucket_id = 'citizen_documents' AND (storage.foldername(name))[1] = auth.uid()::text);
    `;
    await client.query(storageSql);
    console.log("Storage setup executed successfully.");

    await client.end();
  } catch (error) {
    console.error("❌ SQL Execution failed:");
    console.error(error);
    await client.end();
  }
}

runSQL();
