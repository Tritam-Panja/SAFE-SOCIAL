import axios from 'axios';

// Allows environment variable override for production deployments (e.g. VITE_API_URL=https://api.fizzykids.safe/api/v1)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(
      error.response?.data?.error || {
        code: 'NETWORK_ERROR',
        message: 'Could not connect to the server',
      }
    );
  }
);
