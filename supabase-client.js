// Replace the two values below with the ones from Supabase:
// Dashboard → Project Settings → API → "Project URL" and "anon public" key.
// Use ONLY the anon/public key here, never the service_role key.
const SUPABASE_URL = 'https://mkebrsklmdtbxyxzqivy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bG471vUPPevDoEGQva-1Uw_ieOWh8co';

// The CDN script creates window.supabase (the library). We replace it with the
// ready client so pages can use supabase.auth directly, and without the
// "Identifier 'supabase' has already been declared" error.
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
