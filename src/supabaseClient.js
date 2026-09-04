import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If the keys aren't set (e.g. running locally without a .env file),
// `supabase` is null and the app falls back to not persisting —
// it still works, it just won't save between visits.
export const supabase = url && key ? createClient(url, key) : null;
