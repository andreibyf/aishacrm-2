/**
 * validateEntityReferences
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Backend validation function for entity references
 * Called before create/update operations to ensure data integrity
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entityType, entityData, tenantId } = await req.json();

    if (!entityType || !entityData) {
      return Response.json({ 
        error: 'Missing required parameters: entityType, entityData' 
      }, { status: 400 });
    }

    const tenant = tenantId || user.tenant_id;
    if (!tenant) {
      return Response.json({ 
        error: 'No tenant context available' 
      }, { status: 400 });
    }

    const errors = [];

    // Validate based on entity type
    switch (entityType) {
      case 'Contact':
        // Validate account_id
        if (entityData.account_id) {
          try {
            const account = await base44.entities.Account.get(entityData.account_id);
            if (!account || account.tenant_id !== tenant) {
              errors.push({ 
                field: 'account_id', 
                error: 'Account does not exist or belongs to different tenant' 
              });
            }
          } catch (error) {
            errors.push({ field: 'account_id', error: 'Account validation failed' });
          }
        }

        // Validate assigned_to
        if (entityData.assigned_to) {
          try {
            const employees = await base44.entities.Employee.filter({
              tenant_id: tenant,
              $or: [
                { email: entityData.assigned_to },
                { user_email: entityData.assigned_to }
              ]
            });
            if (!employees || employees.length === 0) {
              errors.push({ field: 'assigned_to', error: 'Employee not found' });
            } else if (!employees[0].is_active) {
              errors.push({ field: 'assigned_to', error: 'Employee is inactive' });
            }
          } catch (error) {
            errors.push({ field: 'assigned_to', error: 'Employee validation failed' });
          }
        }
        break;

      case 'Lead':
        // Validate account_id
        if (entityData.account_id) {
          try {
            const account = await base44.entities.Account.get(entityData.account_id);
            if (!account || account.tenant_id !== tenant) {
              errors.push({ 
                field: 'account_id', 
                error: 'Account does not exist or belongs to different tenant' 
              });
            }
          } catch (error) {
            errors.push({ field: 'account_id', error: 'Account validation failed' });
          }
        }

        // Validate assigned_to
        if (entityData.assigned_to) {
          try {
            const employees = await base44.entities.Employee.filter({
              tenant_id: tenant,
              $or: [
                { email: entityData.assigned_to },
                { user_email: entityData.assigned_to }
              ]
            });
            if (!employees || employees.length === 0) {
              errors.push({ field: 'assigned_to', error: 'Employee not found' });
            } else if (!employees[0].is_active) {
              errors.push({ field: 'assigned_to', error: 'Employee is inactive' });
            }
          } catch (error) {
            errors.push({ field: 'assigned_to', error: 'Employee validation failed' });
          }
        }

        // Validate converted references
        if (entityData.converted_contact_id) {
          try {
            const contact = await base44.entities.Contact.get(entityData.converted_contact_id);
            if (!contact || contact.tenant_id !== tenant) {
              errors.push({ 
                field: 'converted_contact_id', 
                error: 'Contact does not exist or belongs to different tenant' 
              });
            }
          } catch (error) {
            errors.push({ field: 'converted_contact_id', error: 'Contact validation failed' });
          }
        }

        if (entityData.converted_account_id) {
          try {
            const account = await base44.entities.Account.get(entityData.converted_account_id);
            if (!account || account.tenant_id !== tenant) {
              errors.push({ 
                field: 'converted_account_id', 
                error: 'Account does not exist or belongs to different tenant' 
              });
            }
          } catch (error) {
            errors.push({ field: 'converted_account_id', error: 'Account validation failed' });
          }
        }
        break;

      case 'Opportunity':
        // Validate account_id
        if (entityData.account_id) {
          try {
            const account = await base44.entities.Account.get(entityData.account_id);
            if (!account || account.tenant_id !== tenant) {
              errors.push({ 
                field: 'account_id', 
                error: 'Account does not exist or belongs to different tenant' 
              });
            }
          } catch (error) {
            errors.push({ field: 'account_id', error: 'Account validation failed' });
          }
        }

        // Validate contact_id
        if (entityData.contact_id) {
          try {
            const contact = await base44.entities.Contact.get(entityData.contact_id);
            if (!contact || contact.tenant_id !== tenant) {
              errors.push({ 
                field: 'contact_id', 
                error: 'Contact does not exist or belongs to different tenant' 
              });
            }
          } catch (error) {
            errors.push({ field: 'contact_id', error: 'Contact validation failed' });
          }
        }

        // Validate assigned_to
        if (entityData.assigned_to) {
          try {
            const employees = await base44.entities.Employee.filter({
              tenant_id: tenant,
              $or: [
                { email: entityData.assigned_to },
                { user_email: entityData.assigned_to }
              ]
            });
            if (!employees || employees.length === 0) {
              errors.push({ field: 'assigned_to', error: 'Employee not found' });
            } else if (!employees[0].is_active) {
              errors.push({ field: 'assigned_to', error: 'Employee is inactive' });
            }
          } catch (error) {
            errors.push({ field: 'assigned_to', error: 'Employee validation failed' });
          }
        }
        break;

      case 'Activity':
        // Validate polymorphic references
        if (entityData.related_to && entityData.related_id) {
          try {
            let relatedEntity;
            switch (entityData.related_to) {
              case 'contact':
                relatedEntity = await base44.entities.Contact.get(entityData.related_id);
                break;
              case 'account':
                relatedEntity = await base44.entities.Account.get(entityData.related_id);
                break;
              case 'lead':
                relatedEntity = await base44.entities.Lead.get(entityData.related_id);
                break;
              case 'opportunity':
                relatedEntity = await base44.entities.Opportunity.get(entityData.related_id);
                break;
              default:
                errors.push({ 
                  field: 'related_to', 
                  error: `Unknown entity type: ${entityData.related_to}` 
                });
            }

            if (relatedEntity && relatedEntity.tenant_id !== tenant) {
              errors.push({ 
                field: 'related_id', 
                error: 'Related entity belongs to different tenant' 
              });
            } else if (!relatedEntity && !errors.some(e => e.field === 'related_to')) {
              errors.push({ 
                field: 'related_id', 
                error: `${entityData.related_to} does not exist` 
              });
            }
          } catch (error) {
            errors.push({ field: 'related_id', error: 'Related entity validation failed' });
          }
        }

        // Validate assigned_to
        if (entityData.assigned_to) {
          try {
            const employees = await base44.entities.Employee.filter({
              tenant_id: tenant,
              $or: [
                { email: entityData.assigned_to },
                { user_email: entityData.assigned_to }
              ]
            });
            if (!employees || employees.length === 0) {
              errors.push({ field: 'assigned_to', error: 'Employee not found' });
            } else if (!employees[0].is_active) {
              errors.push({ field: 'assigned_to', error: 'Employee is inactive' });
            }
          } catch (error) {
            errors.push({ field: 'assigned_to', error: 'Employee validation failed' });
          }
        }
        break;

      default:
        return Response.json({ 
          error: `Unsupported entity type: ${entityType}` 
        }, { status: 400 });
    }

    return Response.json({
      valid: errors.length === 0,
      errors: errors
    });

  } catch (error) {
    console.error("Validation error:", error);
    return Response.json({ 
      error: error.message || 'Validation failed',
      valid: false
    }, { status: 500 });
  }
});

----------------------------

export default validateEntityReferences;
