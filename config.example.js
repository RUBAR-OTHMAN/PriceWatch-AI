// PriceWatch AI local configuration template.
//
// Setup:
// 1. Copy this file to config.js.
// 2. Fill in values from Supabase Dashboard > Project Settings > API.
// 3. Keep config.js local. It is ignored by git and should not be committed.
//
// Required:
// - SUPABASE_URL: your project URL, for example https://your-project-ref.supabase.co
// - SUPABASE_ANON_KEY: your Supabase anon/public key
//
// Never put a Supabase service-role key in this extension.

(function (global) {
  global.SUPABASE_URL = 'https://your-project-ref.supabase.co';
  global.SUPABASE_ANON_KEY = 'your-anon-public-key';
})(typeof globalThis !== 'undefined' ? globalThis : window);
