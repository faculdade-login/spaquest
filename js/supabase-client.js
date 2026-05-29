/**
 * Cliente Supabase — S.P.A. Quest
 */
(function () {
  const cfg = window.SPAQUEST_CONFIG;
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_KEY) {
    console.error('[S.P.A. Quest] SPAQUEST_CONFIG ausente. Copie js/config.example.js para js/config.js');
    return;
  }
  if (cfg.SUPABASE_URL.includes('SEU_PROJETO')) {
    console.error('[S.P.A. Quest] Configure SUPABASE_URL em js/config.js');
    return;
  }
  if (!window.supabase?.createClient) {
    console.error('[S.P.A. Quest] SDK @supabase/supabase-js não carregado');
    return;
  }
  window.spaSupabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
})();
