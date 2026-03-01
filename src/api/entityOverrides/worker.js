// Worker entity - Contractors/Temp Labor Management
// Extracted from src/api/entities.js
import { BACKEND_URL } from '../core/httpClient';

/**
 * Workers - Contractors/Temp Labor Management
 * Uses custom API endpoint: /api/workers
 */
export const Worker = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const url = `${BACKEND_URL}/api/workers${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list workers: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.workers || result.data || [];
  },

  get: async (id) => {
    const url = `${BACKEND_URL}/api/workers/${id}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to get worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  create: async (data) => {
    const url = `${BACKEND_URL}/api/workers`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  update: async (id, data) => {
    const url = `${BACKEND_URL}/api/workers/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to update worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },

  delete: async (id) => {
    const url = `${BACKEND_URL}/api/workers/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to delete worker: ${response.status}`);
    }
    const result = await response.json();
    return result.data || result;
  },
};
