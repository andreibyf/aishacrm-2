/**
 * User Routes
 * User authentication and management with full CRUD
 */

import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes } from "crypto";
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

  // Lightweight, per-route in-memory rate limiter (dependency-free)
  // Use stricter limits for sensitive auth endpoints to satisfy CodeQL
  const routeBuckets = new Map(); // key: routeId|ip -> { count, ts }
  const DEFAULT_WINDOW_MS = parseInt(process.env.ROUTE_RATE_WINDOW_MS || '60000', 10);
  function createRouteLimiter({ windowMs = DEFAULT_WINDOW_MS, max = 10, id = "default" } = {}) {
    return function routeLimiter(req, res, next) {
      try {
        // Allow OPTIONS preflight freely
        if (req.method === 'OPTIONS') return next();
        const now = Date.now();
        const key = `${id}|${req.ip}`;
        const entry = routeBuckets.get(key);
        if (!entry || now - entry.ts >= windowMs) {
          routeBuckets.set(key, { count: 1, ts: now });
          return next();
        }
        if (entry.count < max) {
          entry.count++;
          return next();
        }
        res.setHeader('Retry-After', Math.ceil((entry.ts + windowMs - now) / 1000));
        return res.status(429).json({
          status: 'error',
          message: 'Too Many Requests',
          code: 'RATE_LIMITED',
        });
      } catch {
        // Fail open on limiter errors
        return next();
      }
    };
  }

  // Tuned limiters for specific endpoints
  const authLimiter = createRouteLimiter({ id: 'auth', windowMs: DEFAULT_WINDOW_MS, max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10) });
  const passwordLimiter = createRouteLimiter({ id: 'password', windowMs: DEFAULT_WINDOW_MS, max: parseInt(process.env.PASSWORD_RATE_LIMIT_MAX || '5', 10) });
  const mutateLimiter = createRouteLimiter({ id: 'user-mutate', windowMs: DEFAULT_WINDOW_MS, max: parseInt(process.env.USER_MUTATE_RATE_LIMIT_MAX || '30', 10) });

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
      // Normalize email param case-insensitively and support alternate casing
      const rawEmailKey = Object.keys(req.query).find(k => k.toLowerCase() === 'email');
      const email = rawEmailKey ? (req.query[rawEmailKey] || '').trim() : '';
      const { tenant_id, limit = 50, offset = 0, strict_email, debug } = req.query;

      let allUsers = [];

      // Fast path: lookup by email across users and employees (exact match only)
      if (email) {
        const t0 = Date.now();
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

        // Combine + expand metadata
        allUsers = [...usersByEmail.rows, ...employeesByEmail.rows].map(expandUserMetadata);

        // Post-filter safeguard: ensure only exact matches remain (defensive)
        const beforeFilterCount = allUsers.length;
        allUsers = allUsers.filter(u => (u.email || '').toLowerCase() === email.toLowerCase());
        const afterFilterCount = allUsers.length;

        // HARD suppression of test-pattern emails when not in E2E mode and strict_email requested
        const testEmailPatterns = [
          /audit\.test\./i,
          /e2e\.temp\./i,
          /@playwright\.test$/i,
          /@example\.com$/i,
        ];
  const suppressedTestUsers = [];
  // Server-side E2E detection via header or env only (no window/localStorage on server)
  const isE2EMode = (req.headers['x-e2e-test-mode'] === 'true') || (process.env.E2E_TEST_MODE === 'true');
        if (!isE2EMode) {
          allUsers = allUsers.filter(u => {
            const isTest = testEmailPatterns.some(re => re.test(u.email || ''));
            if (isTest) suppressedTestUsers.push(u);
            return !isTest;
          });
        }

        if (strict_email && parseInt(strict_email) === 1) {
          // If any pre-filter rows existed that didn't match, log warning; enforce strictness
          if (beforeFilterCount !== afterFilterCount) {
            console.warn('[Users.get] strict_email mismatch: non-matching rows suppressed', { email, beforeFilterCount, afterFilterCount });
          }
        }

        // Sort newest first (after suppression)
        allUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const durationMs = Date.now() - t0;
        if (debug === '1') {
          console.log('[Users.get] DEBUG email lookup', { email, durationMs, returned: allUsers.length, suppressedTestUsers: suppressedTestUsers.length });
        }

        return res.json({
          status: "success",
          data: {
            users: allUsers,
            total: allUsers.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            debug: debug === '1' ? {
              email,
              strict: !!strict_email,
              beforeFilterCount,
              afterFilterCount,
              suppressedTestUsersCount: suppressedTestUsers.length,
              suppressedTestUsers: debug === '1' ? suppressedTestUsers.map(u => ({ id: u.id, email: u.email })) : undefined,
              durationMs,
            } : undefined,
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
  router.post("/login", authLimiter, async (req, res) => {
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
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
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
        // Try users by id
        const userById = await supabase.from('users').select('id').eq('id', userId).single();
        if (userById.data?.id) {
          target = { table: 'users', id: userId };
        } else {
          const empById = await supabase.from('employees').select('id').eq('id', userId).single();
          if (empById.data?.id) target = { table: 'employees', id: userId };
        }
      }

      if (!target && email) {
        // Case-insensitive email lookup using ilike
        const userByEmail = await supabase.from('users').select('id').ilike('email', email).limit(1).maybeSingle();
        if (userByEmail.data?.id) {
          target = { table: 'users', id: userByEmail.data.id };
        } else {
          const empByEmail = await supabase.from('employees').select('id, tenant_id').ilike('email', email).limit(1).maybeSingle();
          if (empByEmail.data?.id) target = { table: 'employees', id: empByEmail.data.id };
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

              if (role === 'superadmin' && !normalizedTenantId) {
                const { data, error } = await supabase
                  .from('users')
                  .insert([{ email, first_name, last_name, role: 'superadmin', metadata: { display_name, ...meta }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
                  .select('id')
                  .single();
                if (!error && data?.id) target = { table: 'users', id: data.id };
              } else if (role === 'admin' && normalizedTenantId) {
                const { data, error } = await supabase
                  .from('users')
                  .insert([{ email, first_name, last_name, role: 'admin', tenant_id: normalizedTenantId, metadata: { display_name, ...meta }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
                  .select('id')
                  .single();
                if (!error && data?.id) target = { table: 'users', id: data.id };
              } else if (normalizedTenantId) {
                const { data, error } = await supabase
                  .from('employees')
                  .insert([{ tenant_id: normalizedTenantId, email, first_name, last_name, role, status: 'active', metadata: { display_name, ...meta }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
                  .select('id')
                  .single();
                if (!error && data?.id) target = { table: 'employees', id: data.id };
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

      // Merge and update metadata using Supabase API
      const { data: existing, error: fetchErr } = await supabase
        .from(target.table)
        .select('metadata')
        .eq('id', target.id)
        .single();

      if (fetchErr && fetchErr.code !== 'PGRST116') throw new Error(fetchErr.message);

      const nowIso = new Date().toISOString();
      const mergedMeta = {
        ...(existing?.metadata || {}),
        live_status: 'online',
        last_seen: nowIso,
      };

      const { error: updErr } = await supabase
        .from(target.table)
        .update({ metadata: mergedMeta, updated_at: nowIso })
        .eq('id', target.id);

      if (updErr) throw new Error(updErr.message);

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
  router.post("/", mutateLimiter, async (req, res) => {
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

      // 🔒 CRITICAL: Block E2E test user creation that pollutes production login
      // These test patterns MUST NOT be created in the production database
      const testEmailPatterns = [
        /^audit\.test\./i,
        /^e2e\.temp\./i,
        /@playwright\.test$/i,
        /@example\.com$/i, // Block all example.com emails (test domain)
      ];
      
      if (testEmailPatterns.some(pattern => pattern.test(email))) {
        console.warn(`[POST /api/users] BLOCKED test email pattern: ${email}`);
        return res.status(403).json({
          status: "error",
          message: "Test email patterns are not allowed in production database",
          code: "TEST_EMAIL_BLOCKED",
          hint: "E2E tests should use mock users exclusively without creating real database records"
        });
      }

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

      // 🔒 CRITICAL: Enforce global email uniqueness across users AND employees tables
      // Check both tables to prevent duplicate accounts with same email
      const existingInUsers = await pgPool.query(
        "SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)",
        [email]
      );
      const existingInEmployees = await pgPool.query(
        "SELECT id, email, tenant_id FROM employees WHERE LOWER(email) = LOWER($1)",
        [email]
      );

      if (existingInUsers.rows.length > 0 || existingInEmployees.rows.length > 0) {
        const existingRecord = existingInUsers.rows[0] || existingInEmployees.rows[0];
        console.warn(`[POST /api/users] Duplicate email rejected: ${email}`);
        return res.status(409).json({
          status: "error",
          message: "An account with this email already exists",
          code: "DUPLICATE_EMAIL",
          hint: "Email addresses must be unique across all users and employees",
          existing: {
            id: existingRecord.id,
            email: existingRecord.email,
            table: existingInUsers.rows.length > 0 ? "users" : "employees",
          },
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
        // NOTE: Global email uniqueness already checked above
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

        // Use provided password or generate a strong temporary one (secure randomness)
        const userPassword = password || (() => {
          try {
            // Prefer UUID for readability, with a random suffix
            const suffix = randomBytes(6).toString('base64url');
            return `Temp-${randomUUID()}-${suffix}`;
          } catch {
            // Fallback: crypto may be unavailable in rare environments
            return `Temp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
          }
        })();

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
        // NOTE: Global email uniqueness already checked above
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

        // NOTE: Global email uniqueness already checked above
        // Also check for same email in same tenant (defensive redundancy)
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
  router.post("/register", authLimiter, async (req, res) => {
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
  router.put("/:id", mutateLimiter, async (req, res) => {
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

      // 🔒 CRITICAL: Define immutable superadmin accounts that cannot be modified via API
      // These accounts can ONLY be changed directly in Supabase Auth dashboard
      const IMMUTABLE_SUPERADMINS = [
        'abyfield@4vdataconsulting.com', // Primary system owner
      ];

      // First, try to find user in users table (superadmin/admin), then employees table
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      let currentUser = await supabase
        .from('users')
        .select('metadata, tenant_id, email, role')
        .eq('id', id)
        .single();
      
      let tableName = 'users';
      
      if (currentUser.error) {
        // Try employees table
        currentUser = await supabase
          .from('employees')
          .select('metadata, tenant_id, email, role')
          .eq('id', id)
          .single();
        
        tableName = 'employees';
      }

      if (currentUser.error || !currentUser.data) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }
      
      const userData = currentUser.data;

      // 🔒 IMMUTABLE PROTECTION: Block ANY changes to protected superadmin accounts
      if (IMMUTABLE_SUPERADMINS.some(email => email.toLowerCase() === (userData.email || '').toLowerCase())) {
        console.warn(`[PUT /api/users/:id] BLOCKED attempt to modify immutable superadmin: ${userData.email}`);
        return res.status(403).json({
          status: "error",
          message: "This superadmin account is immutable and cannot be modified via API",
          code: "IMMUTABLE_ACCOUNT",
          hint: "Protected superadmin accounts can only be modified directly in Supabase Auth dashboard",
          protected_email: userData.email,
        });
      }

      // Handle password update if provided
      if (new_password && new_password.trim() !== "") {
        const userEmail = userData.email;

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
      const currentMetadata = userData.metadata || {};
      
      // AUTO-SYNC: Derive display_name from first/last name if not explicitly provided
      let derivedDisplayName = display_name;
      if (display_name === undefined && (first_name !== undefined || last_name !== undefined)) {
        // If first/last are being updated but display_name isn't, auto-compute it
        const newFirst = first_name !== undefined ? first_name : (currentMetadata.first_name || '');
        const newLast = last_name !== undefined ? last_name : (currentMetadata.last_name || '');
        derivedDisplayName = `${newFirst} ${newLast}`.trim() || undefined;
      }
      
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...(derivedDisplayName !== undefined && { display_name: derivedDisplayName }),
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
        : userData.tenant_id;

      // Use Supabase client directly to avoid SQL parser limitations
      const updateData = {
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(role !== undefined && { role }),
        ...(tableName === "employees" && status !== undefined && { status }),
        tenant_id: finalTenantId,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      };
      
      const { data, error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error(`[User Update] Supabase error:`, error);
        return res.status(500).json({
          status: "error",
          message: "Failed to update user",
          error: error.message,
        });
      }
      
      if (!data) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      // Expand metadata to top-level properties
      const updatedUser = expandUserMetadata(data);

      // Keep Supabase Auth metadata in sync for name fields to avoid UI mismatches
      try {
        const userEmail = userData?.email;
        if (userEmail && (first_name !== undefined || last_name !== undefined || display_name !== undefined)) {
          const { user: authUser } = await getAuthUserByEmail(userEmail);
          if (authUser?.id) {
            const currentAuthMeta = authUser.user_metadata || {};
            const nextFirst = (first_name !== undefined) ? first_name : (currentAuthMeta.first_name || undefined);
            const nextLast = (last_name !== undefined) ? last_name : (currentAuthMeta.last_name || undefined);
            const nextDisplay = (display_name !== undefined)
              ? display_name
              : (currentAuthMeta.display_name || (typeof nextFirst === 'string' || typeof nextLast === 'string' ? `${nextFirst || ''} ${nextLast || ''}`.trim() : undefined));

            const authUpdate = {
              ...currentAuthMeta,
              ...(nextFirst !== undefined && { first_name: nextFirst }),
              ...(nextLast !== undefined && { last_name: nextLast }),
              ...(nextDisplay !== undefined && { display_name: nextDisplay }),
              // Maintain full_name for legacy consumers
              ...(nextFirst !== undefined || nextLast !== undefined || nextDisplay !== undefined)
                ? { full_name: nextDisplay || `${nextFirst || ''} ${nextLast || ''}`.trim() }
                : {},
            };

            const { error: metaErr } = await updateAuthUserMetadata(authUser.id, authUpdate);
            if (metaErr) {
              console.warn("[User Update] Could not sync auth metadata:", metaErr);
            } else {
              if (process.env.NODE_ENV !== 'test') {
                console.log(`✓ Synced auth metadata for ${userEmail}`);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[User Update] Auth metadata sync skipped:", e?.message || e);
      }

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
  router.delete("/:id", mutateLimiter, async (req, res) => {
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

      const userEmail = userResult.rows[0].email;

      // 🔒 CRITICAL: Define immutable superadmin accounts that cannot be deleted via API
      const IMMUTABLE_SUPERADMINS = [
        'abyfield@4vdataconsulting.com', // Primary system owner
      ];

      // 🔒 IMMUTABLE PROTECTION: Block deletion of protected superadmin accounts
      if (IMMUTABLE_SUPERADMINS.some(email => email.toLowerCase() === (userEmail || '').toLowerCase())) {
        console.warn(`[DELETE /api/users/:id] BLOCKED attempt to delete immutable superadmin: ${userEmail}`);
        return res.status(403).json({
          status: "error",
          message: "This superadmin account is immutable and cannot be deleted",
          code: "IMMUTABLE_ACCOUNT",
          hint: "Protected superadmin accounts can only be removed directly in Supabase Auth dashboard",
          protected_email: userEmail,
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
  router.post("/reset-password", passwordLimiter, async (req, res) => {
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
  router.post("/admin-password-reset", passwordLimiter, async (req, res) => {
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
