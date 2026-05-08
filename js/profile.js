// ============================================================
// js/profile.js — Lógica de perfis e follows
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';
import { syncFollowCounts } from './seguindo.js';

// ============================================================
// BUSCAR PERFIS
// ============================================================

// Busca um perfil pelo ID
export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

// Busca um perfil pelo handle (ex: "joaosilva")
export async function getProfileByHandle(handle) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle.replace('@', '')) // remove @ se tiver
    .single();

  if (error) throw error;
  return data;
}

// Busca usuários por nome ou handle (para a busca da página Explorar)
export async function searchProfiles(query) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`name.ilike.%${query}%,handle.ilike.%${query}%`)
    .limit(10);

  if (error) throw error;
  return data;
}

// ============================================================
// EDITAR PERFIL
// Só funciona para o próprio usuário logado (RLS garante no banco)
// ============================================================
export async function updateProfile({ name, handle, bio, avatar_url }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ name, handle, bio, avatar_url })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// FOLLOWS
// ============================================================

// Verifica se o usuário logado segue outro usuário
export async function isFollowing(targetUserId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)
    .maybeSingle();

  return !!data;
}

// Segue um usuário
export async function followUser(targetUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetUserId });

  if (error) throw error;

  // Usa a função robusta para atualizar os contadores de ambos os perfis
  await syncFollowCounts(user.id, targetUserId);
}

// Deixa de seguir um usuário
export async function unfollowUser(targetUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId);

  if (error) throw error;

  // Atualiza os contadores de ambos os perfis
  await syncFollowCounts(user.id, targetUserId);
}

// Busca quem o usuário segue
export async function getFollowing(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('following:profiles!follows_following_id_fkey(*)')
    .eq('follower_id', userId);

  if (error) throw error;
  return data.map(f => f.following);
}

// Busca os seguidores de um usuário
export async function getFollowers(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('follower:profiles!follows_follower_id_fkey(*)')
    .eq('following_id', userId);

  if (error) throw error;
  return data.map(f => f.follower);
}
export async function isProfilePrivate(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_private')
    .eq('id', profileId)
    .single();
  if (error) throw error;
  return data?.is_private ?? false;
}
 
// ── Ativa/desativa conta privada ────────────────────────────
export async function setAccountPrivacy(isPrivate) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
 
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_private: isPrivate })
    .eq('id', user.id)
    .select()
    .single();
 
  if (error) throw error;
  return data;
}
 
// ── Verifica se visitante pode ver o perfil ──────────────────
// true = pode ver | false = bloqueado
export async function canViewProfile(profileId) {
  const user = await getCurrentUser();
 
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_private')
    .eq('id', profileId)
    .single();
 
  if (error) return true; // falha silenciosa = permite ver
 
  if (!profile.is_private) return true;        // conta pública
  if (!user) return false;                      // visitante anônimo
  if (user.id === profileId) return true;       // dono sempre vê
 
  // Verifica se já é seguidor aceito
  const { data: follow } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', profileId)
    .maybeSingle();
 
  return !!follow;
}
 
// ── Envia solicitação de seguimento ─────────────────────────
export async function requestFollow(toUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
 
  const { data, error } = await supabase
    .from('follow_requests')
    .upsert(
      { from_user: user.id, to_user: toUserId, status: 'pending' },
      { onConflict: 'from_user,to_user', ignoreDuplicates: false }
    )
    .select()
    .single();
 
  if (error) throw error;
  return data;
}
 
// ── Cancela solicitação pendente (pelo remetente) ────────────
export async function cancelFollowRequest(toUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
 
  const { error } = await supabase
    .from('follow_requests')
    .delete()
    .eq('from_user', user.id)
    .eq('to_user', toUserId);
 
  if (error) throw error;
}
 
// ── Aceita solicitação (pelo dono da conta privada) ──────────
export async function acceptFollowRequest(fromUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
 
  // 1. Marca como aceita
  const { error: updateError } = await supabase
    .from('follow_requests')
    .update({ status: 'accepted' })
    .eq('from_user', fromUserId)
    .eq('to_user', user.id);
 
  if (updateError) throw updateError;
 
  // 2. Cria o follow real
  const { error: followError } = await supabase
    .from('follows')
    .upsert(
      { follower_id: fromUserId, following_id: user.id },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
    );
 
  if (followError) throw followError;
 
  // 3. Sincroniza contadores dos dois perfis
  await syncFollowCounts(fromUserId, user.id);
}
 
// ── Rejeita solicitação ──────────────────────────────────────
export async function rejectFollowRequest(fromUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
 
  const { error } = await supabase
    .from('follow_requests')
    .update({ status: 'rejected' })
    .eq('from_user', fromUserId)
    .eq('to_user', user.id);
 
  if (error) throw error;
}
 
// ── Solicitações pendentes recebidas ────────────────────────
export async function getPendingFollowRequests() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
 
  const { data, error } = await supabase
    .from('follow_requests')
    .select(`
      id,
      from_user,
      created_at,
      requester:from_user (
        id, name, handle, avatar_url
      )
    `)
    .eq('to_user', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
 
  if (error) throw error;
  return data ?? [];
}
 
// ── Contagem de pendentes (para badge) ───────────────────────
export async function getPendingRequestsCount() {
  const user = await getCurrentUser();
  if (!user) return 0;
 
  const { count, error } = await supabase
    .from('follow_requests')
    .select('*', { count: 'exact', head: true })
    .eq('to_user', user.id)
    .eq('status', 'pending');
 
  if (error) return 0;
  return count ?? 0;
}
 
// ── Status da solicitação enviada pelo usuário logado ────────
// Retorna: 'none' | 'pending' | 'accepted' | 'rejected'
export async function getFollowRequestStatus(toUserId) {
  const user = await getCurrentUser();
  if (!user) return 'none';
 
  const { data, error } = await supabase
    .from('follow_requests')
    .select('status')
    .eq('from_user', user.id)
    .eq('to_user', toUserId)
    .maybeSingle();
 
  if (error || !data) return 'none';
  return data.status;
}
 