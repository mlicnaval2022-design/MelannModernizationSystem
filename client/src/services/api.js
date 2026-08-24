import axios from 'axios';

export function resolveApiBaseURL({
  configuredBaseURL = import.meta.env.VITE_API_BASE_URL,
} = {}) {
  return String(configuredBaseURL || '/api').replace(/\/$/, '');
}

const API_BASE_URL = resolveApiBaseURL();
const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('melann_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default API;
