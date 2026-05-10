// ============================================================
// js/premium.js — Sistema Premium VazaPUC (modo teste/demo)
// ============================================================
//
// Funcionalidades:
//  1. Ativar/desativar premium (localStorage, sem pagamento real)
//  2. Registrar visitas a perfis (Supabase: tabela profile_visits)
//  3. Retornar visitantes do perfil do usuário
//  4. Checar se usuário é premium (modo ghost — não aparece em visitas)
//  5. Tag de verificado premium no card de perfil
//
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ─────────────────────────────────────────────────────────────
// CHAVE DE ARMAZENAMENTO LOCAL
// ─────────────────────────────────────────────────────────────
const PREMIUM_KEY   = 'vazaPuc_isPremium';
const PREMIUM_SINCE = 'vazaPuc_premiumSince';

// ─────────────────────────────────────────────────────────────
// VERIFICAR SE O USUÁRIO ATUAL TEM PREMIUM
// ─────────────────────────────────────────────────────────────
export function isPremium() {
  return localStorage.getItem(PREMIUM_KEY) === 'true';
}

// ─────────────────────────────────────────────────────────────
// ATIVAR PREMIUM (modo demo — sem pagamento)
// ─────────────────────────────────────────────────────────────
export function activatePremium() {
  localStorage.setItem(PREMIUM_KEY, 'true');
  localStorage.setItem(PREMIUM_SINCE, new Date().toISOString());

  // Sincroniza na tabela profiles (coluna is_premium)
  _syncPremiumToSupabase(true);
  return true;
}

export function deactivatePremium() {
  localStorage.removeItem(PREMIUM_KEY);
  localStorage.removeItem(PREMIUM_SINCE);
  _syncPremiumToSupabase(false);
}

async function _syncPremiumToSupabase(value) {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ is_premium: value })
      .eq('id', user.id);
  } catch (_) { /* silencioso — coluna pode não existir ainda */ }
}

// ─────────────────────────────────────────────────────────────
// REGISTRAR VISITA AO PERFIL
// Só registra se o visitante NÃO for premium (modo ghost)
// Não registra visita no próprio perfil
// ─────────────────────────────────────────────────────────────
export async function recordProfileVisit(profileOwnerId) {
  try {
    const user = await getCurrentUser();
    if (!user) return;                          // visitante anônimo — não registra
    if (user.id === profileOwnerId) return;     // visita própria — ignora
    if (isPremium()) return;                    // modo ghost — não aparece

    await supabase
      .from('profile_visits')
      .upsert(
        { visitor_id: user.id, profile_id: profileOwnerId, visited_at: new Date().toISOString() },
        { onConflict: 'visitor_id,profile_id' }  // atualiza se já visitou
      );
  } catch (_) { /* silencioso */ }
}

// ─────────────────────────────────────────────────────────────
// BUSCAR VISITANTES DO MEU PERFIL (últimos 20)
// ─────────────────────────────────────────────────────────────
export async function getProfileVisitors(profileOwnerId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('profile_visits')
      .select(`
        visited_at,
        visitor:profiles!profile_visits_visitor_id_fkey(
          id, name, handle, avatar_url, is_premium
        )
      `)
      .eq('profile_id', profileOwnerId)
      .order('visited_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(v => ({ ...v.visitor, visited_at: v.visited_at }));
  } catch (_) {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// GERA O BADGE HTML DE PREMIUM (para usar inline)
// ─────────────────────────────────────────────────────────────
export function premiumBadgeHTML(style = '') {
  return `<span class="premium-badge-tag" style="${style}" title="Usuário Premium VazaPUC">
    ✦ Premium
  </span>`;
}

// ─────────────────────────────────────────────────────────────
// VERIFICA SE UM PERFIL (objeto) É PREMIUM
// ─────────────────────────────────────────────────────────────
export function profileIsPremium(profile) {
  if (!profile) return false;
  // Tenta pelo campo do banco, senão pelo localStorage (conta própria)
  if (profile.is_premium === true) return true;
  // Checa localStorage apenas para o próprio usuário logado
  return false;
}