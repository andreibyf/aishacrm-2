#!/usr/bin/env node
/**
 * Migration Runner - Execute SQL files directly via PostgreSQL connection
 * Usage: node run-migration.js <sql-file> <connection-string>
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

async function runMigration(sqlFile, connectionString) {
  const client = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    console.log(`Connecting to database...`);
    await client.connect();
    
    console.log(`Reading SQL file: ${sqlFile}`);
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log(`Executing migration...`);
    const result = await client.query(sql);
    
    console.log(`✅ Migration completed successfully`);
    console.log(`Rows affected: ${result.rowCount || 'N/A'}`);
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error(`❌ Migration failed:`);
    console.error(error.message);
    if (error.position) {
      console.error(`Error at position: ${error.position}`);
    }
    await client.end();
    process.exit(1);
  }
}

// Parse command line arguments
const sqlFile = process.argv[2];
const connectionString = process.argv[3];

if (!sqlFile || !connectionString) {
  console.error('Usage: node run-migration.js <sql-file> <connection-string>');
  process.exit(1);
}

if (!fs.existsSync(sqlFile)) {
  console.error(`Error: SQL file not found: ${sqlFile}`);
  process.exit(1);
}

runMigration(sqlFile, connectionString);
