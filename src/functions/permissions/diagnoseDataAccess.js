/**
 * diagnoseDataAccess
 * Server-side function for your backend
 */

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get the user from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "No authorization header" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return Response.json({ error: "Authentication failed", details: authError }, { status: 401 });
    }

    // Get User record
    const { data: userRecord, error: userError } = await supabase
      .from("User")
      .select("*")
      .eq("email", user.email)
      .single();

    if (userError) {
      return Response.json({ 
        error: "Failed to get user record", 
        details: userError,
        userEmail: user.email 
      }, { status: 500 });
    }

    // Get all opportunities with tenant filter
    const { data: allOpportunities, error: oppError } = await supabase
      .from("Opportunity")
      .select("*");

    // Get opportunities with user's tenant filter
    const { data: tenantOpportunities, error: tenantOppError } = await supabase
      .from("Opportunity")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id);

    const diagnostics = {
      user: {
        email: user.email,
        auth_id: user.id
      },
      userRecord: {
        email: userRecord.email,
        role: userRecord.role,
        employee_role: userRecord.employee_role,
        tenant_id: userRecord.tenant_id,
        permissions: userRecord.permissions,
        navigation_permissions: userRecord.navigation_permissions
      },
      dataAccess: {
        totalOpportunitiesInSystem: allOpportunities?.length || 0,
        opportunitiesInUserTenant: tenantOpportunities?.length || 0,
        tenantFilter: { tenant_id: userRecord.tenant_id }
      },
      opportunitiesSample: tenantOpportunities?.slice(0, 3) || [],
      errors: {
        oppError,
        tenantOppError
      }
    };

    return Response.json({ success: true, diagnostics });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

----------------------------

export default diagnoseDataAccess;
