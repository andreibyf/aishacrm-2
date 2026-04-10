import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = 'theresea@labordepotllc.com';

const { data: user, error: userError } = await supabase
  .from('users')
  .select('id,email,role,employee_role,perm_notes_anywhere,perm_all_records,tenant_id')
  .ilike('email', email)
  .maybeSingle();

if (userError) {
  console.error('USER_ERR', userError.message);
  process.exit(1);
}

console.log('USER', JSON.stringify(user, null, 2));

if (user === null) {
  console.log('User not found');
  process.exit(0);
}

const { data: members, error: memberError } = await supabase
  .from('team_members')
  .select('team_id,role,access_level,user_id,employee_id')
  .or(`user_id.eq.${user.id},employee_id.eq.${user.id}`)
  .order('team_id');

if (memberError) {
  console.error('MEM_ERR', memberError.message);
  process.exit(1);
}

console.log('TEAM_MEMBERS', JSON.stringify(members, null, 2));