// Construction entities - ConstructionProject and ConstructionAssignment
// Extracted from src/api/entities.js
import { BACKEND_URL } from '../core/httpClient';

/**
 * Construction Projects - for staffing companies tracking client projects
 * Uses custom API endpoint: /api/construction/projects
 */
export const ConstructionProject = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const url = `${BACKEND_URL}/api/construction/projects${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to list construction projects: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data?.projects || result.data || [];
  },

  get: async (id) => {
    const url = `${BACKEND_URL}/api/construction/projects/${id}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to get construction project: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  create: async (data) => {
    const url = `${BACKEND_URL}/api/construction/projects`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to create construction project: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  update: async (id, data) => {
    const url = `${BACKEND_URL}/api/construction/projects/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to update construction project: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  delete: async (id) => {
    const url = `${BACKEND_URL}/api/construction/projects/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to delete construction project: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },
};

/**
 * Construction Assignments - worker assignments to projects
 * Uses custom API endpoint: /api/construction/assignments
 */
export const ConstructionAssignment = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const url = `${BACKEND_URL}/api/construction/assignments${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to list construction assignments: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data?.assignments || result.data || [];
  },

  get: async (id) => {
    const url = `${BACKEND_URL}/api/construction/assignments/${id}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to get construction assignment: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  create: async (data) => {
    const url = `${BACKEND_URL}/api/construction/assignments`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to create construction assignment: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  update: async (id, data) => {
    const url = `${BACKEND_URL}/api/construction/assignments/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to update construction assignment: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  delete: async (id) => {
    const url = `${BACKEND_URL}/api/construction/assignments/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to delete construction assignment: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data || result;
  },

  listByProject: async (projectId) => {
    const url = `${BACKEND_URL}/api/construction/assignments/by-project/${projectId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to list project assignments: ${response.status}`,
      );
    }
    const result = await response.json();
    return result.data?.assignments || result.data || [];
  },

  listByWorker: async (contactId) => {
    const url = `${BACKEND_URL}/api/construction/assignments/by-worker/${contactId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to list worker assignments: ${response.status}`);
    }
    const result = await response.json();
    return result.data?.assignments || result.data || [];
  },
};
