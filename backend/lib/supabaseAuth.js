/**
 * Supabase Auth Helper
 * Handles user authentication operations with Supabase Auth
 */

import { createClient } from "@supabase/supabase-js";

let supabaseAdmin = null;

/**
 * Initialize Supabase Admin Client
 * Uses service role key for admin operations (user creation, password reset, etc.)
 */
export function initSupabaseAuth() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn(
      "⚠ Supabase Auth not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
    return null;
  }

  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("✓ Supabase Auth initialized");
  return supabaseAdmin;
}

/**
 * Create a new auth user in Supabase
 * @param {string} email - User email
 * @param {string} password - Temporary password (user must change within 24 hours)
 * @param {object} metadata - User metadata (name, role, etc.)
 * @returns {Promise<{user, error}>}
 */
export async function createAuthUser(email, password, metadata = {}) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        ...metadata,
        password_change_required: true,
        password_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
          .toISOString(), // 24 hours from now
      },
    });

    if (error) {
      console.error("[Supabase Auth] Error creating user:", error);
      return { user: null, error };
    }

    console.log(`✓ Created auth user: ${email}`);
    return { user: data.user, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception creating user:", error);
    return { user: null, error };
  }
}

/**
 * Update auth user password
 * @param {string} userId - Supabase auth user ID
 * @param {string} newPassword - New password
 * @returns {Promise<{user, error}>}
 */
export async function updateAuthUserPassword(userId, newPassword) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        password: newPassword,
      },
    );

    if (error) {
      console.error("[Supabase Auth] Error updating password:", error);
      return { user: null, error };
    }

    console.log(`✓ Updated password for user: ${userId}`);
    return { user: data.user, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception updating password:", error);
    return { user: null, error };
  }
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<{data, error}>}
 */
export async function sendPasswordResetEmail(email) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/reset-password`,
      },
    );

    if (error) {
      console.error("[Supabase Auth] Error sending reset email:", error);
      return { data: null, error };
    }

    console.log(`✓ Sent password reset email to: ${email}`);
    return { data, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception sending reset email:", error);
    return { data: null, error };
  }
}

/**
 * Invite user by email - sends invitation email via Supabase Auth
 * @param {string} email - User email address
 * @param {Object} metadata - User metadata
 * @returns {Promise<{user, error}>}
 */
export async function inviteUserByEmail(email, metadata = {}) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          ...metadata,
          password_change_required: true,
        },
        redirectTo: `${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }/accept-invite`,
      },
    );

    if (error) {
      console.error("[Supabase Auth] Error inviting user:", error);
      return { user: null, error };
    }

    console.log(`✓ User created and invitation queued for: ${email}`);
    console.log(`  → Auth User ID: ${data.user?.id}`);
    console.log(`  → Email will be sent via configured SMTP`);
    console.log(
      `  → Check Supabase Dashboard → Auth → Logs to verify delivery`,
    );
    return { user: data.user, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception inviting user:", error);
    return { user: null, error };
  }
}

/**
 * Delete auth user from Supabase
 * @param {string} userId - Supabase auth user ID
 * @returns {Promise<{data, error}>}
 */
export async function deleteAuthUser(userId) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("[Supabase Auth] Error deleting user:", error);
      return { data: null, error };
    }

    console.log(`✓ Deleted auth user: ${userId}`);
    return { data, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception deleting user:", error);
    return { data: null, error };
  }
}

/**
 * Get auth user by email
 * @param {string} email - User email
 * @returns {Promise<{user, error}>}
 */
export async function getAuthUserByEmail(email) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error("[Supabase Auth] Error listing users:", error);
      return { user: null, error };
    }

    const user = data.users.find((u) => u.email === email);
    return { user: user || null, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception getting user:", error);
    return { user: null, error };
  }
}

/**
 * Update user metadata
 * @param {string} userId - Supabase auth user ID
 * @param {object} metadata - Metadata to update
 * @returns {Promise<{user, error}>}
 */
export async function updateAuthUserMetadata(userId, metadata) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: metadata,
      },
    );

    if (error) {
      console.error("[Supabase Auth] Error updating metadata:", error);
      return { user: null, error };
    }

    console.log(`✓ Updated metadata for user: ${userId}`);
    return { user: data.user, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception updating metadata:", error);
    return { user: null, error };
  }
}

/**
 * Confirm user's email (bypass email verification)
 * @param {string} userId - Supabase auth user ID
 * @returns {Promise<{user, error}>}
 */
export async function confirmUserEmail(userId) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        email_confirm: true,
      },
    );

    if (error) {
      console.error("[Supabase Auth] Error confirming email:", error);
      return { user: null, error };
    }

    console.log(`✓ Email confirmed for user: ${userId}`);
    return { user: data.user, error: null };
  } catch (error) {
    console.error("[Supabase Auth] Exception confirming email:", error);
    return { user: null, error };
  }
}

export default {
  initSupabaseAuth,
  createAuthUser,
  updateAuthUserPassword,
  sendPasswordResetEmail,
  inviteUserByEmail,
  deleteAuthUser,
  getAuthUserByEmail,
  updateAuthUserMetadata,
  confirmUserEmail,
};
