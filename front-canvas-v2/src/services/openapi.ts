import { OpenAPI } from './generated'

declare global {
  interface Window {
    __ENV?: { BACKEND_URL?: string }
  }
}

/** 后端固定为 http://127.0.0.1:8000/api/v1，本地开发不代理，直连即可。 */
const runtimeBackendUrl = window.__ENV?.BACKEND_URL
const buildtimeBackendUrl = import.meta.env.VITE_BACKEND_URL
const defaultBackendUrl = 'http://127.0.0.1:8000'

OpenAPI.BASE = runtimeBackendUrl ?? buildtimeBackendUrl ?? defaultBackendUrl
