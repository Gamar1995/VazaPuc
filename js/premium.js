// ============================================================
// js/premium.js — Sistema Premium + Visitantes do VazaPUC
// VERSÃO CORRIGIDA: visitantes salvos no Supabase
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// PREMIUM — controle local (localStorage)
// ============================================================
export function isPremium() {
  return localStorage.getItem('vazaPucPremium') === 'true';
}

export function activatePremium() {
  localStorage.setItem('vazaPucPremium', 'true');
}

export function deactivatePremium() {
  localStorage.removeItem('vazaPucPremium');
}

// Verifica se um perfil (outro usuário) é premium pelo campo do banco
export function profileIsPremium(profile) {
  return profile?.is_premium === true;
}

// ============================================================
// VISITANTES — salva e lê do Supabase (tabela profile_visits)
// ============================================================

/**
 * Registra uma visita ao perfil de outro usuário.
 * - Visitante anônimo (não logado) não é registrado
 * - Não registra visita ao próprio perfil
 * - Se o visitante for premium → modo ghost (não aparece)
 * - Upsert por (profile_id, visitor_id, visit_date) para não duplicar no mesmo dia
 */
export async function recordProfileVisit(profileId) {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    if (user.id === profileId) return;

    // Modo ghost: usuário premium visita sem aparecer
    if (isPremium()) return;

    const today = new Date().toISOString().split('T')[0]; // ex: "2025-05-12"

    const { error } = await supabase
      .from('profile_visits')
      .upsert(
        {
          profile_id: profileId,
          visitor_id: user.id,
          visited_at: new Date().toISOString(),
          visit_date: today,
        },
        {
          onConflict: 'profile_id,visitor_id,visit_date',
          ignoreDuplicates: false,
        }
      );

    if (error && error.code !== '23505') {
      console.warn('[VazaPUC] Erro ao registrar visita:', error.message);
    }
  } catch (err) {
    console.warn('[VazaPUC] recordProfileVisit falhou silenciosamente:', err?.message);
  }
}

/**
 * Busca os visitantes recentes do perfil.
 * Retorna array de perfis (com is_premium), ordenados pela visita mais recente.
 * @param {string} profileId - ID do dono do perfil
 * @param {number} limit - quantos visitantes retornar (padrão 12)
 */
export async function getProfileVisitors(profileId, limit = 12) {
  try {
    // Busca as visitas mais recentes
    const { data: visits, error } = await supabase
      .from('profile_visits')
      .select('visitor_id, visited_at')
      .eq('profile_id', profileId)
      .order('visited_at', { ascending: false })
      .limit(limit * 3); // pega mais para poder deduplicar

    if (error) {
      console.warn('[VazaPUC] Erro ao buscar visitas:', error.message);
      return [];
    }

    if (!visits || visits.length === 0) return [];

    // Deduplica: mantém apenas a visita mais recente de cada visitante
    const uniqueVisitorIds = [];
    const seen = new Set();
    for (const v of visits) {
      if (!seen.has(v.visitor_id)) {
        seen.add(v.visitor_id);
        uniqueVisitorIds.push(v.visitor_id);
      }
      if (uniqueVisitorIds.length >= limit) break;
    }

    if (uniqueVisitorIds.length === 0) return [];

    // Busca os perfis dos visitantes
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar_url, is_premium')
      .in('id', uniqueVisitorIds);

    if (profilesError) {
      console.warn('[VazaPUC] Erro ao buscar perfis de visitantes:', profilesError.message);
      return [];
    }

    // Ordena na mesma ordem das visitas (mais recente primeiro)
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    return uniqueVisitorIds
      .map(id => profileMap[id])
      .filter(Boolean);

  } catch (err) {
    console.warn('[VazaPUC] getProfileVisitors falhou:', err?.message);
    return [];
  }
}