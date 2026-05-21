// supabase-config.js
const SUPABASE_URL = "https://btzhlynqqgvczsyppusy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_onecc9vqvicjuA9htMJwBA_qKR3rcxL";

// Create supabase client
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Supabase connected successfully");