// ============================================================
// js/messages.js — Lógica de conversas e mensagens em tempo real
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// CONVERSAS
// ============================================================

// Busca todas as conversas do usuário logado
// Retorna as conversas com os dados do outro participante
export async function getConversations() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      user_a_profile:profiles!conversations_user_a_fkey(id, name, handle, avatar_url),
      user_b_profile:profiles!conversations_user_b_fkey(id, name, handle, avatar_url)
    `)
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`) // conversas onde participo
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Para cada conversa, determina quem é o "outro" usuário (não eu)
  return data.map(conv => ({
    ...conv,
    otherUser: conv.user_a === user.id ? conv.user_b_profile : conv.user_a_profile
  }));
}

// Inicia ou busca uma conversa existente com outro usuário
export async function getOrCreateConversation(otherUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  // Tenta achar conversa existente (em qualquer ordem)
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .or(
      `and(user_a.eq.${user.id},user_b.eq.${otherUserId}),` +
      `and(user_a.eq.${otherUserId},user_b.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) return existing;

  // Cria nova conversa se não existir
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_a: user.id, user_b: otherUserId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// MENSAGENS
// ============================================================

// Busca todas as mensagens de uma conversa
export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      sender:profiles(id, name, handle, avatar_url)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }); // do mais antigo pro mais novo

  if (error) throw error;
  return data;
}

// Envia uma mensagem em uma conversa
export async function sendMessage(conversationId, content) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content
    })
    .select(`
      *,
      sender:profiles(id, name, handle, avatar_url)
    `)
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// REALTIME — escuta novas mensagens de uma conversa
//
// Uso:
//   const unsubscribe = subscribeToMessages(convId, (msg) => {
//     renderMessage(msg);
//   });
//   unsubscribe(); // para de ouvir quando sair da conversa
// ============================================================
export function subscribeToMessages(conversationId, callback) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      async (payload) => {
        // Busca dados do remetente para exibir nome e avatar
        const { data: sender } = await supabase
          .from('profiles')
          .select('id, name, handle, avatar_url')
          .eq('id', payload.new.sender_id)
          .single();

        callback({ ...payload.new, sender });
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}