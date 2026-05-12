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
export async function recordProfileVisit(profileId) {
  try {
    const user = await getCurrentUser();

    // Sem login, nada a fazer
    if (!user) return;

    // Não registra visita ao próprio perfil
    if (user.id === profileId) return;

    // Modo ghost: premium visita sem aparecer
    const ghostMode = localStorage.getItem('vazaPucPremium') === 'true';
    if (ghostMode) return;

    const today = new Date().toISOString().split('T')[0]; // "2025-05-12"

    // Tenta upsert (atualiza visited_at se já visitou hoje)
    const { error: upsertError } = await supabase
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

    if (upsertError) {
      // Se a constraint não existe ainda (tabela antiga sem visit_date),
      // tenta insert simples — a unique(profile_id, visitor_id) evita duplicatas
      if (
        upsertError.code === '42P10' ||        // invalid_column_reference
        upsertError.code === '42703' ||        // undefined_column (visit_date ausente)
        upsertError.message?.includes('visit_date')
      ) {
        const { error: insertError } = await supabase
          .from('profile_visits')
          .insert({
            profile_id: profileId,
            visitor_id: user.id,
            visited_at: new Date().toISOString(),
          });

        // 23505 = unique violation (já existe) — ignora
        if (insertError && insertError.code !== '23505') {
          console.warn('[visita_perfil] insert fallback falhou:', insertError.message);
        }
      } else if (upsertError.code !== '23505') {
        console.warn('[visita_perfil] upsert falhou:', upsertError.message);
      }
    }
  } catch (err) {
    // Nunca deixa a visita quebrar a navegação
    console.warn('[visita_perfil] recordProfileVisit erro silencioso:', err?.message);
  }
}

// ============================================================
// BUSCAR VISITANTES
// Retorna array de perfis, mais recente primeiro.
// Qualquer usuário logado pode chamar — mostra visitantes do
// próprio perfil (RLS garante que só o dono vê).
// ============================================================
export async function getProfileVisitors(profileId, limit = 12) {
  try {
    // Busca visitas — pega o triplo para poder deduplicar por visitante
    const { data: visits, error: visitsError } = await supabase
      .from('profile_visits')
      .select('visitor_id, visited_at')
      .eq('profile_id', profileId)
      .order('visited_at', { ascending: false })
      .limit(limit * 3);

    if (visitsError) {
      console.warn('[visita_perfil] getProfileVisitors erro:', visitsError.message);
      return [];
    }

    if (!visits || visits.length === 0) return [];

    // Deduplica: guarda apenas a entrada mais recente de cada visitante
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

    // Busca os perfis dos visitantes
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar_url, is_premium')
      .in('id', uniqueIds);

    if (profilesError) {
      console.warn('[visita_perfil] erro ao buscar perfis:', profilesError.message);
      return [];
    }

    // Preserva a ordem (mais recente primeiro)
    const map = {};
    (profiles || []).forEach(p => { map[p.id] = p; });

    return uniqueIds.map(id => map[id]).filter(Boolean);

  } catch (err) {
    console.warn('[visita_perfil] getProfileVisitors erro silencioso:', err?.message);
    return [];
  }
}