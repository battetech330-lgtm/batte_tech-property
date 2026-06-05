// supabase-config.js - OPTIMIZED
const SUPABASE_URL = "https://xslmocsepdepqxmkzhbf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbG1vY3NlcGRlcHF4bWt6aGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDM0NjIsImV4cCI6MjA5NDc3OTQ2Mn0.8yAO3zvS7pcPi4Emcq7limyCTaFJnaswlwUKn7PJsa4";

// Create client with optimized settings
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
    },
    global: {
        fetch: fetch,
        headers: {
            'X-Client-Info': 'battetech-webapp'
        }
    },
    db: {
        schema: 'public'
    }
});

console.log("Supabase client initialized (optimized)");
