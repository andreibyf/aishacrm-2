/**
 * diagnoseUserAccess
 * Server-side function for your backend
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ 
        error: 'Missing Supabase credentials' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { userEmail } = await req.json();
    
    if (!userEmail) {
      return new Response(JSON.stringify({ 
        error: 'userEmail is required' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user record
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ 
        error: 'User not found',
        details: userError 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check what they should see based on RLS
    const diagnosis = {
      user: {
        email: user.email,
        role: user.role,
        employee_role: user.employee_role,
        tenant_id: user.tenant_id,
        full_name: user.full_name
      },
      access_analysis: {
        is_admin: user.role === 'admin' || user.role === 'superadmin',
        is_manager: user.employee_role === 'manager',
        is_employee: user.employee_role === 'employee',
        should_see_all_tenant_data: user.role === 'admin' || user.role === 'superadmin' || user.employee_role === 'manager',
        should_see_only_own_data: user.employee_role === 'employee'
      },
      issues: []
    };

    // Identify issues
    if (user.role === 'admin' || user.role === 'superadmin') {
      diagnosis.issues.push('✅ User has admin/superadmin role - should see all data');
    } else if (user.employee_role === 'manager') {
      diagnosis.issues.push('✅ User has manager employee_role - should see all tenant data');
    } else if (user.employee_role === 'employee') {
      diagnosis.issues.push('✅ User has employee employee_role - should see only their own data');
    } else if (!user.employee_role) {
      diagnosis.issues.push('⚠️ ISSUE: User has no employee_role set - RLS may block access');
      diagnosis.suggested_fix = {
        action: 'Set employee_role to "manager" for this user',
        sql: `UPDATE "User" SET employee_role = 'manager' WHERE email = '${userEmail}';`
      };
    }

    // Try to count visible records
    try {
      const { count: oppCount } = await supabase
        .from('Opportunity')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.tenant_id);
      
      diagnosis.visible_records = {
        opportunities: oppCount || 0
      };

      const { count: actCount } = await supabase
        .from('Activity')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.tenant_id);
      
      diagnosis.visible_records.activities = actCount || 0;

    } catch (countError) {
      diagnosis.issues.push('❌ Error counting records: ' + countError.message);
    }

    return new Response(JSON.stringify(diagnosis, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

----------------------------

export default diagnoseUserAccess;
