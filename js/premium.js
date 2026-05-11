// ============================================================
// js/premium.js — Sistema Premium + Visitantes do VazaPUC
// VERSÃO CORRIGIDA: visitantes salvos no Supabase com notificação
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
 * - Se o visitante for premium → modo ghost (não aparece)
 * - Usa upsert para não duplicar visitas do mesmo par no mesmo dia
 */
export async function recordProfileVisit(profileId) {
  try {
    const user = await getCurrentUser();
    if (!user) return; // visitante anônimo não registra
    if (user.id === profileId) return; // não registra visita ao próprio perfil

    // Modo ghost: premium não aparece como visitante
    if (isPremium()) return;

    // Upsert: atualiza o visited_at se já visitou hoje
    const today = new Date().toISOString().split('T')[0]; // "2025-01-15"

    const { error } = await supabase
      .from('profile_visits')
      .upsert(
        {
          profile_id: profileId,   // dono do perfil visitado
          visitor_id: user.id,     // quem visitou
          visited_at: new Date().toISOString(),
          visit_date: today,       // para deduplicação diária
        },
        {
          onConflict: 'profile_id,visitor_id,visit_date', // evita duplicatas no mesmo dia
          ignoreDuplicates: false,
        }
      );

    if (error) {
      // Fallback: tenta insert simples se a constraint não existir
      if (error.code === '42P10' || error.message?.includes('conflict')) {
        await supabase
          .from('profile_visits')
          .insert({
            profile_id: profileId,
            visitor_id: user.id,
            visited_at: new Date().toISOString(),
          })
          .throwOnError();
      } else if (error.code !== '23505') {
        // 23505 = unique violation (duplicata), ignora silenciosamente
        console.warn('[VazaPUC] Erro ao registrar visita:', error.message);
      }
    }
  } catch (err) {
    console.warn('[VazaPUC] recordProfileVisit falhou silenciosamente:', err?.message);
  }
}

/**
 * Busca os visitantes recentes do perfil.
 * Retorna array de perfis (com is_premium), ordenados pela visita mais recente.
 * @param {string} profileId - ID do dono do perfil
 * @param {number} limit - quantos visitantes retornar
 */
export async function getProfileVisitors(profileId, limit = 12) {
  try {
    // Busca as visitas mais recentes (uma por visitante)
    const { data: visits, error } = await supabase
      .from('profile_visits')
      .select('visitor_id, visited_at')
      .eq('profile_id', profileId)
      .order('visited_at', { ascending: false })
      .limit(limit * 3); // pega mais para deduplicar

    if (error) {
      console.warn('[VazaPUC] Erro ao buscar visitas:', error.message);
      return [];
    }

    if (!visits || visits.length === 0) return [];

    // Deduplica: pega apenas a visita mais recente de cada visitante
    const uniqueVisitors = [];
    const seen = new Set();
    for (const v of visits) {
      if (!seen.has(v.visitor_id)) {
        seen.add(v.visitor_id);
        uniqueVisitors.push(v.visitor_id);
      }
      if (uniqueVisitors.length >= limit) break;
    }

    if (uniqueVisitors.length === 0) return [];

    // Busca os perfis dos visitantes
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar_url, is_premium')
      .in('id', uniqueVisitors);

    if (profilesError) {
      console.warn('[VazaPUC] Erro ao buscar perfis de visitantes:', profilesError.message);
      return [];
    }

    // Ordena na mesma ordem das visitas (mais recente primeiro)
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    return uniqueVisitors
      .map(id => profileMap[id])
      .filter(Boolean);

  } catch (err) {
    console.warn('[VazaPUC] getProfileVisitors falhou:', err?.message);
    return [];
  }
}