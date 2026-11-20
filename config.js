// Wildbound runtime config. These values are safe to publish: the Supabase anon key is a public client key,
// and access is enforced by the Row Level Security policies in supabase/schema.sql.
// You can also paste them in the app (Me → Settings → Backend) without redeploying.
window.WILDBOUND_CONFIG = {
  supabaseUrl: 'https://rrfmtaueligyhzziynom.supabase.co',
  supabaseAnonKey: 'sb_publishable_hvTxOwwJ4iTM_Nkc2kzxgg_DSDMGafi', // publishable (public) key
};
