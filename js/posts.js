// ============================================================
// js/posts.js — Toda a lógica de posts (criar, buscar, curtir)
//
// Este arquivo "fala" com o banco de dados via Supabase.
// Ele não mexe no HTML — só retorna dados ou joga erro.
// Quem mexe no HTML é o arquivo da página (home.js, explore.js).
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// BUSCAR POSTS
// Retorna posts com os dados do autor já inclusos (JOIN automático)
// ============================================================

// Busca todos os posts, do mais recente pro mais antigo
export async function getPosts(limit = 20, offset = 0) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(id, name, handle, avatar_url)
    `)
    // O * pega tudo de posts
    // author:profiles(...) faz JOIN automático via foreign key author_id
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1); // paginação simples

  if (error) throw error;
  return data;
}

// Busca posts de um usuário específico pelo profile id
export async function getPostsByUser(userId, limit = 20) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(id, name, handle, avatar_url)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

// Busca posts que o usuário curtiu
export async function getLikedPosts(userId) {
  const { data, error } = await supabase
    .from('likes')
    .select(`
      post:posts(
        *,
        author:profiles(id, name, handle, avatar_url)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  // "data" vem como [{ post: {...} }, ...] — extraímos só o post
  return data.map(item => item.post);
}

// ============================================================
// CRIAR POST
// Insere um novo post no banco para o usuário logado
// ============================================================
export async function createPost(content) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Você precisa estar logado para postar.');

  const { data, error } = await supabase
    .from('posts')
    .insert({ content, author_id: user.id })
    .select(`
      *,
      author:profiles(id, name, handle, avatar_url)
    `)
    .single(); // retorna o post criado já com os dados do autor

  if (error) throw error;
  return data;
}

// ============================================================
// DELETAR POST
// Só funciona se for o próprio autor (o RLS do banco garante isso)
// ============================================================
export async function deletePost(postId) {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
}

// ============================================================
// CURTIDAS
// ============================================================

// Verifica se o usuário já curtiu um post específico
export async function hasLiked(postId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle(); // retorna null se não encontrar (sem jogar erro)

  return !!data; // true se curtiu, false se não
}

// Verifica quais posts da lista o usuário já curtiu (mais eficiente)
// Retorna um Set de post IDs: Set{ 'uuid1', 'uuid2', ... }
export async function getLikedPostIds(postIds) {
  const user = await getCurrentUser();
  if (!user || postIds.length === 0) return new Set();

  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds); // filtra só pelos posts da lista atual

  return new Set(data?.map(l => l.post_id) ?? []);
}

// Curte um post (insere na tabela likes)
export async function likePost(postId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Precisa estar logado para curtir.');

  // Incrementa o contador no post
  await supabase.rpc('increment_likes', { post_id: postId });

  const { error } = await supabase
    .from('likes')
    .insert({ post_id: postId, user_id: user.id });

  if (error) throw error;
}

export async function addReply(postId, content, isPrivate = false) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Precisa estar logado para comentar.');
 
  // Insere o comentário na tabela replies
  const { data, error } = await supabase
    .from('replies')
    .insert({
      post_id:    postId,
      author_id:  user.id,
      content,
      is_private: isPrivate,
    })
    .select(`
      *,
      author:profiles(id, name, handle, avatar_url)
    `)
    .single();
 
  if (error) throw error;
 
  // Incrementa o contador de replies no post
  await supabase.rpc('increment_replies', { post_id: postId });
 
  return data;
}
 
// Remove a curtida de um post
export async function unlikePost(postId) {
  const user = await getCurrentUser();
  if (!user) return;

  // Decrementa o contador
  await supabase.rpc('decrement_likes', { post_id: postId });

  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id);

  if (error) throw error;
}

// ============================================================
// REALTIME — escuta novos posts em tempo real
// Chame essa função passando um callback que recebe o novo post
//
// Uso:
//   const unsubscribe = subscribeToNewPosts((post) => {
//     renderPost(post); // adiciona no topo do feed
//   });
//   // Para parar de ouvir: unsubscribe();
// ============================================================
export function subscribeToNewPosts(callback) {
  const channel = supabase
    .channel('public:posts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts' },
      async (payload) => {
        // O payload tem o post novo, mas sem os dados do autor
        // Buscamos o profile do autor separadamente
        const { data: author } = await supabase
          .from('profiles')
          .select('id, name, handle, avatar_url')
          .eq('id', payload.new.author_id)
          .single();

        callback({ ...payload.new, author });
      }
    )
    .subscribe();

  // Retorna função para cancelar a subscription
  return () => supabase.removeChannel(channel);
}

// ============================================================
// BUSCA DE POSTS (para a página Explorar)
// ============================================================
export async function searchPosts(query) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(id, name, handle, avatar_url)
    `)
    .ilike('content', `%${query}%`) // ilike = case-insensitive LIKE
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data;
}