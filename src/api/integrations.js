import { base44 } from './base44Client';
import { isLocalDevMode } from './mockData';

// Create mock integration functions for local dev mode
const createMockIntegration = (name) => () => {
  if (isLocalDevMode()) {
    console.warn(`[Local Dev Mode] Integration '${name}' called but not available in local dev mode.`);
    return Promise.resolve({ success: false, message: 'Integration not available in local dev mode' });
  }
  return null;
};

/**
 * UploadFile - Upload file to backend storage
 * Works in both local dev and production
 */
export const UploadFile = async ({ file }) => {
  const backendUrl = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
  
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${backendUrl}/api/storage/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }

    const result = await response.json();
    return {
      file_url: result.data.file_url,
      filename: result.data.filename,
      success: true,
    };
  } catch (error) {
    console.error('[UploadFile] Error:', error);
    throw error;
  }
};

// Mock Core integration object
const mockCore = {
  InvokeLLM: createMockIntegration('InvokeLLM'),
  SendEmail: createMockIntegration('SendEmail'),
  GenerateImage: createMockIntegration('GenerateImage'),
  ExtractDataFromUploadedFile: createMockIntegration('ExtractDataFromUploadedFile'),
  CreateFileSignedUrl: createMockIntegration('CreateFileSignedUrl'),
  UploadPrivateFile: createMockIntegration('UploadPrivateFile'),
};

export const Core = isLocalDevMode() || !base44.integrations?.Core ? mockCore : base44.integrations.Core;

export const InvokeLLM = Core.InvokeLLM;
export const SendEmail = Core.SendEmail;
export const GenerateImage = Core.GenerateImage;
export const ExtractDataFromUploadedFile = Core.ExtractDataFromUploadedFile;
export const CreateFileSignedUrl = Core.CreateFileSignedUrl;
export const UploadPrivateFile = Core.UploadPrivateFile;






