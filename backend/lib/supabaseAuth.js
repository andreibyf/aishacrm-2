/**
 * Supabase Auth Helper
 * Handles user authentication operations with Supabase Auth
 */

import { getSupabaseAdmin } from "./supabaseFactory.js";
import logger from './logger.js';

let supabaseAdmin = null;

/**
 * Initialize Supabase Admin Client
 * Uses service role key for admin operations (user creation, password reset, etc.)
 */
export function initSupabaseAuth() {
  try {
    supabaseAdmin = getSupabaseAdmin({ throwOnMissing: false });
    if (!supabaseAdmin) {
      logger.warn('⚠ Supabase Auth not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      return null;
    }
    logger.info('✓ Supabase Auth initialized');
    return supabaseAdmin;
  } catch (error) {
    logger.warn('⚠ Supabase Auth not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
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
      logger.error({ err: error, email }, '[Supabase Auth] Error creating user');
      return { user: null, error };
    }

    logger.info({ email }, '✓ Created auth user');
    return { user: data.user, error: null };
  } catch (error) {
    logger.error({ err: error, email }, '[Supabase Auth] Exception creating user');
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
      logger.error({ err: error, userId }, '[Supabase Auth] Error updating password');
      return { user: null, error };
    }

    logger.info({ userId }, '✓ Updated password for user');
    return { user: data.user, error: null };
  } catch (error) {
    logger.error({ err: error, userId }, '[Supabase Auth] Exception updating password');
    return { user: null, error };
  }
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} redirectTo - Optional redirect URL after reset
 * @returns {Promise<{data, error}>}
 */
export async function sendPasswordResetEmail(email, redirectTo) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }

  try {
    // Redirect to dedicated reset route so UI immediately presents password form.
    // FRONTEND_URL is REQUIRED in production - no localhost fallback.
    let resetRedirectUrl;
    if (redirectTo) {
      // allow caller override (must be whitelisted in Supabase Auth settings)
      resetRedirectUrl = redirectTo;
    } else if (process.env.FRONTEND_URL) {
      resetRedirectUrl = `${process.env.FRONTEND_URL}/auth/reset`;
    } else if (process.env.NODE_ENV === 'development') {
      resetRedirectUrl = 'http://localhost:4000/auth/reset';
      logger.warn('⚠️  FRONTEND_URL not set, using dev default: http://localhost:4000/auth/reset');
    } else {
      throw new Error('FRONTEND_URL environment variable is required for password reset in production');
    }

    const { data, error } = await supabaseAdmin.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: resetRedirectUrl,
      },
    );

    if (error) {
      logger.error({ err: error, email }, '[Supabase Auth] Error sending reset email');
      return { data: null, error };
    }

    logger.info({ email }, '✓ Sent password reset email');
    return { data, error: null };
  } catch (error) {
    logger.error({ err: error, email }, '[Supabase Auth] Exception sending reset email');
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
    // Use same logic as password reset for consistency
    let inviteRedirectTo;
    if (process.env.FRONTEND_URL) {
      inviteRedirectTo = `${process.env.FRONTEND_URL}/accept-invite`;
    } else if (process.env.NODE_ENV === 'development') {
      inviteRedirectTo = 'http://localhost:4000/accept-invite';
      logger.warn('⚠️  FRONTEND_URL not set, using dev default: http://localhost:4000');
    } else {
      throw new Error('FRONTEND_URL environment variable is required for user invitations in production');
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          ...metadata,
          password_change_required: true,
        },
        redirectTo: inviteRedirectTo,
      },
    );

    if (error) {
      logger.error({ err: error, email }, '[Supabase Auth] Error inviting user');
      return { user: null, error };
    }

    logger.info({ email, authUserId: data.user?.id }, '✓ User created and invitation queued');
    logger.info('  → Email will be sent via configured SMTP');
    logger.info('  → Check Supabase Dashboard → Auth → Logs to verify delivery');
    return { user: data.user, error: null };
  } catch (error) {
    logger.error({ err: error, email }, '[Supabase Auth] Exception inviting user');
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
      logger.error({ err: error, userId }, '[Supabase Auth] Error deleting user');
      return { data: null, error };
    }

    logger.info({ userId }, '✓ Deleted auth user');
    return { data, error: null };
  } catch (error) {
    logger.error({ err: error, userId }, '[Supabase Auth] Exception deleting user');
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
      logger.error({ err: error, email }, '[Supabase Auth] Error listing users');
      return { user: null, error };
    }

    const user = data.users.find((u) => u.email === email);
    return { user: user || null, error: null };
  } catch (error) {
    logger.error({ err: error, email }, '[Supabase Auth] Exception getting user');
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
      logger.error({ err: error, userId }, '[Supabase Auth] Error updating metadata');
      return { user: null, error };
    }

    logger.info({ userId }, '✓ Updated metadata for user');
    return { user: data.user, error: null };
  } catch (error) {
    logger.error({ err: error, userId }, '[Supabase Auth] Exception updating metadata');
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
      logger.error({ err: error, userId }, '[Supabase Auth] Error confirming email');
      return { user: null, error };
    }

    logger.info({ userId }, '✓ Email confirmed for user');
    return { user: data.user, error: null };
  } catch (error) {
    logger.error({ err: error, userId }, '[Supabase Auth] Exception confirming email');
    return { user: null, error };
  }
}

/**
 * Generate a recovery link without sending email (diagnostic / manual testing)
 * @param {string} email - User email
 * @param {string} redirectTo - Optional redirect override (must be whitelisted)
 * @returns {Promise<{link: string|null, error: any}>}
 */
export async function generateRecoveryLink(email, redirectTo) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Auth not initialized");
  }
  if (!email) {
    return { link: null, error: { message: "email is required" } };
  }
  try {
    let resetRedirectUrl;
    if (redirectTo) {
      resetRedirectUrl = redirectTo;
    } else if (process.env.FRONTEND_URL) {
      resetRedirectUrl = `${process.env.FRONTEND_URL}/auth/reset`;
    } else if (process.env.NODE_ENV === 'development') {
      resetRedirectUrl = 'http://localhost:4000/auth/reset';
      logger.warn('⚠️  FRONTEND_URL not set; using dev default recovery redirect http://localhost:4000/auth/reset');
    } else {
      throw new Error("FRONTEND_URL environment variable is required for recovery link generation in production");
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: resetRedirectUrl }
    });
    if (error) {
      logger.error({ err: error, email }, '[Supabase Auth] generateLink error');
      return { link: null, error };
    }
    const link = data?.properties?.action_link || null;
    if (!link) {
      return { link: null, error: { message: "Recovery link not returned by Supabase" } };
    }
    return { link, error: null };
  } catch (e) {
    logger.error({ err: e, email }, '[Supabase Auth] Exception generating recovery link');
    return { link: null, error: { message: e.message } };
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
  generateRecoveryLink,
};
