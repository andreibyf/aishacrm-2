/**
 * syncDatabase
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
import { Client } from 'npm:pg';

const ENTITY_SCHEMAS = {
  Contact: {
    tenant_id: 'VARCHAR(255)', assigned_to: 'VARCHAR(255)', first_name: 'VARCHAR(255)',
    last_name: 'VARCHAR(255)', email: 'VARCHAR(255)', phone: 'VARCHAR(255)', mobile: 'VARCHAR(255)',
    job_title: 'VARCHAR(255)', department: 'VARCHAR(255)', account_id: 'VARCHAR(255)',
    lead_source: 'VARCHAR(255)', status: 'VARCHAR(255)', address_1: 'TEXT', address_2: 'TEXT',
    city: 'VARCHAR(255)', state: 'VARCHAR(255)', zip: 'VARCHAR(255)', country: 'VARCHAR(255)',
    notes: 'TEXT', tags: 'JSONB', score: 'NUMERIC', score_reason: 'TEXT',
    ai_action: 'VARCHAR(255)', last_contacted: 'TIMESTAMP WITH TIME ZONE', next_action: 'TEXT',
    activity_metadata: 'JSONB'
  },
  Account: {
    tenant_id: 'VARCHAR(255)', assigned_to: 'VARCHAR(255)', name: 'VARCHAR(255)',
    type: 'VARCHAR(255)', industry: 'VARCHAR(255)', website: 'VARCHAR(255)', phone: 'VARCHAR(255)',
    email: 'VARCHAR(255)', annual_revenue: 'NUMERIC', employee_count: 'INTEGER',
    address_1: 'TEXT', address_2: 'TEXT', city: 'VARCHAR(255)', state: 'VARCHAR(255)',
    zip: 'VARCHAR(255)', country: 'VARCHAR(255)', description: 'TEXT', tags: 'JSONB'
  },
  Lead: {
    tenant_id: 'VARCHAR(255)', assigned_to: 'VARCHAR(255)', first_name: 'VARCHAR(255)',
    last_name: 'VARCHAR(255)', email: 'VARCHAR(255)', phone: 'VARCHAR(255)', company: 'VARCHAR(255)',
    job_title: 'VARCHAR(255)', source: 'VARCHAR(255)', status: 'VARCHAR(255)',
    score: 'NUMERIC', score_reason: 'TEXT', ai_action: 'VARCHAR(255)',
    last_contacted: 'TIMESTAMP WITH TIME ZONE', next_action: 'TEXT', activity_metadata: 'JSONB',
    estimated_value: 'NUMERIC', notes: 'TEXT', converted_contact_id: 'VARCHAR(255)',
    converted_account_id: 'VARCHAR(255)', address_1: 'TEXT', address_2: 'TEXT', city: 'VARCHAR(255)',
    state: 'VARCHAR(255)', zip: 'VARCHAR(255)', country: 'VARCHAR(255)', tags: 'JSONB'
  },
  Opportunity: {
    tenant_id: 'VARCHAR(255)', assigned_to: 'VARCHAR(255)', name: 'VARCHAR(255)',
    account_id: 'VARCHAR(255)', contact_id: 'VARCHAR(255)', stage: 'VARCHAR(255)',
    amount: 'NUMERIC', probability: 'NUMERIC', close_date: 'TIMESTAMP WITH TIME ZONE',
    lead_source: 'VARCHAR(255)', type: 'VARCHAR(255)', description: 'TEXT',
    next_step: 'TEXT', competitor: 'VARCHAR(255)', tags: 'JSONB'
  },
  Activity: {
    tenant_id: 'VARCHAR(255)', assigned_to: 'VARCHAR(255)', type: 'VARCHAR(255)',
    subject: 'TEXT', description: 'TEXT', status: 'VARCHAR(255)', priority: 'VARCHAR(255)',
    due_date: 'TIMESTAMP WITH TIME ZONE', due_time: 'VARCHAR(255)', duration: 'NUMERIC',
    related_to: 'VARCHAR(255)', related_id: 'VARCHAR(255)', outcome: 'TEXT', location: 'TEXT'
  }
};

// Helper to parse and validate connection string
function parseConnectionString(connectionString) {
    try {
        console.log('Parsing connection string (password hidden)');
        
        if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
            const url = new URL(connectionString);
            
            const sslParam = url.searchParams.get('ssl') || url.searchParams.get('sslmode');
            let sslConfig = false; 
            
            if (sslParam === 'true' || sslParam === 'require') {
                sslConfig = { rejectUnauthorized: false };
            }
            
            const config = {
                host: url.hostname,
                port: parseInt(url.port) || 5432,
                database: url.pathname.slice(1),
                user: url.username,
                password: url.password,
                ssl: sslConfig,
                connectionTimeoutMillis: 10000,
                query_timeout: 30000
            };
            
            console.log('Connection config:', {
                host: config.host,
                port: config.port,
                database: config.database,
                user: config.user,
                ssl: config.ssl
            });
            
            return config;
        }
        
        throw new Error('Only PostgreSQL connection string format is supported');
    } catch (error) {
        console.error('Connection string parse error:', error.message);
        throw new Error(`Invalid connection string: ${error.message}`);
    }
}

// Test connection with better error messages
async function testConnection(config) {
    let client = null;
    try {
        console.log(`Testing connection to ${config.host}:${config.port}/${config.database}`);
        client = new Client(config);
        await client.connect();
        
        const result = await client.query('SELECT NOW() as server_time, version() as pg_version');
        console.log('Connection successful!');
        console.log('Server time:', result.rows[0].server_time);
        
        return true;
    } catch (error) {
        console.error('Connection test failed:', error.message);
        if (error.message.includes('database') && error.message.includes('does not exist')) {
            throw new Error(`Database "${config.database}" does not exist. Please create it first.`);
        }
        throw new Error(`Database connection failed: ${error.message}`);
    } finally {
        if (client) {
            try { await client.end(); } catch (e) { console.warn('Error closing test connection:', e.message); }
        }
    }
}

async function createTableFromSchema(client, entityName) {
    const tableName = entityName.toLowerCase();
    const schema = ENTITY_SCHEMAS[entityName];

    if (!schema) {
        throw new Error(`No schema defined for entity: ${entityName}`);
    }

    try {
        console.log(`Creating table for ${entityName}...`);
        await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);

        const standardColumns = [
            'id VARCHAR(255) PRIMARY KEY',
            'created_date TIMESTAMP WITH TIME ZONE',
            'updated_date TIMESTAMP WITH TIME ZONE',
            'created_by VARCHAR(255)'
        ];

        const schemaColumns = Object.entries(schema).map(([key, value]) => `${key.toLowerCase()} ${value}`);
        
        const allColumns = [...standardColumns, ...schemaColumns];
        
        const createSql = `CREATE TABLE ${tableName} (${allColumns.join(', ')})`;
        await client.query(createSql);
        console.log(`Table ${tableName} created successfully.`);
        
        return tableName;
    } catch (error) {
        console.error(`Error creating table ${tableName}:`, error.message);
        throw error;
    }
}


// Sync data to table
async function syncEntityData(base44, client, entityName) {
    try {
        console.log(`Syncing ${entityName} data...`);
        const records = await base44.asServiceRole.entities[entityName].list();
        
        const tableName = await createTableFromSchema(client, entityName);
        
        if (records.length === 0) {
            console.log(`No ${entityName} records found, but table created.`);
            return 0;
        }

        let syncedCount = 0;
        
        for (const record of records) {
            try {
                // Ensure all required schema fields exist on the record, even if null
                const schemaKeys = Object.keys(ENTITY_SCHEMAS[entityName]);
                const completeRecord = { 
                    id: record.id, 
                    created_date: record.created_date,
                    updated_date: record.updated_date,
                    created_by: record.created_by
                }; // Start with standard base44 fields

                for (const key of schemaKeys) {
                    completeRecord[key] = record[key] !== undefined ? record[key] : null;
                }
                
                const fields = Object.keys(completeRecord);
                const values = fields.map(field => {
                    const value = completeRecord[field];
                    return (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
                });
                
                const placeholders = fields.map((_, i) => `$${i + 1}`);
                const insertSql = `INSERT INTO ${tableName} (${fields.map(f => f.toLowerCase()).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO NOTHING`;
                
                await client.query(insertSql, values);
                syncedCount++;
            } catch (recordError) {
                console.warn(`Failed to sync record ${record.id} for ${entityName}:`, recordError.message);
            }
        }
        
        console.log(`Synced ${syncedCount}/${records.length} ${entityName} records`);
        return syncedCount;
    } catch (error) {
        console.error(`Error syncing ${entityName}:`, error.message);
        throw error;
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        console.log('Current user role:', user?.role);
        console.log('Has database_connection_string field:', 'database_connection_string' in user);
        console.log('Connection string value exists:', !!user?.database_connection_string);
        
        if (user?.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized: Admin role required.' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const connectionString = user.database_connection_string; // Updated to database_connection_string
        
        if (!connectionString) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Please configure your database connection string first',
                debug: {
                    userHasField: 'database_connection_string' in user,
                    allUserFields: Object.keys(user)
                }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        console.log('Starting database sync...');
        const config = parseConnectionString(connectionString);
        await testConnection(config);
        
        const client = new Client(config);
        await client.connect();
        
        try {
            console.log('Connected! Starting data sync...');
            const entities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'];
            let totalSynced = 0;
            const results = [];
            
            for (const entity of entities) {
                try {
                    const count = await syncEntityData(base44, client, entity);
                    totalSynced += count;
                    results.push(`${entity}: ${count} records`);
                } catch (error) {
                    console.error(`Failed to sync ${entity}:`, error.message);
                    results.push(`${entity}: failed`);
                }
            }
            
            return new Response(JSON.stringify({
                status: 'success',
                message: `Database sync completed! Total records synced: ${totalSynced}`,
                details: results
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            
        } finally {
            await client.end();
        }
        
    } catch (error) {
        console.error('Sync error:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message || 'An unexpected error occurred during synchronization.',
            stack: error.stack // Changed from 'details' to 'stack'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});


----------------------------

export default syncDatabase;
