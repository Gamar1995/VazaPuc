  // ============================================================
  // js/profile.js — VERSÃO CORRIGIDA com follow requests funcionais
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
 // Substitua a sua função updateProfile no js/profile.js por esta:
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
      banner_url // Adicionámos o banner aqui
    })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
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
      .select('is_private')
      .eq('id', profileId)
      .single();

    if (error) return true;
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
  // FOLLOW REQUESTS — CORRIGIDO
  // ============================================================

  // ── Envia solicitação de seguimento ─────────────────────────
  export async function requestFollow(toUserId) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Não autenticado');

    // Primeiro tenta deletar qualquer rejected anterior para limpar
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

  // ── Cancela solicitação pendente ─────────────────────────────
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

  // ── Aceita solicitação ────────────────────────────────────────
  export async function acceptFollowRequest(fromUserId) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Não autenticado');

    const { error } = await supabase.rpc('accept_follow_request', {
      from_user_id: fromUserId
    });

    if (error) throw error;

    // Sincroniza contadores
    await syncFollowCounts(fromUserId, user.id);
  }
  // ── Rejeita solicitação ───────────────────────────────────────
  export async function rejectFollowRequest(fromUserId) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Não autenticado');

    // Deleta a solicitação ao invés de apenas marcar como rejected
    // (evita problemas de RLS e upsert futuro)
    const { error } = await supabase
      .from('follow_requests')
      .delete()
      .eq('from_user', fromUserId)
      .eq('to_user', user.id);

    if (error) throw error;
  }

  // ── Solicitações pendentes recebidas ─────────────────────────
  // CORRIGIDO: busca o perfil do solicitante em query separada
  // para evitar problema com nome da FK no Supabase
  export async function getPendingFollowRequests() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Não autenticado');

    // 1. Busca as solicitações pendentes
    const { data: requests, error } = await supabase
      .from('follow_requests')
      .select('id, from_user, to_user, status, created_at')
      .eq('to_user', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!requests || requests.length === 0) return [];

    // 2. Busca os perfis dos solicitantes em batch
    const fromUserIds = [...new Set(requests.map(r => r.from_user))];

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar_url')
      .in('id', fromUserIds);

    if (profilesError) throw profilesError;

    // 3. Mapeia perfil para cada solicitação
    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    return requests.map(req => ({
      ...req,
      requester: profileMap[req.from_user] || null,
    }));
  }

  // ── Contagem de pendentes ─────────────────────────────────────
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

  // ── Status da solicitação enviada ─────────────────────────────
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