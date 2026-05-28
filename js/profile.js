// ============================================================
// js/profile.js — VERSÃO CORRIGIDA com follow requests funcionais
// + Suporte a desativação de conta
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';
import { syncFollowCounts } from './seguindo.js';

// ============================================================
// BUSCAR PERFIS
// ============================================================
export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getProfileByHandle(handle) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle.replace('@', ''))
    .single();
  if (error) throw error;
  return data;
}

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
// ============================================================
export async function updateProfile({ name, handle, bio, avatar_url, banner_url }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { data, error } = await supabase
    .from('profiles')
    .update({
      name,
      handle,
      bio,
      avatar_url,
      banner_url
    })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// DESATIVAÇÃO DE CONTA
// Desativar = seta is_deactivated = true no perfil.
// Reativar  = ao fazer login, seta is_deactivated = false automaticamente.
// Para quem visita: se is_deactivated = true → aparece como "não encontrado".
// ============================================================

export async function deactivateAccount() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { error } = await supabase
    .from('profiles')
    .update({ is_deactivated: true })
    .eq('id', user.id);

  if (error) throw error;
}

export async function reactivateAccount() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { error } = await supabase
    .from('profiles')
    .update({ is_deactivated: false })
    .eq('id', user.id);

  if (error) throw error;
}

// ============================================================
// FOLLOWS
// ============================================================
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

export async function followUser(targetUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetUserId });

  if (error) throw error;
  await syncFollowCounts(user.id, targetUserId);
}

export async function unfollowUser(targetUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId);

  if (error) throw error;
  await syncFollowCounts(user.id, targetUserId);
}

export async function getFollowing(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('following:profiles!follows_following_id_fkey(*)')
    .eq('follower_id', userId);
  if (error) throw error;
  return data.map(f => f.following);
}

export async function getFollowers(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('follower:profiles!follows_follower_id_fkey(*)')
    .eq('following_id', userId);
  if (error) throw error;
  return data.map(f => f.follower);
}

// ============================================================
// PRIVACIDADE
// ============================================================
export async function isProfilePrivate(profileId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_private')
    .eq('id', profileId)
    .single();
  if (error) throw error;
  return data?.is_private ?? false;
}

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

export async function canViewProfile(profileId) {
  const user = await getCurrentUser();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_private, is_deactivated')
    .eq('id', profileId)
    .single();

  if (error) return true;

  // Conta desativada — ninguém vê, nem o próprio dono (já foi deslogado)
  if (profile.is_deactivated) return false;

  if (!profile.is_private) return true;
  if (!user) return false;
  if (user.id === profileId) return true;

  const { data: follow } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', profileId)
    .maybeSingle();

  return !!follow;
}

// ============================================================
// FOLLOW REQUESTS
// ============================================================

export async function requestFollow(toUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  await supabase
    .from('follow_requests')
    .delete()
    .eq('from_user', user.id)
    .eq('to_user', toUserId)
    .eq('status', 'rejected');

  const { data, error } = await supabase
    .from('follow_requests')
    .upsert(
      { from_user: user.id, to_user: toUserId, status: 'pending' },
      { onConflict: 'from_user,to_user' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

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

export async function acceptFollowRequest(fromUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase.rpc('accept_follow_request', {
    from_user_id: fromUserId
  });

  if (error) throw error;
  await syncFollowCounts(fromUserId, user.id);
}

export async function rejectFollowRequest(fromUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase
    .from('follow_requests')
    .delete()
    .eq('from_user', fromUserId)
    .eq('to_user', user.id);

  if (error) throw error;
}

export async function getPendingFollowRequests() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  const { data: requests, error } = await supabase
    .from('follow_requests')
    .select('id, from_user, to_user, status, created_at')
    .eq('to_user', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  const fromUserIds = [...new Set(requests.map(r => r.from_user))];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, handle, avatar_url')
    .in('id', fromUserIds);

  if (profilesError) throw profilesError;

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  return requests.map(req => ({
    ...req,
    requester: profileMap[req.from_user] || null,
  }));
}

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