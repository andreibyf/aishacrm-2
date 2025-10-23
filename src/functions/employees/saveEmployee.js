/**
 * saveEmployee
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { employeeId, employeeData, tenantId } = body;

    // Validate required fields ONLY for new employee creation
    // Require at least one name field, default the other to 'UNK'
    if (!employeeId && (!employeeData || (!employeeData.first_name && !employeeData.last_name))) {
      return Response.json({ 
        error: 'Missing required fields: at least first_name or last_name is required for new employees' 
      }, { status: 400 });
    }

    // Default missing name to 'UNK' for new employees
    if (!employeeId && employeeData) {
      if (!employeeData.first_name) employeeData.first_name = 'UNK';
      if (!employeeData.last_name) employeeData.last_name = 'UNK';
    }

    // Check permissions
    const canManageEmployees = 
      user.role === 'superadmin' || 
      user.role === 'admin' || 
      user.permissions?.can_manage_users ||
      user.tier === 'Tier3' ||
      user.tier === 'Tier4';

    if (!canManageEmployees) {
      return Response.json({ 
        error: 'Insufficient permissions to manage employees' 
      }, { status: 403 });
    }

    let result;
    
    if (employeeId) {
      // Update existing employee - allow partial updates
      console.log(`Updating employee ${employeeId} with data:`, employeeData);
      result = await base44.asServiceRole.entities.Employee.update(employeeId, employeeData);
    } else {
      // Create new employee - require tenant_id
      if (!tenantId) {
        return Response.json({ 
          error: 'tenant_id is required for creating new employees' 
        }, { status: 400 });
      }
      
      console.log(`Creating employee with data:`, { ...employeeData, tenant_id: tenantId });
      result = await base44.asServiceRole.entities.Employee.create({
        ...employeeData,
        tenant_id: tenantId
      });
    }

    return Response.json({ 
      success: true, 
      employee: result 
    });

  } catch (error) {
    console.error('Error saving employee:', error);
    return Response.json({ 
      error: error.message || 'Failed to save employee' 
    }, { status: 500 });
  }
});

----------------------------

export default saveEmployee;
