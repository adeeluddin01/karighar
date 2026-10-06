import { createBrowserClient } from "@supabase/ssr";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_KEY } from "./config";

// Browser-side Supabase client (used in Client Components).
export function createClient() {
  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_KEY);
}
