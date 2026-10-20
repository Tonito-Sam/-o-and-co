import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const env = import.meta.env as ImportMetaEnv & {
    PUBLIC_URL?: string;
    PUBLISHABLE_KEY?: string;
    SUPABASE_PUBLIC_ANON_KEY?: string;
  };
  const url = env.VITE_SUPABASE_URL || env.PUBLIC_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLIC_ANON_KEY || env.PUBLISHABLE_KEY;
  client = url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;

  return client;
}