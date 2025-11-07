/**
 * resendInvite - Resend Supabase Auth invitation email to an existing user
 * Calls POST /api/users/:id/invite to trigger the invitation flow
 */

import { getBackendUrl } from "@/api/backendUrl";

/**
 * Resend invite to user
 * @param {string} userId - User ID to resend invite to
 * @param {string} frontendUrl - Optional frontend URL for redirect (defaults to current origin)
 * @returns {Promise<{success: boolean, message: string, error?: any}>}
 */
export async function resendInvite(userId, frontendUrl = null) {
  try {
    console.log(`[resendInvite] Sending invitation to user:`, userId);

    const backendUrl = getBackendUrl();
    const redirectUrl = frontendUrl || `${window.location.origin}/accept-invite`;

    const response = await fetch(`${backendUrl}/api/users/${userId}/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        redirect_url: redirectUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[resendInvite] Backend error:", data);
      throw new Error(data.message || "Failed to resend invitation");
    }

    console.log("[resendInvite] Invitation sent successfully:", data);

    return {
      success: true,
      message: data.message || "Invitation sent successfully",
      data: data.data,
    };
  } catch (error) {
    console.error("[resendInvite] Error:", error);
    return {
      success: false,
      message: error.message || "Failed to resend invitation",
      error,
    };
  }
}

export default resendInvite;
