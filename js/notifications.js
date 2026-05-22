// ============================================================
// js/notifications.js — Sistema de Notificações do VazaPUC
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// TIPOS DE NOTIFICAÇÃO
// ============================================================
export const NOTIF_TYPES = {
  LIKE:           'like',
  REPLY:          'reply',
  FOLLOW:         'follow',
  MENTION:        'mention',
  PROFILE_VISIT:  'profile_visit',
  FOLLOW_REQUEST: 'follow_request',
  REPOST:         'repost',
  REPLY_LIKE:     'reply_like',     // ← NOVO: curtida num comentário
  COMMENT_REPLY:  'comment_reply',  // ← NOVO: resposta num comentário seu
};

// ============================================================
// CRIAR UMA NOTIFICAÇÃO NO BANCO
// Chamado sempre que alguém curte, comenta, etc.
// ============================================================
export async function createNotification({ toUserId, type, postId = null, actorId, replyId = null, replyContent = null }) {
  if (toUserId === actorId) return;

  const { error } = await supabase.from('notifications').insert({
    user_id:       toUserId,
    actor_id:      actorId,
    type,
    post_id:       postId,
    reply_id:      replyId,       // ← NOVO (coluna nova no banco)
    reply_content: replyContent,  // ← NOVO (coluna nova no banco)
    read:          false,
    created_at:    new Date().toISOString(),
  });

  if (error) console.error('[VazaPUC] Erro ao criar notificação:', error);
}

// ============================================================
// BUSCAR NOTIFICAÇÕES DO USUÁRIO LOGADO
// ============================================================
export async function getNotifications(limit = 30) {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      actor:profiles!actor_id (id, name, handle, avatar_url),
      post:posts (id, content)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[VazaPUC] Erro ao buscar notificações:', error);
    return [];
  }

  return data || [];
}

export async function deleteAllNotifications() {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('[VazaPUC] Erro ao apagar todas as notificações:', error);
  }
}

// ============================================================
// CONTAR NOTIFICAÇÕES NÃO LIDAS
// ============================================================
export async function getUnreadCount() {
  const user = await getCurrentUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);

  if (error) return 0;
  return count || 0;
}

// ============================================================
// MARCAR TODAS COMO LIDAS
// ============================================================
export async function markAllAsRead() {
  const user = await getCurrentUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
}

// ============================================================
// MARCAR UMA NOTIFICAÇÃO ESPECÍFICA COMO LIDA
// ============================================================
export async function markAsRead(notifId) {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId);
}

// ============================================================
// INSCREVER EM NOTIFICAÇÕES EM TEMPO REAL (Realtime)
// ============================================================
export function subscribeToNotifications(userId, callback) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        // Busca o dado completo (com join de actor e post)
        const { data } = await supabase
          .from('notifications')
          .select(`
            *,
            actor:profiles!actor_id (id, name, handle, avatar_url),
            post:posts (id, content)
          `)
          .eq('id', payload.new.id)
          .single();

        if (data) callback(data);
      }
    )
    .subscribe();

  // Retorna função para cancelar a inscrição quando necessário
  return () => supabase.removeChannel(channel);
}

// ============================================================
// HELPERS DE TEXTO E ÍCONE POR TIPO DE NOTIFICAÇÃO
// ============================================================
export function getNotifText(notif) {
  const actor = notif.actor?.name || 'Alguém';
  const preview = notif.post?.content
    ? `"${notif.post.content.slice(0, 40)}${notif.post.content.length > 40 ? '...' : ''}"`
    : '';
  const replyPreview = notif.reply_content
    ? `"${notif.reply_content.slice(0, 40)}${notif.reply_content.length > 40 ? '...' : ''}"`
    : '';

  switch (notif.type) {
    case NOTIF_TYPES.LIKE:
      return `${actor} curtiu seu post ${preview}`;
    case NOTIF_TYPES.REPLY:
      return `${actor} comentou no seu post ${preview}`;
    case NOTIF_TYPES.REPOST:
      return `${actor} repostou seu post ${preview}`;
    case NOTIF_TYPES.FOLLOW:
      return `${actor} começou a te seguir`;
    case NOTIF_TYPES.FOLLOW_REQUEST:
      return `${actor} quer te seguir`;
    case NOTIF_TYPES.MENTION:
      return `${actor} mencionou você ${preview}`;
    case NOTIF_TYPES.REPLY_LIKE:
      return `${actor} curtiu seu comentário ${replyPreview}`;
    case NOTIF_TYPES.COMMENT_REPLY:
      return `${actor} respondeu seu comentário ${replyPreview}`;
    case 'profile_visit':
      return `${actor} visitou seu perfil`;
    default:
      return `${actor} interagiu com você`;
  }
}
export function getNotifIcon(type) {
  switch (type) {
    case NOTIF_TYPES.LIKE:           return '❤️';
    case NOTIF_TYPES.REPLY:          return '💬';
    case NOTIF_TYPES.FOLLOW:         return '👤';
    case NOTIF_TYPES.MENTION:        return '📣';
    case NOTIF_TYPES.REPOST:         return '🔁';
    case NOTIF_TYPES.REPLY_LIKE:     return '❤️';   // ← NOVO
    case NOTIF_TYPES.COMMENT_REPLY:  return '↩️';   // ← NOVO
    case 'profile_visit':            return '👁️';
    case NOTIF_TYPES.FOLLOW_REQUEST: return '👥';
    default:                         return '🔔';
  }
}
export async function deleteNotification(notifId) {
  await supabase
    .from('notifications')
    .delete()
    .eq('id', notifId);
}
export function formatTimeAgoNotif(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)    return 'agora';
  if (min < 60)   return `${min}min`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

