
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUser() {
  const emails = ['andrei.byfield@gmail.com', 'abyfield@4vdataconsulting.com'];
  for (const email of emails) {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, tenant_id, role')
      .eq('email', email);

    if (users && users.length > 0) {
      console.log(`User ${email} found:`, users[0]);
    } else {
      console.log(`User ${email} not found.`);
    }
  }
}

checkUser();
