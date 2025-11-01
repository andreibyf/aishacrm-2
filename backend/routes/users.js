/**
 * User Routes
 * User authentication and management with full CRUD
 */

import express from "express";
import jwt from "jsonwebtoken";
import {
  confirmUserEmail,
  createAuthUser,
  deleteAuthUser,
  getAuthUserByEmail,
  inviteUserByEmail,
  sendPasswordResetEmail,
  updateAuthUserMetadata,
  updateAuthUserPassword,
} from "../lib/supabaseAuth.js";

export default function createUserRoutes(pgPool, _supabaseAuth) {
  const router = express.Router();

  // Helper function to expand metadata fields to top-level properties
  const expandUserMetadata = (user) => {
    if (!user) return user;
    const { metadata = {}, ...rest } = user;

    // Keep tenant_id as-is (null means "No Client"); don't coerce to string
    return {
      ...rest,
      ...metadata, // Spread ALL metadata fields to top level
      metadata, // Keep original metadata for backwards compatibility
    };
  };

  // GET /api/users - List users (combines global users + tenant employees)
  // Supports lookup by email without tenant filter
  router.get("/", async (req, res) => {
    try {
      const { tenant_id, email, limit = 50, offset = 0 } = req.query;

      let allUsers = [];

      // Fast path: lookup by email across users and employees
      if (email) {
        const usersByEmail = await pgPool.query(
          `SELECT id, NULL as tenant_id, email, first_name, last_name, role, 'active' as status, metadata, created_at, updated_at, 'global' as user_type
           FROM users WHERE LOWER(email) = LOWER($1)`,
          [email],
        );

        const employeesByEmail = await pgPool.query(
          `SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at, 'employee' as user_type
           FROM employees WHERE LOWER(email) = LOWER($1)`,
          [email],
        );

        allUsers = [...usersByEmail.rows, ...employeesByEmail.rows].map(
          expandUserMetadata,
        );

        // Sort newest first
        allUsers.sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        );

        return res.json({
          status: "success",
          data: {
            users: allUsers,
            total: allUsers.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      }

      if (tenant_id) {
        // Filter by specific tenant - only return employees for that tenant
        const employeeQuery =
          "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at, 'employee' as user_type FROM employees WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
        const employeeResult = await pgPool.query(employeeQuery, [
          tenant_id,
          parseInt(limit),
          parseInt(offset),
        ]);

        const countQuery =
          "SELECT COUNT(*) FROM employees WHERE tenant_id = $1";
        const countResult = await pgPool.query(countQuery, [tenant_id]);

        // Expand metadata fields for each user
        allUsers = employeeResult.rows.map(expandUserMetadata);

        res.json({
          status: "success",
          data: {
            users: allUsers,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      } else {
        // No tenant filter - return global users (superadmins/admins) + all employees
        // Get global users from users table (superadmins, admins with no tenant assignment)
        const globalUsersQuery =
          "SELECT id, NULL as tenant_id, email, first_name, last_name, role, 'active' as status, metadata, created_at, updated_at, 'global' as user_type FROM users WHERE role IN ('superadmin', 'admin') ORDER BY created_at DESC";
        const globalUsersResult = await pgPool.query(globalUsersQuery);

        // Get all employees FROM employees table
        const employeesQuery =
          "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at, 'employee' as user_type FROM employees ORDER BY created_at DESC LIMIT $1 OFFSET $2";
        const employeesResult = await pgPool.query(employeesQuery, [
          parseInt(limit),
          parseInt(offset),
        ]);

        // Combine both - global users first, then employees, and expand metadata
        allUsers = [...globalUsersResult.rows, ...employeesResult.rows].map(
          expandUserMetadata,
        );

        // Sort by created_at desc
        allUsers.sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        );

        res.json({
          status: "success",
          data: {
            users: allUsers,
            total: globalUsersResult.rows.length + employeesResult.rows.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      }
    } catch (error) {
      console.error("Error listing users:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users/sync-from-auth - Ensure CRM user exists based on Supabase Auth
  // Body: { email?: string } or Query: ?email=
  router.post("/sync-from-auth", async (req, res) => {
    try {
      const email = (req.body?.email || req.query?.email || "").trim();
      if (!email) {
        return res.status(400).json({
          status: "error",
          message: "email is required",
        });
      }

      // Check if already exists in either table
      const existingUser = await pgPool.query(
        "SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)",
        [email],
      );
      const existingEmployee = await pgPool.query(
        "SELECT id, email, tenant_id FROM employees WHERE LOWER(email) = LOWER($1)",
        [email],
      );

      if (existingUser.rows.length > 0 || existingEmployee.rows.length > 0) {
        return res.json({
          status: "success",
          message: "User already exists in CRM",
          data: {
            users: existingUser.rows,
            employees: existingEmployee.rows,
          },
        });
      }

      // Fetch from Supabase Auth
      const { user: authUser, error: authErr } = await getAuthUserByEmail(
        email,
      );
      if (authErr) {
        return res.status(500).json({
          status: "error",
          message: `Auth lookup failed: ${authErr.message}`,
        });
      }
      if (!authUser) {
        return res.status(404).json({
          status: "error",
          message: "Auth user not found",
        });
      }

      const meta = authUser.user_metadata || {};
      const role = (meta.role || "employee").toLowerCase();
      // Normalize tenant_id coming from metadata
      const rawTenant = meta.tenant_id;
      const normalizedTenantId =
        (rawTenant === "" || rawTenant === "no-client" ||
            rawTenant === "none" || rawTenant === "null" ||
            rawTenant === undefined)
          ? null
          : rawTenant;

      const first_name = meta.first_name || authUser.email?.split("@")[0] || "";
      const last_name = meta.last_name || "";
      const display_name = meta.display_name ||
        `${first_name} ${last_name}`.trim();

      // Decide target table
      let createdRow = null;
      if (role === "superadmin" && !normalizedTenantId) {
        // Global superadmin/admin without tenant
        const insert = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, metadata, created_at, updated_at`,
          [email, first_name, last_name, "superadmin", {
            display_name,
            ...meta,
          }],
        );
        createdRow = { table: "users", record: insert.rows[0] };
      } else if (role === "admin" && normalizedTenantId) {
        const insert = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at`,
          [email, first_name, last_name, "admin", normalizedTenantId, {
            display_name,
            ...meta,
          }],
        );
        createdRow = { table: "users", record: insert.rows[0] };
      } else {
        // Default to employee in a tenant
        if (!normalizedTenantId) {
          return res.status(400).json({
            status: "error",
            message: "tenant_id metadata is required for non-admin users",
          });
        }
        const insert = await pgPool.query(
          `INSERT INTO employees (tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at`,
          [normalizedTenantId, email, first_name, last_name, role, "active", {
            display_name,
            ...meta,
          }],
        );
        createdRow = { table: "employees", record: insert.rows[0] };
      }

      return res.json({
        status: "success",
        message: "CRM user record created from auth metadata",
        data: createdRow,
      });
    } catch (error) {
      console.error("Error syncing from auth:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/users/:id - Get single user (actually queries employees table)
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      // tenant_id is optional - allow querying users without tenant (tenant_id='none' or NULL)
      let query, params;
      if (tenant_id !== undefined && tenant_id !== "null") {
        query =
          "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM employees WHERE id = $1 AND tenant_id = $2";
        params = [id, tenant_id];
      } else {
        query =
          "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM employees WHERE id = $1";
        params = [id];
      }

      const result = await pgPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      // Expand metadata to top-level properties
      const user = expandUserMetadata(result.rows[0]);

      res.json({
        status: "success",
        data: { user },
      });
    } catch (error) {
      console.error("Error getting user:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users/login - User login (basic implementation)
  router.post("/login", async (req, res) => {
    try {
      const { email, password: _password } = req.body;

      if (!email) {
        return res.status(400).json({
          status: "error",
          message: "email is required",
        });
      }

      // Check users table first (superadmins/admins)
      let tableName = "users";
      let result = await pgPool.query(
        "SELECT id, NULL as tenant_id, email, first_name, last_name, role, 'active' as status, metadata FROM users WHERE LOWER(email) = LOWER($1)",
        [email],
      );

      // If not found in users table, check employees table
      if (result.rows.length === 0) {
        tableName = "employees";
        result = await pgPool.query(
          "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata FROM employees WHERE LOWER(email) = LOWER($1)",
          [email],
        );
      }

      if (result.rows.length === 0) {
        return res.status(401).json({
          status: "error",
          message: "Invalid credentials",
        });
      }

      const found = result.rows[0];

      // Enforce disabled accounts: block login if marked inactive
      try {
        const meta = found.metadata || {};
        const flatIsActive = typeof meta.is_active === 'boolean' ? meta.is_active : undefined;
        const accountStatus = (meta.account_status || '').toLowerCase();
        const rowStatus = (found.status || '').toLowerCase();

        const isDisabled = accountStatus === 'inactive'
          || flatIsActive === false
          || rowStatus === 'inactive';

        if (isDisabled) {
          return res.status(403).json({
            status: "error",
            message: "Account is disabled. Contact an administrator.",
            code: "ACCOUNT_DISABLED",
          });
        }
      } catch (e) {
        console.warn("[Login] Failed to evaluate disabled state:", e.message);
      }

      // On successful lookup, mark account active + online and record last_login
      try {
        // Build a timestamp string in UTC ISO-like format for JSON metadata
        const updateSql = tableName === "users"
          ? `UPDATE users
               SET metadata = COALESCE(metadata, '{}'::jsonb)
                               || jsonb_build_object(
                                    'is_active', true,
                                    'account_status', 'active',
                                    'live_status', 'online',
                                    'last_login', to_char((NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                  ),
                   updated_at = NOW()
             WHERE id = $1`
          : `UPDATE employees
               SET status = 'active',
                   metadata = COALESCE(metadata, '{}'::jsonb)
                               || jsonb_build_object(
                                    'is_active', true,
                                    'account_status', 'active',
                                    'live_status', 'online',
                                    'last_login', to_char((NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                  ),
                   updated_at = NOW()
             WHERE id = $1`;
        await pgPool.query(updateSql, [found.id]);
      } catch (e) {
        console.warn("[Login] Failed to update live/account status:", e.message);
        // Continue login even if status update fails
      }

      // Re-fetch the user to include updated metadata
      const refreshed = await pgPool.query(
        tableName === "users"
          ? "SELECT id, NULL as tenant_id, email, first_name, last_name, role, 'active' as status, metadata FROM users WHERE id = $1"
          : "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata FROM employees WHERE id = $1",
        [found.id],
      );
      const user = expandUserMetadata(refreshed.rows[0] || found);

      // Generate JWT token
      const JWT_SECRET = process.env.JWT_SECRET ||
        "your-secret-key-change-in-production";
      const token = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        JWT_SECRET,
        { expiresIn: "7d" }, // Token expires in 7 days
      );

      res.json({
        status: "success",
        message: "Login successful",
        data: {
          user,
          token,
        },
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users/heartbeat - Update last_seen and live_status
  router.post("/heartbeat", async (req, res) => {
    try {
      const authHeader = req.headers?.authorization || "";
      const bearer = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

      let userId = null;
      let email = (req.body?.email || req.query?.email || "").trim();

      // Prefer JWT if provided
      if (bearer) {
        try {
          const decoded = jwt.verify(
            bearer,
            process.env.JWT_SECRET || "your-secret-key-change-in-production",
          );
          userId = decoded?.user_id || null;
        } catch {
          // Ignore token errors; fall back to email
        }
      }

      if (!userId && !email) {
        return res.status(400).json({
          status: "error",
          message: "Provide Authorization bearer token or email",
        });
      }

      // Resolve target user
      let target = null;
      if (userId) {
        const u = await pgPool.query(
          "SELECT id FROM users WHERE id = $1",
          [userId],
        );
        if (u.rows.length > 0) {
          target = { table: "users", id: userId };
        } else {
          const e = await pgPool.query(
            "SELECT id FROM employees WHERE id = $1",
            [userId],
          );
          if (e.rows.length > 0) target = { table: "employees", id: userId };
        }
      }

      if (!target && email) {
        const u = await pgPool.query(
          "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
          [email],
        );
        if (u.rows.length > 0) {
          target = { table: "users", id: u.rows[0].id };
        } else {
          const e = await pgPool.query(
            "SELECT id FROM employees WHERE LOWER(email) = LOWER($1)",
            [email],
          );
          if (e.rows.length > 0) target = { table: "employees", id: e.rows[0].id };
        }
      }

      if (!target) {
        // Attempt to sync from Supabase Auth as a fallback (if email provided)
        if (email) {
          try {
            const { user: authUser } = await getAuthUserByEmail(email);
            if (authUser) {
              const meta = authUser.user_metadata || {};
              const role = (meta.role || "employee").toLowerCase();
              const rawTenant = meta.tenant_id;
              const normalizedTenantId = (rawTenant === "" || rawTenant === "no-client" || rawTenant === "none" || rawTenant === "null" || rawTenant === undefined) ? null : rawTenant;
              const first_name = meta.first_name || authUser.email?.split("@")[0] || "";
              const last_name = meta.last_name || "";
              const display_name = meta.display_name || `${first_name} ${last_name}`.trim();

              if (role === "superadmin" && !normalizedTenantId) {
                const insert = await pgPool.query(
                  `INSERT INTO users (email, first_name, last_name, role, metadata, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                   RETURNING id`,
                  [email, first_name, last_name, "superadmin", { display_name, ...meta }],
                );
                target = { table: "users", id: insert.rows[0].id };
              } else if (role === "admin" && normalizedTenantId) {
                const insert = await pgPool.query(
                  `INSERT INTO users (email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                   RETURNING id`,
                  [email, first_name, last_name, "admin", normalizedTenantId, { display_name, ...meta }],
                );
                target = { table: "users", id: insert.rows[0].id };
              } else if (normalizedTenantId) {
                const insert = await pgPool.query(
                  `INSERT INTO employees (tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                   RETURNING id`,
                  [normalizedTenantId, email, first_name, last_name, role, "active", { display_name, ...meta }],
                );
                target = { table: "employees", id: insert.rows[0].id };
              }
            }
          } catch {
            // ignore sync errors
          }
        }

        if (!target) {
          return res.status(404).json({ status: "error", message: "User not found" });
        }
      }

      const updateSql = target.table === "users"
        ? `UPDATE users
             SET metadata = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                  'live_status', 'online',
                                  'last_seen', to_char((NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                ),
                 updated_at = NOW()
           WHERE id = $1`
        : `UPDATE employees
             SET metadata = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                  'live_status', 'online',
                                  'last_seen', to_char((NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                ),
                 updated_at = NOW()
           WHERE id = $1`;

      await pgPool.query(updateSql, [target.id]);

      return res.json({
        status: "success",
        data: {
          id: target.id,
          table: target.table,
          last_seen: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error in heartbeat:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users - Create new user (global admin or tenant employee)
  router.post("/", async (req, res) => {
    try {
      const {
        email,
        password,
        first_name,
        last_name,
        role,
        tenant_id,
        status,
        metadata,
        ...otherFields
      } = req.body;

      console.log("[POST /api/users] Creating user:", {
        email,
        first_name,
        last_name,
        role,
        tenant_id,
      });

      if (!email || !first_name) {
        return res.status(400).json({
          status: "error",
          message: "email and first_name are required",
        });
      }

      // ⚠️ CRITICAL: Admin role MUST be assigned to a tenant (not global)
      if (role === "admin" && !tenant_id) {
        return res.status(400).json({
          status: "error",
          message:
            "Admin users must be assigned to a tenant. Only superadmins can be global users.",
        });
      }

      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields,
      };

      // Normalize tenant_id: convert empty string, 'no-client', or undefined to null
      const normalizedTenantId =
        (tenant_id === "" || tenant_id === "no-client" ||
            tenant_id === undefined)
          ? null
          : tenant_id;

      // Only superadmin can be global (no tenant_id)
      const isGlobalUser = role === "superadmin" && !normalizedTenantId;
      let authUserId = null;

      if (isGlobalUser) {
        // Create global superadmin in users table (no tenant_id)
        // Check if user already exists
        const existingUser = await pgPool.query(
          "SELECT id FROM users WHERE email = $1",
          [email],
        );

        if (existingUser.rows.length > 0) {
          return res.status(409).json({
            status: "error",
            message: "User already exists",
          });
        }

        // Create Supabase Auth user with immediate activation
        const authMetadata = {
          first_name,
          last_name,
          role,
          display_name: `${first_name} ${last_name || ""}`.trim(),
          email_confirm: true,
        };

        // Use provided password or generate a strong temporary one
        const userPassword = password || `TempPass${Date.now()}!Secure#`;

        const { user: authUser, error: authError } = await createAuthUser(
          email,
          userPassword,
          authMetadata,
        );

        if (authError) {
          console.error("[User Creation] Supabase Auth error:", authError);
          return res.status(500).json({
            status: "error",
            message: `Failed to create user: ${authError.message}`,
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, metadata, created_at, updated_at`,
          [email, first_name, last_name, role, combinedMetadata],
        );

        const user = expandUserMetadata(result.rows[0]);

        res.json({
          status: "success",
          message: "Global superadmin created and ready to login.",
          data: {
            user,
            auth: {
              created: !!authUserId,
              email_confirmed: true,
              email_address: email,
              note: password
                ? "User can login immediately with provided password"
                : "User can login with temporary password (change on first login)",
            },
          },
        });
      } else if (role === "admin" && normalizedTenantId) {
        // Create tenant-scoped admin in users table WITH tenant_id
        // Check if user already exists
        const existingUser = await pgPool.query(
          "SELECT id FROM users WHERE email = $1",
          [email],
        );

        if (existingUser.rows.length > 0) {
          return res.status(409).json({
            status: "error",
            message: "User already exists",
          });
        }

        // Create Supabase Auth user - send invitation email
        const authMetadata = {
          first_name,
          last_name,
          role: "admin",
          tenant_id: normalizedTenantId,
          display_name: `${first_name} ${last_name || ""}`.trim(),
        };

        const { user: authUser, error: authError } = await inviteUserByEmail(
          email,
          authMetadata,
        );

        if (authError) {
          console.error("[User Creation] Supabase Auth error:", authError);
          return res.status(500).json({
            status: "error",
            message: `Failed to invite user: ${authError.message}`,
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at`,
          [
            email,
            first_name,
            last_name,
            "admin",
            normalizedTenantId,
            combinedMetadata,
          ],
        );

        const user = expandUserMetadata(result.rows[0]);

        res.json({
          status: "success",
          message: "Tenant admin created. Invitation email queued.",
          data: {
            user,
            auth: {
              created: !!authUserId,
              invitation_queued: true,
              email_address: email,
              note:
                "Check Supabase Dashboard → Auth → Logs to verify email delivery",
            },
          },
        });
      } else {
        // Create manager/employee in employees table (tenant-assigned user)
        if (!normalizedTenantId) {
          return res.status(400).json({
            status: "error",
            message: "tenant_id is required for non-admin users",
          });
        }

        // Check if employees already exists for this tenant
        const existingEmployee = await pgPool.query(
          "SELECT id FROM employees WHERE email = $1 AND tenant_id = $2",
          [email, normalizedTenantId],
        );

        if (existingEmployee.rows.length > 0) {
          return res.status(409).json({
            status: "error",
            message: "Employee already exists for this tenant",
          });
        }

        // Create Supabase Auth user - send invitation email
        const authMetadata = {
          first_name,
          last_name,
          role: role || "employee",
          tenant_id: normalizedTenantId,
          display_name: `${first_name} ${last_name || ""}`.trim(),
        };

        const { user: authUser, error: authError } = await inviteUserByEmail(
          email,
          authMetadata,
        );

        if (authError) {
          console.error("[User Creation] Supabase Auth error:", authError);
          return res.status(500).json({
            status: "error",
            message: `Failed to invite user: ${authError.message}`,
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO employees (tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at`,
          [
            normalizedTenantId,
            email,
            first_name,
            last_name,
            role || "employee",
            status || "active",
            combinedMetadata,
          ],
        );

        const user = expandUserMetadata(result.rows[0]);

        res.json({
          status: "success",
          message: "Employee created. Invitation email queued.",
          data: {
            user,
            auth: {
              created: !!authUserId,
              invitation_queued: true,
              email_address: email,
              note:
                "Check Supabase Dashboard → Auth → Logs to verify email delivery",
            },
          },
        });
      }
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users/register - User registration (legacy endpoint)
  router.post("/register", async (req, res) => {
    try {
      const {
        tenant_id,
        email,
        password: _password,
        first_name,
        last_name,
        role = "user",
      } = req.body;

      if (!tenant_id || !email) {
        return res.status(400).json({
          status: "error",
          message: "tenant_id and email are required",
        });
      }

      // Check if user already exists
      const existingUser = await pgPool.query(
        "SELECT id FROM users WHERE email = $1",
        [email],
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          status: "error",
          message: "User already exists",
        });
      }

      // Note: In production, hash password with bcrypt before storing
      const result = await pgPool.query(
        `INSERT INTO users (tenant_id, email, first_name, last_name, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
         RETURNING id, tenant_id, email, first_name, last_name, role, status`,
        [tenant_id, email, first_name, last_name, role],
      );

      res.json({
        status: "success",
        message: "Registration successful",
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/users/profile - Get user profile (requires auth in production)
  router.get("/profile", async (req, res) => {
    try {
      const { email, tenant_id } = req.query;

      if (!email || !tenant_id) {
        return res.status(400).json({
          status: "error",
          message: "email and tenant_id are required",
        });
      }

      const result = await pgPool.query(
        "SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at FROM users WHERE email = $1 AND tenant_id = $2",
        [email, tenant_id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      res.json({
        status: "success",
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error("Error getting profile:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // PUT /api/users/:id - Update user (supports users and employees tables)
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const {
        tenant_id,
        first_name,
        last_name,
        role,
        status,
        metadata,
        display_name,
        is_active,
        tags,
        employee_role,
        permissions,
        navigation_permissions,
        new_password, // Password reset field
        ...otherFields // Capture any unknown fields
      } = req.body;

      // First, try to find user in users table (superadmin/admin), then employees table
      let currentUser = await pgPool.query(
        "SELECT metadata, tenant_id, email, 'users' as table_name FROM users WHERE id = $1",
        [id],
      );

      if (currentUser.rows.length === 0) {
        // Try employees table
        currentUser = await pgPool.query(
          "SELECT metadata, tenant_id, email, 'employees' as table_name FROM employees WHERE id = $1",
          [id],
        );
      }

      if (currentUser.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      const tableName = currentUser.rows[0].table_name;

      // Handle password update if provided
      if (new_password && new_password.trim() !== "") {
        const userEmail = currentUser.rows[0].email;

        // Get auth user by email
        const { user: authUser } = await getAuthUserByEmail(userEmail);

        if (authUser) {
          // Update password in Supabase Auth
          const { error: passwordError } = await updateAuthUserPassword(
            authUser.id,
            new_password,
          );

          if (passwordError) {
            console.error(
              "[User Update] Password update error:",
              passwordError,
            );
            return res.status(500).json({
              status: "error",
              message: `Failed to update password: ${passwordError.message}`,
            });
          }

          // Confirm email after password change
          const { error: confirmError } = await confirmUserEmail(authUser.id);
          if (confirmError) {
            console.warn(
              "[User Update] Could not confirm email:",
              confirmError,
            );
          }

          console.log(`✓ Password updated for user: ${userEmail}`);
        }
      }

      // Merge metadata - preserve existing metadata and add/update new fields
      const currentMetadata = currentUser.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...(display_name !== undefined && { display_name }),
        ...(is_active !== undefined && { is_active }),
        ...(tags !== undefined && { tags }),
        ...(employee_role !== undefined && { employee_role }),
        ...(permissions !== undefined && { permissions }),
        ...(navigation_permissions !== undefined && { navigation_permissions }),
        ...otherFields, // Include any unknown fields in metadata
      };

      // SECURITY: Remove password from metadata if it exists (should never be stored)
      delete updatedMetadata.password;
      if (new_password && new_password.trim() !== "") {
        // Password was just changed - clear any legacy password storage
        delete updatedMetadata.password;
      }

      // Normalize tenant_id inputs (treat various sentinels as null)
      const normalizeTenant = (val) => {
        if (
          val === "" || val === "no-client" || val === "none" ||
          val === "null" || val === undefined
        ) return null;
        return val;
      };
      const finalTenantId = tenant_id !== undefined
        ? normalizeTenant(tenant_id)
        : currentUser.rows[0].tenant_id;

      // Update the correct table based on where the user was found
      const updateQuery = tableName === "users"
        ? `UPDATE users 
           SET first_name = COALESCE($1, first_name),
               last_name = COALESCE($2, last_name),
               role = COALESCE($3, role),
               tenant_id = $4,
               metadata = $5,
               updated_at = NOW()
           WHERE id = $6
           RETURNING id, tenant_id, email, first_name, last_name, role, metadata, updated_at`
        : `UPDATE employees 
           SET first_name = COALESCE($1, first_name),
               last_name = COALESCE($2, last_name),
               role = COALESCE($3, role),
               status = COALESCE($4, status),
               tenant_id = $5,
               metadata = $6,
               updated_at = NOW()
           WHERE id = $7
           RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, updated_at`;

      const updateParams = tableName === "users"
        ? [first_name, last_name, role, finalTenantId, updatedMetadata, id]
        : [
          first_name,
          last_name,
          role,
          status,
          finalTenantId,
          updatedMetadata,
          id,
        ];

      const result = await pgPool.query(updateQuery, updateParams);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      // Expand metadata to top-level properties
      const updatedUser = expandUserMetadata(result.rows[0]);

      res.json({
        status: "success",
        message: "User updated",
        data: { user: updatedUser },
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // DELETE /api/users/:id - Delete user (checks both users and employees tables)
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      // Try to find user in users table first (for SuperAdmins/Admins)
      let userResult = await pgPool.query(
        "SELECT id, email, role FROM users WHERE id = $1",
        [id],
      );
      let tableName = "users";

      // If not found in users table, check employees table
      if (userResult.rows.length === 0) {
        if (tenant_id !== undefined && tenant_id !== "null") {
          userResult = await pgPool.query(
            "SELECT id, email FROM employees WHERE id = $1 AND tenant_id = $2",
            [id, tenant_id],
          );
        } else {
          userResult = await pgPool.query(
            "SELECT id, email FROM employees WHERE id = $1",
            [id],
          );
        }
        tableName = "employees";
      }

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found in users or employees table",
        });
      }

      // Stopper: prevent deleting the last remaining superadmin
      if (tableName === "users" && (userResult.rows[0].role || "").toLowerCase() === "superadmin") {
        const countRes = await pgPool.query(
          "SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'superadmin' AND id <> $1",
          [id],
        );
        const remaining = countRes.rows[0].cnt;
        if (remaining <= 0) {
          return res.status(403).json({
            status: "error",
            code: "LAST_SUPERADMIN",
            message: "Cannot delete the last remaining superadmin.",
          });
        }
      }

      const userEmail = userResult.rows[0].email;

      // Delete from Supabase Auth
      try {
        const { user: authUser } = await getAuthUserByEmail(userEmail);
        if (authUser?.id) {
          await deleteAuthUser(authUser.id);
          console.log(`✓ Deleted auth user: ${userEmail}`);
        }
      } catch (authError) {
        console.warn(
          `⚠ Could not delete auth user ${userEmail}:`,
          authError.message,
        );
        // Continue with database deletion even if auth deletion fails
      }

      // Delete from the correct table
      let query, params;

      if (tableName === "users") {
        query = "DELETE FROM users WHERE id = $1 RETURNING id, email";
        params = [id];
      } else {
        if (tenant_id !== undefined && tenant_id !== "null") {
          query =
            "DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING id, email";
          params = [id, tenant_id];
        } else {
          query = "DELETE FROM employees WHERE id = $1 RETURNING id, email";
          params = [id];
        }
      }

      const result = await pgPool.query(query, params);

      console.log(`✓ Deleted user from ${tableName} table: ${userEmail}`);

      res.json({
        status: "success",
        message: "User deleted",
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users/reset-password - Send password reset email
  router.post("/reset-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          status: "error",
          message: "email is required",
        });
      }

      const { data, error } = await sendPasswordResetEmail(email);

      if (error) {
        console.error("[Password Reset] Error:", error);
        return res.status(500).json({
          status: "error",
          message: `Failed to send reset email: ${error.message}`,
        });
      }

      res.json({
        status: "success",
        message: "Password reset email sent",
        data,
      });
    } catch (error) {
      console.error("Error sending password reset:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/users/admin-password-reset - Direct password reset (for dev/admin use)
  router.post("/admin-password-reset", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          status: "error",
          message: "email and password are required",
        });
      }

      // Get auth user by email
      const { user: authUser, error: getUserError } = await getAuthUserByEmail(
        email,
      );

      if (getUserError || !authUser) {
        return res.status(404).json({
          status: "error",
          message: `User not found: ${
            getUserError?.message || "No auth user with this email"
          }`,
        });
      }

      // Update password AND confirm email
      const { error: updateError } = await updateAuthUserPassword(
        authUser.id,
        password,
      );

      if (updateError) {
        console.error("[Admin Password Reset] Error:", updateError);
        return res.status(500).json({
          status: "error",
          message: `Failed to update password: ${updateError.message}`,
        });
      }

      // Confirm email (bypass verification)
      const { error: confirmError } = await confirmUserEmail(authUser.id);

      if (confirmError) {
        console.warn(
          "[Admin Password Reset] Could not confirm email:",
          confirmError,
        );
        // Don't fail - password was updated successfully
      }

      // Clear password expiration metadata
      const currentMetadata = authUser.user_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        password_change_required: false,
        password_expires_at: null,
      };

      const { error: metadataError } = await updateAuthUserMetadata(
        authUser.id,
        updatedMetadata,
      );

      if (metadataError) {
        console.warn(
          "[Admin Password Reset] Could not clear expiration metadata:",
          metadataError,
        );
        // Don't fail the request - password was updated successfully
      }

      console.log(
        `✓ Password reset for: ${email} (email confirmed, expiration cleared)`,
      );

      res.json({
        status: "success",
        message: "Password updated, email confirmed, and expiration cleared",
        data: { email, userId: authUser.id },
      });
    } catch (error) {
      console.error("Error in admin password reset:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  return router;
}
