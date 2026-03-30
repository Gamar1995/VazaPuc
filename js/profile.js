// ============================================================
// js/profile.js — Lógica de perfis e follows
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

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

  // Atualiza contadores (idealmente isso seria um trigger no banco)
  await supabase.from('profiles').update({ following_count: supabase.rpc('increment') }).eq('id', user.id);
  await supabase.from('profiles').update({ followers_count: supabase.rpc('increment') }).eq('id', targetUserId);
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