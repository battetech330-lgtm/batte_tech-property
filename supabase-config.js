// supabase-config.js
const SUPABASE_URL = "https://xslmocsepdepqxmkzhbf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbG1vY3NlcGRlcHF4bWt6aGJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDM0NjIsImV4cCI6MjA5NDc3OTQ2Mn0.8yAO3zvS7pcPi4Emcq7limyCTaFJnaswlwUKn7PJsa4";

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase client initialized");