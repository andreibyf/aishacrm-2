import { isLocalDevMode } from "./mockData";
import { getBackendUrl } from "./backendUrl";

// Create mock integration functions for local dev mode
const createMockIntegration = (name) => () => {
  if (isLocalDevMode()) {
    console.warn(
      `[Local Dev Mode] Integration '${name}' called but not available in local dev mode.`,
    );
    return Promise.resolve({
      success: false,
      message: "Integration not available in local dev mode",
    });
  }
  return null;
};

/**
 * UploadFile - Upload file to backend storage
 * Works in both local dev and production
 * @param {Object} params
 * @param {File} params.file - The file to upload
 * @param {string} [params.tenant_id] - Optional tenant ID to scope the upload
 */
export const UploadFile = async ({ file, tenant_id }) => {
  const backendUrl = getBackendUrl();

  // Use explicitly provided tenant_id, or attempt to infer from URL/localStorage
  let tenantId = tenant_id;
  if (!tenantId) {
    try {
      const urlTenant = new URL(window.location.href).searchParams.get("tenant");
      const storedTenant = localStorage.getItem("selected_tenant_id");
      tenantId = urlTenant || storedTenant || null;
    } catch (err) {
      // ignore access errors in non-browser contexts
      void err;
    }
  }

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${backendUrl}/api/storage/upload`, {
      method: "POST",
      // Don't set Content-Type for FormData; add tenant header if present
      headers: tenantId ? { "x-tenant-id": tenantId } : undefined,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Upload failed");
    }

    const result = await response.json();
    return {
      file_url: result.data.file_url,
      filename: result.data.filename,
      success: true,
    };
  } catch (error) {
    console.error("[UploadFile] Error:", error);
    throw error;
  }
};

/**
 * CreateFileSignedUrl - Generate signed URL for a file
 * Works in both local dev and production
 * @param {Object} params
 * @param {string} params.file_uri - The file path/URI to get signed URL for
 */
export const CreateFileSignedUrl = async ({ file_uri }) => {
  const backendUrl = getBackendUrl();

  try {
    const response = await fetch(`${backendUrl}/api/storage/signed-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_uri }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to get signed URL");
    }

    const result = await response.json();
    return {
      signed_url: result.data.signed_url,
      expires_in: result.data.expires_in,
      success: true,
    };
  } catch (error) {
    console.error("[CreateFileSignedUrl] Error:", error);
    throw error;
  }
};

// Mock Core integration object
const mockCore = {
  InvokeLLM: createMockIntegration("InvokeLLM"),
  SendEmail: createMockIntegration("SendEmail"),
  GenerateImage: createMockIntegration("GenerateImage"),
  ExtractDataFromUploadedFile: createMockIntegration(
    "ExtractDataFromUploadedFile",
  ),
  UploadPrivateFile: createMockIntegration("UploadPrivateFile"),
};

// Export mock Core integration - all functionality moved to backend
export const Core = mockCore;

export const InvokeLLM = Core.InvokeLLM;
export const SendEmail = Core.SendEmail;
export const GenerateImage = Core.GenerateImage;
export const ExtractDataFromUploadedFile = Core.ExtractDataFromUploadedFile;
export const UploadPrivateFile = Core.UploadPrivateFile;
