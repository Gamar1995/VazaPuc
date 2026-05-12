// ============================================================
// js/visita_perfil.js — Sistema de Visitas ao Perfil (VazaPUC)
// Arquivo dedicado: registra e lê visitas de forma robusta.
// Substitui as funções recordProfileVisit e getProfileVisitors
// que estavam no premium.js.
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// REGISTRAR VISITA
// Chame ao abrir o perfil de QUALQUER outro usuário.
// - Usuário não logado → não registra
// - Visita ao próprio perfil → não registra
// - Usuário premium → modo ghost, não aparece
// ============================================================
export async function recordProfileVisit(supabase, getCurrentUser, profileId) {
  try {
    const user = await getCurrentUser();
 
    if (!user) return;
    if (user.id === profileId) return;
 
    // Modo ghost: premium não aparece
    if (localStorage.getItem('vazaPucPremium') === 'true') return;
 
    const today = new Date().toISOString().split('T')[0]; // "2025-05-12"
 
    const { error } = await supabase
      .from('profile_visits')
      .upsert(
        {
          profile_id: profileId,
          visitor_id: user.id,
          visited_at: new Date().toISOString(),
          visit_date: today,
        },
        { onConflict: 'profile_id,visitor_id,visit_date' }
      );
 
    if (error) {
      // Fallback: tabela sem coluna visit_date (schema antigo)
      if (error.code === '42703' || error.message?.includes('visit_date')) {
        const { error: e2 } = await supabase
          .from('profile_visits')
          .insert({
            profile_id: profileId,
            visitor_id: user.id,
            visited_at: new Date().toISOString(),
          });
        if (e2 && e2.code !== '23505') {
          console.warn('[visita] insert fallback falhou:', e2.message);
        }
      } else if (error.code !== '23505') {
        console.warn('[visita] upsert falhou:', error.code, error.message);
      }
    }
  } catch (err) {
    console.warn('[visita] erro silencioso:', err?.message);
  }
}
 
// ============================================================
// BUSCAR VISITANTES
// ============================================================
export async function getProfileVisitors(supabase, profileId, limit = 12) {
  try {
    const { data: visits, error } = await supabase
      .from('profile_visits')
      .select('visitor_id, visited_at')
      .eq('profile_id', profileId)
      .order('visited_at', { ascending: false })
      .limit(limit * 3);
 
    if (error) {
      console.warn('[visita] getProfileVisitors erro:', error.message);
      return [];
    }
 
    if (!visits || visits.length === 0) return [];
 
    // Deduplica: só a visita mais recente de cada pessoa
    const uniqueIds = [];
    const seen = new Set();
    for (const v of visits) {
      if (!seen.has(v.visitor_id)) {
        seen.add(v.visitor_id);
        uniqueIds.push(v.visitor_id);
      }
      if (uniqueIds.length >= limit) break;
    }
 
    if (uniqueIds.length === 0) return [];
 
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar_url, is_premium')
      .in('id', uniqueIds);
 
    if (pErr) {
      console.warn('[visita] erro ao buscar perfis:', pErr.message);
      return [];
    }
 
    const map = {};
    (profiles || []).forEach(p => { map[p.id] = p; });
 
    return uniqueIds.map(id => map[id]).filter(Boolean);
 
  } catch (err) {
    console.warn('[visita] getProfileVisitors erro silencioso:', err?.message);
    return [];
  }
}