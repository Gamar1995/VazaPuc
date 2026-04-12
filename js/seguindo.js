// ============================================================
// js/seguindo.js — Feed "Seguindo" + sincronização de contadores
// ============================================================

import { supabase } from './supabase.js';

// ============================================================
// SEGUIR / DEIXAR DE SEGUIR com contadores sincronizados
// ============================================================

/**
 * Segue um usuário e recalcula os contadores dos dois perfis.
 */
export async function followUserAndSync(followerId, followingId) {
  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: followerId, following_id: followingId },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
    );

  if (error) throw error;
  await syncFollowCounts(followerId, followingId);
}

/**
 * Deixa de seguir um usuário e recalcula os contadores dos dois perfis.
 */
export async function unfollowUserAndSync(followerId, followingId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) throw error;
  await syncFollowCounts(followerId, followingId);
}

/**
 * Recalcula e persiste following_count e followers_count para os dois
 * perfis envolvidos numa operação de follow/unfollow.
 * Conta direto na tabela follows — nunca depende de valores desatualizados.
 */
export async function syncFollowCounts(followerId, followingId) {
  try {
    const [
      { count: followerFollowingCount },
      { count: followingFollowersCount },
    ] = await Promise.all([
      // Quantas pessoas o followerId segue agora
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', followerId),
      // Quantos seguidores o followingId tem agora
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', followingId),
    ]);

    await Promise.all([
      supabase
        .from('profiles')
        .update({ following_count: followerFollowingCount ?? 0 })
        .eq('id', followerId),
      supabase
        .from('profiles')
        .update({ followers_count: followingFollowersCount ?? 0 })
        .eq('id', followingId),
    ]);
  } catch (err) {
    console.warn('[seguindo] syncFollowCounts falhou:', err);
  }
}

/**
 * Recalcula e retorna os contadores de um único perfil.
 * Chame ao abrir qualquer página de perfil para garantir dados corretos.
 */
export async function syncProfileCounts(profileId) {
  try {
    const [
      { count: followingCount },
      { count: followersCount },
    ] = await Promise.all([
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileId),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileId),
    ]);

    const counts = {
      following_count: followingCount ?? 0,
      followers_count: followersCount ?? 0,
    };

    await supabase
      .from('profiles')
      .update(counts)
      .eq('id', profileId);

    return counts;
  } catch (err) {
    console.warn('[seguindo] syncProfileCounts falhou:', err);
    return null;
  }
}

// ============================================================
// FEED DE SEGUINDO
// ============================================================

/**
 * Retorna os IDs de todos os usuários que userId segue.
 */
export async function getFollowingIds(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (error) throw error;
  return (data ?? []).map(row => row.following_id);
}

/**
 * Retorna os posts mais recentes de quem userId segue.
 * Faz duas queries separadas (posts + autores) para evitar
 * depender do nome exato da FK no Supabase.
 */
export async function getFollowingFeed(userId, limit = 20) {
  const followingIds = await getFollowingIds(userId);
  if (followingIds.length === 0) return [];

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, content, created_at, likes_count, replies_count, author_id')
    .in('author_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (postsError) throw postsError;
  if (!posts?.length) return [];

  // Busca autores em query separada — sem depender de nome de FK
  const authorIds = [...new Set(posts.map(p => p.author_id))];
  const { data: authors, error: authorsError } = await supabase
    .from('profiles')
    .select('id, name, handle, avatar_url')
    .in('id', authorIds);

  if (authorsError) throw authorsError;

  const authorMap = Object.fromEntries(
    (authors ?? []).map(a => [a.id, a])
  );

  // Retorna no mesmo formato que getPosts() do posts.js
  return posts.map(post => ({
    ...post,
    reposts_count: 0,
    is_private: false,
    is_archived: false,
    author: authorMap[post.author_id] ?? null,
  }));
}

/**
 * Realtime: escuta novos posts de quem userId segue.
 * @returns {function} unsubscribe — chame para cancelar a inscrição
 */
export function subscribeToFollowingFeed(followingIds, callback) {
  if (!followingIds?.length) return () => {};

  const channelName = 'following-feed-' + Date.now();

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts' },
      async (payload) => {
        const post = payload.new;
        if (!followingIds.includes(post.author_id)) return;

        const { data: author } = await supabase
          .from('profiles')
          .select('id, name, handle, avatar_url')
          .eq('id', post.author_id)
          .single();

        callback({ ...post, author: author ?? null });
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}