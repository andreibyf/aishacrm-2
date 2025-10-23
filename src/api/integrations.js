import { base44 } from './base44Client';
import { isLocalDevMode } from './mockData';

// Create mock integration functions for local dev mode
const createMockIntegration = (name) => (...args) => {
  if (isLocalDevMode()) {
    console.warn(`[Local Dev Mode] Integration '${name}' called but not available in local dev mode.`);
    return Promise.resolve({ success: false, message: 'Integration not available in local dev mode' });
  }
  return null;
};

// Mock Core integration object
const mockCore = {
  InvokeLLM: createMockIntegration('InvokeLLM'),
  SendEmail: createMockIntegration('SendEmail'),
  UploadFile: createMockIntegration('UploadFile'),
  GenerateImage: createMockIntegration('GenerateImage'),
  ExtractDataFromUploadedFile: createMockIntegration('ExtractDataFromUploadedFile'),
  CreateFileSignedUrl: createMockIntegration('CreateFileSignedUrl'),
  UploadPrivateFile: createMockIntegration('UploadPrivateFile'),
};

export const Core = isLocalDevMode() || !base44.integrations?.Core ? mockCore : base44.integrations.Core;

export const InvokeLLM = Core.InvokeLLM;
export const SendEmail = Core.SendEmail;
export const UploadFile = Core.UploadFile;
export const GenerateImage = Core.GenerateImage;
export const ExtractDataFromUploadedFile = Core.ExtractDataFromUploadedFile;
export const CreateFileSignedUrl = Core.CreateFileSignedUrl;
export const UploadPrivateFile = Core.UploadPrivateFile;






