// Fill these in from your Supabase project: Settings -> API -> Project URL
// / anon public key. See README.md ("Adding a structure by hand") for how
// to create the project and run supabase-schema.sql.
//
// The anon key is *meant* to be public (Supabase's model is: this key goes
// into client-side JS, and access is controlled by the table's Row Level
// Security policies, not by keeping the key secret). With the policies in
// supabase-schema.sql, that means: anyone who has this site's URL (and so
// can read this file) can also read and add structures. That matches an
// "anyone with the link" access model, not a login-gated one — see the
// README for what to do if you need real per-person access control later.
window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
