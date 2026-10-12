import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://docvault-backend-iv5x.onrender.com';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth endpoints
export const login = (username, password) => {
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);
  return api.post('/auth/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
};

export const register = (username, email, password) => api.post('/auth/register', { username, email, password });
export const getMe = () => api.get('/auth/me');

// Document endpoints
export const getDocuments = (q = '') => api.get(`/documents/?q=${q}`);
export const uploadDocument = (formData) => api.post('/documents/upload', formData, {
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
export const bulkDeleteDocuments = (documentIds) => api.post('/documents/bulk-delete', { document_ids: documentIds });
export const searchDocuments = (q) => api.get(`/documents/search?q=${q}`);

// Folder endpoints
export const getFolders = () => api.get('/folders/');
export const createFolder = (name) => api.post('/folders/', { name });
export const renameFolder = (id, name) => api.patch(`/folders/${id}`, { name });
export const deleteFolder = (id) => api.delete(`/folders/${id}`);

// Audit log endpoints
export const getAuditLogs = (limit = 100, offset = 0) =>
  api.get(`/audit/?limit=${limit}&offset=${offset}`);

export default api;
