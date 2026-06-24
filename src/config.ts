/**
 * Global Configuration
 * 
 * In development (localhost), we use "" so requests route to the Vite proxy.
 * In production (Vercel), we must explicitly point to the Render backend URL.
 */

export const API_BASE = import.meta.env.DEV 
  ? "" 
  : (import.meta.env.VITE_CRM_BACKEND_URL || "https://pdfeasy-backend.onrender.com");
