import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: users, error: usersError } = await supabase
  .from('users')
  .select('id,email,role,employee_role,perm_notes_anywhere,perm_all_records,tenant_id')
  .ilike('email', '%labordepotllc.com%')
  .order('email');

if (usersError) {
  console.error('USERS_ERR', usersError.message);
  process.exit(1);
}

console.log('USERS', JSON.stringify(users, null, 2));

const { data: employees, error: employeesError } = await supabase
  .from('employees')
  .select('id,email,role,tenant_id,first_name,last_name')
  .ilike('email', '%labordepotllc.com%')
  .order('email');

if (employeesError) {
  console.error('EMPLOYEES_ERR', employeesError.message);
  process.exit(1);
}

console.log('EMPLOYEES', JSON.stringify(employees, null, 2));