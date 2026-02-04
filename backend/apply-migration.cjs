#!/usr/bin/env node
/**
 * Simple SQL migration runner using pg library
 */

const fs = require('fs');
const { Pool } = require('pg');

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node apply-migration.js <sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  const client = await pool.connect();
  try {
    console.log(`Applying migration: ${sqlFile}`);
    const result = await client.query(sql);
    console.log('Migration applied successfully');
    console.log('Result:', result.command, result.rowCount || '');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
