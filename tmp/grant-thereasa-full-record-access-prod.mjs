import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = 'thereasa@labordepotllc.com';

const { data: updated, error } = await supabase
  .from('users')
  .update({
    role: 'admin',
    perm_all_records: true,
    perm_notes_anywhere: true,
  })
  .eq('email', email)
  .select('id,email,role,employee_role,perm_notes_anywhere,perm_all_records,tenant_id');

if (error) {
  console.error('UPDATE_ERR', error.message);
  process.exit(1);
}

console.log('UPDATED_ROWS', JSON.stringify(updated, null, 2));

if (!updated || updated.length === 0) {
  console.error('No rows updated. Check email spelling.');
  process.exit(1);
}

const { data: memberships, error: membershipError } = await supabase
  .from('team_members')
  .select('id,team_id,role,access_level,user_id,employee_id')
  .or(`user_id.eq.${updated[0].id},employee_id.eq.${updated[0].id}`)
  .order('team_id');

if (membershipError) {
  console.error('MEMBERSHIP_ERR', membershipError.message);
  process.exit(1);
}

console.log('TEAM_MEMBERS', JSON.stringify(memberships, null, 2));