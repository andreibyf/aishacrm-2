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

// Real implementation for CreateFileSignedUrl using backend API
async function CreateFileSignedUrl({ file_uri, expires_in = 3600 }) {
  try {
    const response = await fetch(`${getBackendUrl()}/api/storage/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_uri, expires_in }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.data; // Returns { signed_url, expires_at }
  } catch (error) {
    console.error('[CreateFileSignedUrl] Error:', error);
    throw error;
  }
}

// Export mock Core integration - all functionality moved to backend
export const Core = { ...mockCore, CreateFileSignedUrl };

export const InvokeLLM = Core.InvokeLLM;
export const SendEmail = Core.SendEmail;
export const GenerateImage = Core.GenerateImage;
export const ExtractDataFromUploadedFile = Core.ExtractDataFromUploadedFile;
export { CreateFileSignedUrl };
export const UploadPrivateFile = Core.UploadPrivateFile;

/**
 * Tests the connection to the OpenAI API using the provided credentials.
 * @param {object} data - The data for testing the connection.
 * @param {string} data.api_key - The OpenAI API key.
 * @param {string} data.model - The model to use for the test.
 * @returns {Promise<object>} The response from the backend.
 */
export const testOpenAIConnection = async (data) => {
  const backendUrl = getBackendUrl();
  
  // Create an AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(`${backendUrl}/api/integrations/openai/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const result = await response.json();

    if (!response.ok) {
      // Create an error object that mimics the structure components might expect
      const error = new Error(result.error || 'API request failed');
      error.response = { data: result };
      throw error;
    }

    return { data: result }; // Wrap in `data` to maintain consistency with other calls
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle abort/timeout error
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Request timeout - OpenAI API took too long to respond');
      timeoutError.response = { data: { error: 'Request timeout after 30 seconds' } };
      console.error("[testOpenAIConnection] Timeout:", timeoutError);
      throw timeoutError;
    }
    
    console.error("[testOpenAIConnection] Error:", error);
    // Re-throw the error so it can be caught by the calling component
    throw error;
  }
};
