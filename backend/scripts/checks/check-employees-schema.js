import { initSupabaseDB, getSupabaseClient } from './lib/supabase-db.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkEmployeesSchema() {
  try {
    // Initialize Supabase first with credentials from environment
    initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = getSupabaseClient();
    
    console.log('\n👔 CHECKING EMPLOYEES TABLE SCHEMA:\n');
    
    // Try to fetch one employee to see the actual structure
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error fetching employees:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log('✅ Sample employee record fields:');
      console.log(Object.keys(data[0]).join(', '));
      console.log('\n📋 Full sample record:');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('ℹ️ No employees found in database');
      console.log('Attempting to describe table structure via error...');
      
      // Try inserting invalid data to see what fields are expected
      const { error: insertError } = await supabase
        .from('employees')
        .insert([{ test_field: 'test' }]);
      
      if (insertError) {
        console.log('\n📝 Insert error reveals schema info:');
        console.log(insertError.message);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkEmployeesSchema();
