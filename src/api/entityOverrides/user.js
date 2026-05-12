// User entity - Supabase authentication + backend API
// Extracted from src/api/entities.js
import { createEntity } from '../core/createEntity';
import { callBackendAPI, BACKEND_URL } from '../core/httpClient';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { logDev } from '../../utils/devLogger';

const baseUserEntity = createEntity('User');

export const User = {
  // Entity-style methods (needed by reports/ProductivityAnalytics)
  ...baseUserEntity,

  /**
   * Get current authenticated user
   * Uses Supabase Auth with local dev fallback
   */
  me: async () => {
    // TEMP: Disable cookie auth, use Supabase fallback
    const skipCookieAuth = true;

    // First, try cookie-based session via backend (disabled for now)
    try {
      let meResp = null;
      if (!skipCookieAuth) {
        meResp = await fetch(`${BACKEND_URL}/api/auth/me`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      } else {
        throw new Error('Cookie auth disabled');
      }
      if (meResp && meResp.ok) {
        const meJson = await meResp.json();
        const payload = meJson?.data?.user || {};
        const email = (payload.email || '').toLowerCase();
        const table = payload.table === 'employees' ? 'employees' : 'users';
        // /api/auth/me populates is_employee + employee_id from a live
        // employees lookup. Carry both through to the frontend user
        // object so normalizeUser can expose them on the context. See
        // docs/architecture/IDENTITY_MODEL.md rule #6 and 4VD-54.
        const isEmployeeFromMe = payload.is_employee === true;
        const employeeIdFromMe = payload.employee_id || null;

        // Fetch user/employee record from backend to enrich profile
        let userData = null;
        try {
          if (table === 'users') {
            const r = await fetch(`${BACKEND_URL}/api/users?email=${encodeURIComponent(email)}`);
            if (r.ok) {
              const j = await r.json();
              const raw = j.data?.users || j.data || j;
              const list = Array.isArray(raw)
                ? raw.filter((u) => (u.email || '').toLowerCase() === email)
                : [];
              if (list.length > 0) userData = list[0];
            }
          }
          if (!userData) {
            const r = await fetch(
              `${BACKEND_URL}/api/employees?email=${encodeURIComponent(email)}`,
            );
            if (r.ok) {
              const j = await r.json();
              const raw = j.data || j;
              const list = Array.isArray(raw)
                ? raw.filter((u) => (u.email || '').toLowerCase() === email)
                : [];
              if (list.length > 0) userData = list[0];
            }
          }
        } catch (e) {
          console.warn('[Cookie Auth] Backend user lookup failed:', e?.message || e);
        }

        if (!email) return null;

        // Map to normalized user object (prefer DB values)
        return {
          id: payload.sub,
          email,
          // No Supabase user_metadata in cookie mode; include minimal object
          user_metadata: {},
          created_at: undefined,
          updated_at: undefined,
          // Tenant: prefer DB value when present, else cookie payload
          tenant_id:
            userData?.tenant_id !== undefined && userData?.tenant_id !== null
              ? userData.tenant_id
              : (payload.tenant_id ?? null),
          // is_employee + employee_id from /api/auth/me are authoritative
          // (server-side employees lookup). userData (from /api/users or
          // /api/employees) supplies the rest of the profile.
          is_employee: isEmployeeFromMe,
          ...(userData && {
            employee_id: employeeIdFromMe || userData.employee_id || userData.id,
            employee_role: userData.employee_role,
            first_name: userData.first_name,
            last_name: userData.last_name,
            full_name:
              userData.full_name ||
              `${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
              undefined,
            display_name:
              userData.display_name ||
              userData.full_name ||
              `${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
              undefined,
            role: (userData.role || '').toLowerCase(),
            status: userData.status,
            permissions: userData.metadata?.permissions || [],
            access_level: userData.metadata?.access_level,
            is_superadmin: (userData.role || '').toLowerCase() === 'superadmin',
            can_manage_users: userData.metadata?.can_manage_users || false,
            can_manage_settings: userData.metadata?.can_manage_settings || false,
            crm_access: true,
            // nav_permissions is the actual DB column; navigation_permissions was the old metadata key
            navigation_permissions:
              userData.nav_permissions || userData.navigation_permissions || {},
          }),
        };
      }
    } catch (cookieErr) {
      // Fall through to Supabase path
      if (import.meta.env.DEV) {
        console.debug(
          '[User.me] Cookie auth probe failed, attempting Supabase path:',
          cookieErr?.message || cookieErr,
        );
      }
    }

    // Production: Use Supabase Auth as fallback
    if (isSupabaseConfigured()) {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.error('[Supabase Auth] Error getting user:', error);
          return null;
        }

        if (!user) {
          logDev('[Supabase Auth] No authenticated user');
          return null;
        }

        // Fetch user record from database to get permissions and tenant_id
        // Try users table first (for SuperAdmins/Admins), then employees table
        let userData = null;
        try {
          // First, try users table (for SuperAdmins and Admins)
          let response = await fetch(
            `${BACKEND_URL}/api/users?email=${encodeURIComponent(user.email)}`,
          );
          if (response.ok) {
            const result = await response.json();
            logDev('[User.me] RAW API response:', result); // DEBUG: See what backend actually returns
            const rawUsers = result.data?.users || result.data || result;
            const users = Array.isArray(rawUsers)
              ? rawUsers.filter((u) => (u.email || '').toLowerCase() === user.email.toLowerCase())
              : [];

            // Defensive: filter out test-pattern identities unless in E2E mode
            const isE2EMode =
              typeof window !== 'undefined' && localStorage.getItem('E2E_TEST_MODE') === 'true';
            const testEmailPatterns = [
              /audit\.test\./i,
              /e2e\.temp\./i,
              /@playwright\.test$/i,
              /@example\.com$/i,
            ];
            const safeUsers = isE2EMode
              ? users
              : users.filter((u) => !testEmailPatterns.some((re) => re.test(u.email || '')));

            if (safeUsers.length > 0) {
              // Prefer a global superadmin/admin record
              const preferred =
                safeUsers.find(
                  (u) =>
                    u.tenant_id === null &&
                    ['superadmin', 'admin'].includes((u.role || '').toLowerCase()),
                ) ||
                safeUsers.find((u) => u.tenant_id === null) ||
                safeUsers.find((u) =>
                  ['superadmin', 'admin'].includes((u.role || '').toLowerCase()),
                ) ||
                safeUsers[0];

              userData = preferred;
              logDev('[Supabase Auth] User record selected (exact match filtering):', {
                email: userData.email,
                role: userData.role,
                tenant_id: userData.tenant_id,
              });
            } else if (rawUsers && rawUsers.length > 0) {
              console.warn(
                '[Supabase Auth] Raw users returned but none passed filtering; possible test-pattern suppression or mismatch.',
                { requested: user.email, rawCount: rawUsers.length },
              );
            }
          }

          // If not found in users table, try employees table
          if (!userData) {
            response = await fetch(
              `${BACKEND_URL}/api/employees?email=${encodeURIComponent(user.email)}`,
            );
            if (response.ok) {
              const result = await response.json();
              const employees = result.data || result;
              if (employees && employees.length > 0) {
                userData = employees[0];
                logDev(
                  '[Supabase Auth] User data loaded from employees table:',
                  userData.role,
                  userData.metadata?.access_level,
                );
              } else {
                console.warn('[Supabase Auth] No user or employee record found for:', user.email);
              }
            } else {
              console.error(
                '[Supabase Auth] Failed to fetch user data:',
                response.status,
                response.statusText,
              );
            }
          }

          // If still not found, auto-create CRM record from auth metadata and re-fetch
          if (!userData) {
            logDev('[Supabase Auth] Ensuring CRM user record exists for:', user.email);
            try {
              const syncResp = await fetch(`${BACKEND_URL}/api/users/sync-from-auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email }),
              });
              if (syncResp.ok) {
                // Re-try lookup in users table first, then employees
                let retry = await fetch(
                  `${BACKEND_URL}/api/users?email=${encodeURIComponent(user.email)}`,
                );
                if (retry.ok) {
                  const r = await retry.json();
                  const listRaw = r.data?.users || r.data || r;
                  const list = Array.isArray(listRaw)
                    ? listRaw.filter(
                        (u) => (u.email || '').toLowerCase() === user.email.toLowerCase(),
                      )
                    : [];
                  const isE2EMode =
                    typeof window !== 'undefined' &&
                    localStorage.getItem('E2E_TEST_MODE') === 'true';
                  const testEmailPatterns = [
                    /audit\.test\./i,
                    /e2e\.temp\./i,
                    /@playwright\.test$/i,
                    /@example\.com$/i,
                  ];
                  const safe = isE2EMode
                    ? list
                    : list.filter((u) => !testEmailPatterns.some((re) => re.test(u.email || '')));
                  if (safe && safe.length > 0) {
                    userData = safe[0];
                  }
                }
                if (!userData) {
                  retry = await fetch(
                    `${BACKEND_URL}/api/employees?email=${encodeURIComponent(user.email)}`,
                  );
                  if (retry.ok) {
                    const r2 = await retry.json();
                    const list2Raw = r2.data || r2;
                    const list2 = Array.isArray(list2Raw)
                      ? list2Raw.filter(
                          (u) => (u.email || '').toLowerCase() === user.email.toLowerCase(),
                        )
                      : [];
                    const isE2EMode =
                      typeof window !== 'undefined' &&
                      localStorage.getItem('E2E_TEST_MODE') === 'true';
                    const testEmailPatterns = [
                      /audit\.test\./i,
                      /e2e\.temp\./i,
                      /@playwright\.test$/i,
                      /@example\.com$/i,
                    ];
                    const safe2 = isE2EMode
                      ? list2
                      : list2.filter(
                          (u) => !testEmailPatterns.some((re) => re.test(u.email || '')),
                        );
                    if (safe2 && safe2.length > 0) {
                      userData = safe2[0];
                    }
                  }
                }
              } else {
                const txt = await syncResp.text();
                console.warn('[Supabase Auth] sync-from-auth failed:', syncResp.status, txt);
              }
            } catch (syncError) {
              console.warn('[Supabase Auth] Could not auto-create CRM record:', syncError.message);
            }
          }
        } catch (err) {
          console.error('[Supabase Auth] Error fetching user data:', err.message);
        }

        // Explicit employees-table check so is_employee + the authoritative
        // employees.id are correct regardless of whether the main userData
        // lookup hit /api/users or /api/employees. Without this, employee_id
        // can end up holding a users.id (because we fall back to
        // `userData.id` when employee_id isn't on the row) — same class of
        // bug as 4VD-44. See docs/architecture/IDENTITY_MODEL.md rule #6
        // and PR #581 Codex review.
        let isEmployee = false;
        let resolvedEmployeeId = null;
        try {
          const empResp = await fetch(
            `${BACKEND_URL}/api/employees?email=${encodeURIComponent(user.email)}`,
          );
          if (empResp.ok) {
            const empJson = await empResp.json();
            const empRaw = empJson.data || empJson;
            const empList = Array.isArray(empRaw)
              ? empRaw.filter((e) => (e.email || '').toLowerCase() === user.email.toLowerCase())
              : [];
            // Status filter mirrors requireEmployee middleware: a row with
            // status=inactive/suspended is not gate-passing material.
            const activeEmp = empList.find(
              (e) => !e.status || String(e.status).toLowerCase() === 'active',
            );
            if (activeEmp) {
              isEmployee = true;
              resolvedEmployeeId = activeEmp.id;
            }
          }
        } catch (empErr) {
          // Best-effort: a failed lookup leaves is_employee=false, which
          // hides the gated UI. Backend still enforces the gate
          // independently via requireEmployee middleware.
          console.warn('[Supabase Auth] is_employee check failed:', empErr?.message);
        }

        // Map Supabase user to our User format with database data
        // IMPORTANT: Merge order ensures DATABASE values override Supabase user_metadata
        return {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          created_at: user.created_at,
          updated_at: user.updated_at,
          // Bring in any custom fields from auth metadata FIRST (lowest priority)
          ...(user.user_metadata || {}),
          // Then set tenant_id with DB-first precedence
          tenant_id:
            userData?.tenant_id !== undefined && userData?.tenant_id !== null
              ? userData.tenant_id
              : (user.user_metadata?.tenant_id ?? null),
          // is_employee comes from the explicit employees-table lookup above,
          // independent of which table userData was hydrated from. This is
          // what frontend gates (Send Document) check. See PR #581 Codex
          // review + docs/architecture/IDENTITY_MODEL.md rule #6.
          is_employee: isEmployee,
          // Surface the resolved employee_id even if userData is null
          // (rare: auth user with no users/employees profile but a
          // matching employees row). The spread below would otherwise
          // skip and leave employee_id undefined.
          ...(resolvedEmployeeId && !userData && { employee_id: resolvedEmployeeId }),
          // Finally, include database user data LAST so it overrides metadata
          ...(userData && {
            // Prefer the resolved employees.id over userData.id when the
            // explicit lookup found one — otherwise fall back to the
            // legacy behavior. Without this, employee_id ends up holding a
            // users.id row when userData was hydrated from /api/users
            // (same class of bug as 4VD-44).
            employee_id: resolvedEmployeeId || userData.employee_id || userData.id,
            employee_role: userData.employee_role,
            first_name: userData.first_name,
            last_name: userData.last_name,
            // Derive full/display names from DB when present
            full_name:
              userData.full_name ||
              `${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
              undefined,
            display_name:
              userData.display_name ||
              userData.full_name ||
              `${userData.first_name || ''} ${userData.last_name || ''}`.trim() ||
              undefined,
            role: (userData.role || '').toLowerCase(), // Normalize role to lowercase
            status: userData.status,
            permissions: userData.metadata?.permissions || [],
            access_level: userData.metadata?.access_level,
            is_superadmin: (userData.role || '').toLowerCase() === 'superadmin',
            can_manage_users: userData.metadata?.can_manage_users || false,
            can_manage_settings: userData.metadata?.can_manage_settings || false,
            crm_access: true, // Grant CRM access to authenticated users with records
            // nav_permissions is the actual DB column; navigation_permissions was the old metadata key
            // Support both for backwards compatibility, preferring nav_permissions
            navigation_permissions:
              userData.nav_permissions || userData.navigation_permissions || {},
          }),
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in me():', err);
        return null;
      }
    }

    // No authentication system configured
    console.error('[Auth] No authentication system configured');
    throw new Error('Authentication system not configured. Please configure Supabase.');
  },

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   */
  signIn: async (email, password) => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('[Supabase Auth] Sign in error:', error);
          throw new Error(error.message);
        }

        logDev('[Supabase Auth] Sign in successful:', data.user?.email);

        // ⚠️ CHECK 1: Password Expiration
        const passwordExpiresAt = data.user.user_metadata?.password_expires_at;
        if (passwordExpiresAt) {
          const expirationDate = new Date(passwordExpiresAt);
          const now = new Date();

          if (expirationDate < now) {
            // Password has expired - sign out and reject
            await supabase.auth.signOut();
            throw new Error(
              'Your temporary password has expired. Please contact your administrator for a password reset.',
            );
          }
        }

        // ⚠️ CHECK 2: Fetch user from backend to check CRM access and account status
        try {
          const response = await fetch(
            `${BACKEND_URL}/api/users?email=${encodeURIComponent(email)}`,
          );
          if (response.ok) {
            const result = await response.json();
            const users = result.data?.users || result.data || result;

            if (users && users.length > 0) {
              const dbUser = users[0];

              // Check if account status is inactive
              if (dbUser.status === 'inactive') {
                await supabase.auth.signOut();
                throw new Error('Your account has been suspended. Contact your administrator.');
              }

              // Check if CRM access is revoked (permissions array doesn't include 'crm_access')
              if (dbUser.permissions && !dbUser.permissions.includes('crm_access')) {
                await supabase.auth.signOut();
                throw new Error(
                  'CRM access has been disabled for your account. Contact your administrator.',
                );
              }
            }
          }
        } catch (backendError) {
          // Log but don't block login if backend check fails
          console.warn('[Supabase Auth] Could not verify account status:', backendError.message);
        }

        // Return mapped user object
        return {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
          tenant_id: data.user.user_metadata?.tenant_id || null,
          session: data.session,
          ...data.user.user_metadata,
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in signIn():', err);
        throw err;
      }
    }

    // No authentication system configured
    console.error('[Auth] No authentication system configured');
    throw new Error('Authentication system not configured. Please configure Supabase.');
  },

  /**
   * Sign out current user
   */
  signOut: async () => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error('[Supabase Auth] Sign out error:', error);
          throw new Error(error.message);
        }

        logDev('[Supabase Auth] Sign out successful');
        return true;
      } catch (err) {
        console.error('[Supabase Auth] Exception in signOut():', err);
        throw err;
      }
    }

    // No authentication system configured
    console.error('[Auth] No authentication system configured');
    throw new Error('Authentication system not configured. Please configure Supabase.');
  },

  /**
   * Sign up new user
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {object} metadata - Additional user metadata (tenant_id, name, etc.)
   */
  signUp: async (email, password, metadata = {}) => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: metadata, // Store tenant_id and other metadata
          },
        });

        if (error) {
          console.error('[Supabase Auth] Sign up error:', error);
          throw new Error(error.message);
        }

        logDev('[Supabase Auth] Sign up successful:', data.user?.email);

        return {
          id: data.user?.id,
          email: data.user?.email,
          user_metadata: data.user?.user_metadata,
          tenant_id: metadata.tenant_id,
          session: data.session,
          ...metadata,
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in signUp():', err);
        throw err;
      }
    }

    // No authentication system configured
    console.error('[Auth] No authentication system configured');
    throw new Error('Authentication system not configured. Please configure Supabase.');
  },

  /**
   * Update current user's metadata
   * @param {object} updates - User metadata to update
   */
  updateMyUserData: async (updates) => {
    // Production: Use Supabase Auth
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.auth.updateUser({
          data: updates, // Update user_metadata
        });

        if (error) {
          console.error('[Supabase Auth] Update user error:', error);
          throw new Error(error.message);
        }

        logDev('[Supabase Auth] User updated successfully');

        return {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
          tenant_id: data.user.user_metadata?.tenant_id || null,
          ...data.user.user_metadata,
        };
      } catch (err) {
        console.error('[Supabase Auth] Exception in updateMyUserData():', err);
        throw err;
      }
    }

    // No authentication system configured
    console.error('[Auth] No authentication system configured');
    throw new Error('Authentication system not configured. Please configure Supabase.');
  },

  /**
   * List all users (admin function - uses backend API)
   */
  list: async (filters) => {
    // ALWAYS use backend API for listing users (don't mock this - we need real data)
    logDev('[User.list] Fetching users via backend API');
    return callBackendAPI('User', 'GET', filters);
  },

  /**
   * Update any user by ID (admin function - uses backend API)
   */
  update: async (userId, updates) => {
    // ALWAYS use backend API for user updates (don't mock this - we need real persistence)
    logDev('[User.update] Updating user via backend API:', userId, updates);
    return callBackendAPI('User', 'PUT', updates, userId);
  },

  /**
   * Alias for signIn() - for backwards compatibility
   */
  login: async (email, password) => {
    return User.signIn(email, password);
  },

  /**
   * Alias for signOut() - for backwards compatibility
   */
  logout: async () => {
    return User.signOut();
  },

  /**
   * List user profiles with linked employee data
   * @param {object} filters - Optional filters (tenant_id, role, etc.)
   */
  listProfiles: async (filters = {}, { cacheBust = false } = {}) => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value);
        }
      });
      if (cacheBust) {
        params.append('_t', Date.now());
      }

      // Use /profiles endpoint which queries user_profile_view and includes tenant_name
      const url = `${BACKEND_URL}/api/users/profiles${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data?.users || result.data || result || [];
    } catch (error) {
      console.error('[User.listProfiles] Error:', error);
      throw error;
    }
  },

  /**
   * Update user profile
   * @param {string} id - User ID
   * @param {object} data - Update data
   */
  updateProfile: async (id, data) => {
    try {
      const url = `${BACKEND_URL}/api/users/${id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update user: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[User.update] Error:', error);
      throw error;
    }
  },
};
