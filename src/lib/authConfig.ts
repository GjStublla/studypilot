import { LOCAL_DEV_MODE } from './localDev';

/**
 * Production and ordinary development builds always require authentication.
 * The explicit, loopback-only `studypilot-local` mode bootstraps a disposable
 * local Supabase user before rendering the dashboard.
 */
export const AUTH_REQUIRED = !LOCAL_DEV_MODE;
