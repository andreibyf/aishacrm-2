/**
 * updateEmployeeSecure
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    // Method validation check from original code (not explicitly in outline but good practice)
    // The outline removed it, so following outline explicitly removes it.
    // if (req.method !== 'POST') {
    //   return Response.json({ error: 'Method not allowed' }, { status: 405 });
    // }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { employee_id, updates } = await req.json();

    if (!employee_id || !updates) {
      return Response.json({ 
        error: 'employee_id and updates are required' 
      }, { status: 400 });
    }

    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'mobile',
      'department', 'job_title', 'employment_status', 'employment_type',
      'address_1', 'address_2', 'city', 'state', 'zip',
      'notes', 'tags', 'is_active'
    ];

    const safeUpdates = {};
    allowedFields.forEach(field => {
      // Using Object.prototype.hasOwnProperty.call for robust check
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        safeUpdates[field] = updates[field];
      }
    });

    if (Object.keys(safeUpdates).length === 0) {
      return Response.json({ 
        error: 'No valid fields to update' 
      }, { status: 400 });
    }

    const updatedEmployee = await base44.asServiceRole.entities.Employee.update(
      employee_id,
      safeUpdates
    );

    return Response.json({
      success: true,
      employee: updatedEmployee
    });

  } catch (error) {
    console.error('Error in updateEmployeeSecure:', error); // Added console.error as per outline
    return Response.json({ 
      error: error?.message || 'Internal error' // Adjusted to include optional chaining for safety
    }, { status: 500 });
  }
});


----------------------------

export default updateEmployeeSecure;
