// ============================================================
// js/messages.js — CORRIGIDO: realtime, ordenação, deduplicação
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// CONVERSAS
// ============================================================

export async function getConversations() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      user_a_profile:profiles!conversations_user_a_fkey(id, name, handle, avatar_url),
      user_b_profile:profiles!conversations_user_b_fkey(id, name, handle, avatar_url),
      messages(content, created_at, sender_id)
    `)
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

  if (error) throw error;

  return data
    .map(conv => {
      // Última mensagem (a mais recente)
      const msgs = conv.messages || [];
      const lastMsg = msgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;

      return {
        ...conv,
        otherUser: conv.user_a === user.id ? conv.user_b_profile : conv.user_a_profile,
        lastMessage: lastMsg,
        lastMessageAt: lastMsg?.created_at ?? conv.created_at,
      };
    })
    // Ordena: conversa com mensagem mais recente primeiro
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

export async function getOrCreateConversation(otherUserId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado.');

  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .or(
      `and(user_a.eq.${user.id},user_b.eq.${otherUserId}),` +
      `and(user_a.eq.${otherUserId},user_b.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) return existing;

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

export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      sender:profiles(id, name, handle, avatar_url)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

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
// REALTIME — escuta novas mensagens com deduplicação
// ============================================================
export function subscribeToMessages(conversationId, callback) {
  const channel = supabase
    .channel(`messages-conv-${conversationId}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        // Entrega imediatamente, sem fetch extra
        // O home.js sabe quem é o currentProfile e filtra pelo sender_id
        callback(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[messages] Realtime conectado para conversa', conversationId);
      }
    });
 
  return () => {
    supabase.removeChannel(channel);
  };
}