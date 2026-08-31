import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, backendUrl, appBaseUrl } = appParams;

// The app runs on Vercel, but Base44 still handles the temporary auth backend.
// Provider OAuth endpoints live on Base44, while the provider return URL is
// explicitly supplied by the login page as the current Vercel origin.
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: backendUrl || 'https://base44.app',
  requiresAuth: false,
  appBaseUrl: appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://artflowcreativeapp.com')
});
