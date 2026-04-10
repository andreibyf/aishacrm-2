import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = '5a3eec5c-ddf2-42a2-9624-867811157595';

const { data: updatedMemberships, error: updateError } = await supabase
  .from('team_members')
  .update({ role: 'director', access_level: 'manage_team' })
  .or(`user_id.eq.${userId},employee_id.eq.${userId}`)
  .select('id,team_id,role,access_level,user_id,employee_id');

if (updateError) {
  console.error('UPDATE_ERR', updateError.message);
  process.exit(1);
}

console.log('UPDATED_MEMBERSHIPS', JSON.stringify(updatedMemberships, null, 2));