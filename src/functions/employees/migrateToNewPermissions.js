/**
 * migrateToNewPermissions
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Migration function to convert existing tier-based permissions to new role-based system
 * 
 * Old system: Tier1, Tier2, Tier3, Tier4 + power-user/user roles
 * New system: employee, manager, admin, superadmin roles
 * 
 * Migration mapping:
 * - Tier1, Tier2, "user" role → "employee" role
 * - Tier3, Tier4, "power-user" role → "manager" role
 * - "admin" role → stays "admin"
 * - "superadmin" role → stays "superadmin"
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    // Only superadmins can run this migration
    if (!currentUser || currentUser.role !== 'superadmin') {
      return Response.json({ 
        success: false, 
        error: 'Only superadmins can run this migration' 
      }, { status: 403 });
    }

    // Get all users
    const allUsers = await base44.asServiceRole.entities.User.list();
    
    const migrationResults = {
      total: allUsers.length,
      migrated: 0,
      skipped: 0,
      errors: [],
      changes: []
    };

    for (const user of allUsers) {
      try {
        let newRole = user.role;
        let needsUpdate = false;
        const changes = { userId: user.id, email: user.email, from: user.role, to: null };

        // Determine new role based on old tier and role
        if (user.role === 'superadmin' || user.role === 'admin') {
          // Keep superadmin and admin as-is
          changes.to = user.role;
          changes.action = 'kept';
        } else if (user.role === 'power-user' || user.tier === 'Tier3' || user.tier === 'Tier4') {
          // power-user or Tier3/Tier4 → manager
          newRole = 'manager';
          needsUpdate = true;
          changes.to = 'manager';
          changes.action = 'upgraded to manager';
        } else if (user.role === 'user' || user.tier === 'Tier1' || user.tier === 'Tier2' || !user.tier) {
          // user or Tier1/Tier2 or no tier → employee
          newRole = 'employee';
          needsUpdate = true;
          changes.to = 'employee';
          changes.action = 'set to employee';
        }

        if (needsUpdate) {
          // Update user with new role
          const updates = { role: newRole };
          
          // Set default permissions based on new role
          if (newRole === 'manager') {
            updates.permissions = {
              ...(user.permissions || {}),
              can_export_data: true,
              can_manage_calendar: true
            };
          } else if (newRole === 'employee') {
            updates.permissions = {
              ...(user.permissions || {}),
              can_export_data: false,
              can_manage_users: false,
              can_manage_settings: false
            };
          }

          await base44.asServiceRole.entities.User.update(user.id, updates);
          migrationResults.migrated++;
          migrationResults.changes.push(changes);
          
          console.log(`✅ Migrated user ${user.email}: ${changes.from} → ${changes.to}`);
        } else {
          migrationResults.skipped++;
          migrationResults.changes.push(changes);
        }

      } catch (error) {
        migrationResults.errors.push({
          userId: user.id,
          email: user.email,
          error: error.message
        });
        console.error(`❌ Failed to migrate user ${user.email}:`, error.message);
      }
    }

    return Response.json({
      success: true,
      message: 'Migration completed',
      results: migrationResults
    });

  } catch (error) {
    console.error('Migration failed:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

----------------------------

export default migrateToNewPermissions;
