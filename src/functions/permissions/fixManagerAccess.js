/**
 * fixManagerAccess
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

    // Get current user record
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

    // Update user to have manager employee_role
    const { data: updated, error: updateError } = await supabase
      .from('User')
      .update({ 
        employee_role: 'manager',
        updated_date: new Date().toISOString()
      })
      .eq('email', userEmail)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to update user',
        details: updateError 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully set employee_role to 'manager' for ${userEmail}`,
      before: {
        role: user.role,
        employee_role: user.employee_role
      },
      after: {
        role: updated.role,
        employee_role: updated.employee_role
      }
    }, null, 2), {
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

export default fixManagerAccess;
