// ============================================================
// js/posts.js — versão corrigida completa
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

export async function getPosts(limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:profiles(id, name, handle, avatar_url)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

export async function getPostsByUser(userId, limit = 20) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:profiles(id, name, handle, avatar_url)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getLikedPosts(userId) {
  const { data, error } = await supabase
    .from('likes')
    .select('post:posts(*, author:profiles(id, name, handle, avatar_url))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data.map(item => item.post).filter(Boolean);
}

export async function createPost(content) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Você precisa estar logado para postar.');

  const { data, error } = await supabase
    .from('posts')
    .insert({ content, author_id: user.id })
    .select('*, author:profiles(id, name, handle, avatar_url)')
    .single();

  if (error) throw error;
  return data;
}

export async function deletePost(postId) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function hasLiked(postId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  return !!data;
}

export async function getLikedPostIds(postIds) {
  const user = await getCurrentUser();
  if (!user || postIds.length === 0) return new Set();

  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);

  return new Set(data?.map(l => l.post_id) ?? []);
}

// FIX: protege contra likes negativos com GREATEST
export async function likePost(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Precisa estar logado para curtir.');

  // Insere o like primeiro — se já existir, vai dar erro de unique constraint
  const { error: likeError } = await supabase
    .from('likes')
    .insert({ post_id: postId, user_id: user.id });

  if (likeError) throw likeError;

  // Incrementa o contador
  await supabase.rpc('increment_likes', { post_id: postId });
}

export async function unlikePost(postId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id);

  if (error) throw error;

  // Decrementa protegido contra negativo
  await supabase.rpc('decrement_likes', { post_id: postId });
}

// FIX: função getReplies para carregar comentários existentes
export async function getReplies(postId, currentUserId = null) {
  const { data, error } = await supabase
    .from('replies')
    .select('*, author:profiles(id, name, handle, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Filtra replies privadas: só mostra se for o autor da reply
  // ou se for o dono do post (o backend/RLS já faz isso, mas filtramos no cliente também)
  return (data || []).filter(r => {
    if (!r.is_private) return true;
    if (!currentUserId) return false;
    return r.author_id === currentUserId;
  });
}

export async function addReply(postId, content, isPrivate = false) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Precisa estar logado para comentar.');

  const { data, error } = await supabase
    .from('replies')
    .insert({
      post_id: postId,
      author_id: user.id,
      content,
      is_private: isPrivate,
    })
    .select('*, author:profiles(id, name, handle, avatar_url)')
    .single();

  if (error) throw error;

  await supabase.rpc('increment_replies', { post_id: postId });

  return data;
}

export function subscribeToNewPosts(callback) {
  const channel = supabase
    .channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },
      async (payload) => {
        const { data: author } = await supabase
          .from('profiles')
          .select('id, name, handle, avatar_url')
          .eq('id', payload.new.author_id)
          .single();

        callback({ ...payload.new, author });
      })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export async function searchPosts(query) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:profiles(id, name, handle, avatar_url)')
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data;
}
// ============================================================
// AÇÕES DO POST (EDITAR, APAGAR, ARQUIVAR, PRIVACIDADE)
// ============================================================

export async function updatePost(postId, newContent) {
  const { data, error } = await supabase.from('posts').update({ content: newContent }).eq('id', postId).select().single();
  if (error) throw error;
  return data;
}

export async function setPostPrivacy(postId, isPrivate) {
  const { error } = await supabase.from('posts').update({ is_private: isPrivate }).eq('id', postId);
  if (error) throw error;
}

export async function setPostArchive(postId, isArchived) {
  const { error } = await supabase.from('posts').update({ is_archived: isArchived }).eq('id', postId);
  if (error) throw error;
}