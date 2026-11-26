import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Token en memoria (NO en localStorage: anti-XSS). El refresh va en cookie httpOnly.
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // envía la cookie de refresh en /auth/refresh
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Cola de reintentos mientras se renueva el token (evita refresh concurrente)
let isRefreshing = false;
let queue: Array<(token: string | null) => void> = [];

const flushQueue = (token: string | null) => {
  queue.forEach((cb) => cb(token));
  queue = [];
};

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    // Si no es 401, o ya se reintentó, o es el propio login/refresh -> propagar
    const url = original?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh');
    if (status !== 401 || original._retry || isAuthCall) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const newToken: string = data.access_token;
        setAccessToken(newToken);
        flushQueue(newToken);
        original.headers!.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        setAccessToken(null);
        flushQueue(null);
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Ya hay un refresh en curso: esperar al nuevo token
    return new Promise((resolve, reject) => {
      queue.push((token) => {
        if (!token) return reject(error);
        original.headers!.Authorization = `Bearer ${token}`;
        resolve(api(original));
      });
    });
  }
);
