// ============================================================
// js/home.js — Versão corrigida completa
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';
import { getCurrentProfile, onAuthChange, signOut } from './supabase.js';

import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  subscribeToNotifications,
  getNotifText,
  getNotifIcon,
  formatTimeAgoNotif,
  NOTIF_TYPES,
} from './notifications.js';

import {
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getLikedPostIds,
  subscribeToNewPosts,
  getPostsByUser,
  getLikedPosts,
  addReply,
  getReplies,
} from './posts.js';

import { updateProfile, getProfileByHandle, isFollowing, followUser, unfollowUser } from './profile.js';
import { getConversations, getMessages, sendMessage, subscribeToMessages, getOrCreateConversation } from './messages.js';

// ============================================================
// ESTADO LOCAL
// ============================================================
let currentProfile = null;
let likedPostIds = new Set();
let unsubscribePosts = null;
let unsubscribeCurrentChat = null;
let unsubscribeNotifs = null;
let viewingProfile = null;

// FIX: controllers para remover listeners dos botões de perfil sem duplicar
let profileBtnControllers = [];

// ============================================================
// INICIALIZAÇÃO IMEDIATA
// ============================================================
try {
  setupNotifications();
  setupNavigation();
  setupPostComposer();
  setupPostModal();
  setupPostDetailModal(); // NOVO: modal de detalhe do post
  setupProfileModal();
  setupEmojis();
  setupUserMini();
  setupProfileTabs();
  setupTrendingWidget();
} catch (erroInterface) {
  console.error('Erro ao carregar interface:', erroInterface);
}

try {
  onAuthChange(async (session) => {
    if (session) {
      currentProfile = await getCurrentProfile();
      updateUserUI();
      await initNotifications();
      await loadFeed();
      startRealtimeFeed();
    } else {
      currentProfile = null;
      updateUserUI();
      await loadFeed();
    }
  });
} catch (erroBanco) {
  console.error('Erro ao conectar com banco:', erroBanco);
}

// ============================================================
// UPLOAD DE AVATAR
// ============================================================
async function uploadAvatar(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
  if (!file.type.startsWith('image/')) throw new Error('Arquivo inválido');
  if (file.size > 2 * 1024 * 1024) throw new Error('Imagem muito grande');

  const fileExt = file.name.split('.').pop();
  const filePath = `avatars/${user.id}-${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage.from('avatars').upload(filePath, file);
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return data.publicUrl + '?t=' + Date.now();
}

// ============================================================
// CARREGAR PERFIL POR HANDLE
// ============================================================
async function loadProfileByHandle(handle) {
  try {
    const profile = await getProfileByHandle(handle);
    viewingProfile = profile;
    await loadProfilePage();
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
    showNotification('Erro ao carregar perfil.');
  }
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================
function setupUserMini() {
  const userMini = document.querySelector('.user-mini');
  const loginPopup = document.getElementById('userLoginPopup');
  const btnPopupLogin = document.getElementById('btnPopupLogin');

  userMini?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!currentProfile) {
      loginPopup?.classList.toggle('active');
    } else {
      const querSair = confirm('Deseja sair da sua conta no VazaPUC?');
      if (querSair) {
        try {
          await signOut();
          window.location.assign('../index.html');
        } catch (err) {
          showNotification('Erro ao tentar sair da conta.');
        }
      }
    }
  });

  btnPopupLogin?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.assign('../inicial/login.html');
  });

  document.addEventListener('click', () => {
    loginPopup?.classList.remove('active');
  });

  loginPopup?.addEventListener('click', (e) => e.stopPropagation());
}

// ============================================================
// ATUALIZA UI COM DADOS DO USUÁRIO
// ============================================================
function updateUserUI() {
  const nameEl = document.querySelector('.user-name');
  const handleEl = document.querySelector('.user-handle');
  const composerAvatar = document.querySelector('.composer-avatar');
  const miniAvatar = document.querySelector('.user-mini .user-avatar img');

  if (!currentProfile) {
    if (nameEl) nameEl.textContent = 'Fazer Login';
    if (handleEl) handleEl.textContent = 'Clique para entrar 🚀';
    return;
  }

  if (nameEl) nameEl.textContent = currentProfile.name;
  if (handleEl) handleEl.textContent = `@${currentProfile.handle}`;

  const avatarSrc = currentProfile.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentProfile.handle}`;

  if (composerAvatar) composerAvatar.src = avatarSrc;
  if (miniAvatar) miniAvatar.src = avatarSrc;
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page-container');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetDataPage = item.getAttribute('data-page');

      navItems.forEach(n => n.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      item.classList.add('active');

      const targetPage = document.getElementById(targetDataPage + '-page');
      if (targetPage) targetPage.classList.add('active');

      if (targetDataPage === 'profile') {
        viewingProfile = null;
        loadProfilePage();
      }
      if (targetDataPage === 'messages') loadMessagesPage();
      if (targetDataPage === 'explore') loadExplorePage();
    });
  });
}

// ============================================================
// FEED
// ============================================================
async function loadFeed() {
  const container = document.getElementById('postsContainer');
  if (!container) return;

  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Carregando...</div>';

  try {
    const posts = await getPosts(20);

    if (currentProfile) {
      const ids = posts.map(p => p.id);
      likedPostIds = await getLikedPostIds(ids);
    }

    renderPosts(posts, container);
  } catch (err) {
    console.error('Erro ao carregar feed:', err);
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--danger)">Erro ao carregar posts.</div>';
  }
}

function renderPosts(posts, containerElement) {
  if (posts.length === 0) {
    containerElement.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Nenhum post ainda. Seja o primeiro! 🚀</div>';
    return;
  }
  containerElement.innerHTML = posts.map(post => createPostHTML(post)).join('');
  attachPostEventListeners();
}

function createPostHTML(post) {
  const isLiked = likedPostIds.has(post.id);
  const timeAgo = formatTimeAgo(post.created_at);
  const userAvatar = currentProfile?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;
  const authorAvatar = post.author?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;

  return `
    <div class="post-card" data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}" style="flex-direction:column;cursor:pointer;">
      <div class="post-main" style="display:flex;gap:16px;width:100%;">
        <img src="${authorAvatar}" class="avatar clickable-avatar" data-handle="${post.author?.handle}" style="cursor:pointer;">
        <div class="post-content" style="flex:1;min-width:0;">
          <div class="post-header">
            <span class="post-author clickable-avatar" data-handle="${post.author?.handle}" style="cursor:pointer;">
              ${escapeHtml(post.author?.name ?? 'Usuário')}
            </span>
            <span class="post-handle">@${escapeHtml(post.author?.handle ?? '')}</span>
            <span class="post-time">${timeAgo}</span>
          </div>
          <p class="post-text post-clickable-body" data-post-id="${post.id}">${escapeHtml(post.content)}</p>
          <div class="post-actions">
            <div class="post-action reply-action" title="Responder" data-post-id="${post.id}">
              💬 <span class="reply-count">${post.replies_count ?? 0}</span>
            </div>
            <div class="post-action like-action ${isLiked ? 'liked' : ''}"
                 title="Curtir"
                 data-post-id="${post.id}"
                 data-author-id="${post.author?.id ?? ''}"
                 data-liked="${isLiked}">
              ❤️ <span class="like-count">${post.likes_count ?? 0}</span>
            </div>
            <div class="post-action share-action" title="Compartilhar">📤</div>
          </div>
        </div>
      </div>

      <div class="post-replies-section" id="replies-${post.id}" style="display:none;">
        <div class="reply-composer">
          <img src="${userAvatar}" class="reply-avatar">
          <div class="reply-input-wrapper">
            <textarea class="reply-input" id="reply-input-${post.id}" placeholder="Postar sua resposta..." rows="1"></textarea>
            <div class="reply-toolbar">
              <label class="privacy-toggle">
                <input type="checkbox" id="reply-privacy-${post.id}">
                <span class="privacy-label">🔒 Apenas o autor pode ver</span>
              </label>
              <button class="reply-submit-btn" data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}">Responder</button>
            </div>
          </div>
        </div>
        <div class="replies-list" id="replies-list-${post.id}">
          <p style="padding:12px;text-align:center;color:var(--text-secondary);font-size:13px;">Carregando comentários...</p>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// EVENT LISTENERS DOS POSTS
// ============================================================
function attachPostEventListeners() {

  // CURTIR
  document.querySelectorAll('.like-action').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentProfile) {
        showNotification('Faça login para curtir! 🔐');
        return;
      }

      const postId = newBtn.dataset.postId;
      const authorId = newBtn.dataset.authorId;
      const wasLiked = newBtn.dataset.liked === 'true';
      const countEl = newBtn.querySelector('.like-count');
      const currentCount = parseInt(countEl.textContent) || 0;

      newBtn.style.pointerEvents = 'none';

      const newLiked = !wasLiked;
      newBtn.dataset.liked = newLiked;
      newBtn.classList.toggle('liked', newLiked);
      countEl.textContent = Math.max(0, currentCount + (newLiked ? 1 : -1));

      if (newLiked) likedPostIds.add(postId);
      else likedPostIds.delete(postId);

      try {
        if (newLiked) {
          await likePost(postId);
          if (authorId && authorId !== currentProfile.id) {
            await createNotification({
              toUserId: authorId,
              actorId: currentProfile.id,
              type: NOTIF_TYPES.LIKE,
              postId,
            });
          }
        } else {
          await unlikePost(postId);
        }
      } catch (err) {
        newBtn.dataset.liked = wasLiked;
        newBtn.classList.toggle('liked', wasLiked);
        countEl.textContent = Math.max(0, currentCount);
        if (wasLiked) likedPostIds.add(postId);
        else likedPostIds.delete(postId);
        showNotification('Erro ao curtir. Tente novamente.');
      } finally {
        newBtn.style.pointerEvents = '';
      }
    });
  });

  // CLIQUE NO AVATAR / NOME — vai pro perfil
  document.querySelectorAll('.clickable-avatar').forEach(el => {
    const newEl = el.cloneNode(true);
    // Para img precisamos preservar o src
    if (el.tagName === 'IMG') newEl.src = el.src;
    el.parentNode.replaceChild(newEl, el);

    newEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const handle = newEl.dataset.handle;
      if (!handle) return;

      document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
      document.getElementById('profile-page').classList.add('active');

      loadProfileByHandle(handle);
    });
  });

  // CLIQUE NO TEXTO DO POST — abre modal de detalhe
  document.querySelectorAll('.post-clickable-body').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = el.dataset.postId;
      openPostDetailModal(postId);
    });
  });

  // ABRIR SEÇÃO DE COMENTÁRIOS INLINE
  document.querySelectorAll('.reply-action').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = newBtn.dataset.postId;
      const repliesSection = document.getElementById(`replies-${postId}`);

      if (repliesSection.style.display === 'none') {
        repliesSection.style.display = 'block';
        document.getElementById(`reply-input-${postId}`)?.focus();
        await loadRepliesForPost(postId);
      } else {
        repliesSection.style.display = 'none';
      }
    });
  });

  // ENVIAR COMENTÁRIO
  document.querySelectorAll('.reply-submit-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (!currentProfile) {
        showNotification('Faça login para comentar! 🔐');
        return;
      }

      const postId = newBtn.dataset.postId;
      const authorId = newBtn.dataset.authorId;
      const input = document.getElementById(`reply-input-${postId}`);
      const privacyCheckbox = document.getElementById(`reply-privacy-${postId}`);
      const content = input.value.trim();
      const isPrivate = privacyCheckbox.checked;

      if (!content) return;

      newBtn.disabled = true;
      newBtn.textContent = '...';

      try {
        await addReply(postId, content, isPrivate);

        const repliesList = document.getElementById(`replies-list-${postId}`);
        const emptyMsg = repliesList.querySelector('p');
        if (emptyMsg) emptyMsg.remove();

        const userAvatar = currentProfile.avatar_url
          || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentProfile.handle}`;

        repliesList.insertAdjacentHTML('afterbegin', `
          <div class="reply-item" style="animation:slideDown 0.3s ease;">
            <img src="${userAvatar}" class="reply-avatar" style="width:30px;height:30px;">
            <div class="reply-bubble">
              <div class="reply-header">
                <div>
                  <span class="reply-author">${escapeHtml(currentProfile.name)}</span>
                  <span class="reply-handle">@${escapeHtml(currentProfile.handle)}</span>
                </div>
                ${isPrivate ? '<span class="reply-private-badge">🔒 Privado</span>' : ''}
              </div>
              <p style="font-size:13.5px;color:var(--text-primary);line-height:1.4;">${escapeHtml(content)}</p>
            </div>
          </div>
        `);

        const replyCountSpan = document.querySelector(`.reply-action[data-post-id="${postId}"] .reply-count`);
        if (replyCountSpan) {
          replyCountSpan.textContent = parseInt(replyCountSpan.textContent) + 1;
        }

        input.value = '';
        privacyCheckbox.checked = false;
        showNotification(isPrivate ? 'Comentário enviado em modo privado! 🤫' : 'Comentário enviado! 💬');

        if (authorId && authorId !== currentProfile.id) {
          await createNotification({
            toUserId: authorId,
            actorId: currentProfile.id,
            type: NOTIF_TYPES.REPLY,
            postId,
          });
        }

      } catch (err) {
        console.error('Erro ao comentar:', err);
        showNotification('Erro ao enviar. Tente novamente.');
      } finally {
        newBtn.disabled = false;
        newBtn.textContent = 'Responder';
      }
    });
  });
}

// ============================================================
// MODAL DE DETALHE DO POST — NOVO
// ============================================================
function setupPostDetailModal() {
  // Cria o modal se não existir
  if (document.getElementById('postDetailModal')) return;

  const modal = document.createElement('div');
  modal.id = 'postDetailModal';
  modal.style.cssText = `
    display:none;
    position:fixed;inset:0;z-index:3000;
    background:rgba(0,0,0,0.7);
    align-items:center;justify-content:center;
    padding:20px;
    backdrop-filter:blur(4px);
  `;
  modal.innerHTML = `
    <div id="postDetailBox" style="
      background:var(--dark-bg-secondary);
      border:1px solid var(--border);
      border-radius:16px;
      width:100%;max-width:600px;
      max-height:85vh;
      overflow-y:auto;
      display:flex;flex-direction:column;
      position:relative;
    ">
      <div style="
        position:sticky;top:0;z-index:10;
        display:flex;align-items:center;gap:12px;
        padding:16px 20px;
        background:var(--dark-bg-secondary);
        border-bottom:1px solid var(--border);
      ">
        <button id="closePostDetailBtn" style="
          background:none;border:none;
          color:var(--text-primary);font-size:20px;
          cursor:pointer;padding:4px 8px;
          border-radius:50%;
          transition:background 0.2s;
          line-height:1;
        " onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='none'">←</button>
        <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);">Post</h3>
      </div>
      <div id="postDetailContent" style="padding:20px;flex:1;"></div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closePostDetailBtn').addEventListener('click', closePostDetailModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePostDetailModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePostDetailModal();
  });
}

function closePostDetailModal() {
  const modal = document.getElementById('postDetailModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

async function openPostDetailModal(postId) {
  const modal = document.getElementById('postDetailModal');
  const content = document.getElementById('postDetailContent');
  if (!modal || !content) return;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  content.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Carregando...</p>';

  try {
    // Busca o post do DOM (já carregado no feed)
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const authorName = postCard?.querySelector('.post-author')?.textContent?.trim() ?? 'Usuário';
    const authorHandle = postCard?.querySelector('.post-handle')?.textContent?.trim() ?? '';
    const postText = postCard?.querySelector('.post-text')?.textContent?.trim() ?? '';
    const postTime = postCard?.querySelector('.post-time')?.textContent?.trim() ?? '';
    const authorAvatar = postCard?.querySelector('.avatar')?.src ?? '';
    const likeCount = postCard?.querySelector('.like-count')?.textContent ?? '0';
    const replyCount = postCard?.querySelector('.reply-count')?.textContent ?? '0';
    const isLiked = postCard?.querySelector('.like-action')?.dataset?.liked === 'true';
    const authorId = postCard?.dataset?.authorId ?? '';

    const userAvatar = currentProfile?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;
    const handle = authorHandle.replace('@', '');

    content.innerHTML = `
      <!-- Post principal -->
      <div style="display:flex;gap:14px;margin-bottom:20px;">
        <img src="${authorAvatar}" 
             class="detail-clickable-avatar"
             data-handle="${handle}"
             style="width:48px;height:48px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="detail-clickable-avatar" data-handle="${handle}"
              style="font-weight:700;font-size:15px;color:var(--text-primary);cursor:pointer;">
              ${escapeHtml(authorName)}
            </span>
            <span style="color:var(--text-secondary);font-size:14px;">${escapeHtml(authorHandle)}</span>
          </div>
          <p style="
            font-size:20px;color:var(--text-primary);
            line-height:1.5;margin-top:12px;
            word-break:break-word;white-space:pre-wrap;
          ">${escapeHtml(postText)}</p>
          <p style="color:var(--text-secondary);font-size:13px;margin-top:12px;">${postTime}</p>
        </div>
      </div>

      <!-- Estatísticas -->
      <div style="
        display:flex;gap:20px;
        padding:14px 0;
        border-top:1px solid var(--border);
        border-bottom:1px solid var(--border);
        margin-bottom:16px;
      ">
        <span style="color:var(--text-secondary);font-size:14px;">
          <strong style="color:var(--text-primary);">${replyCount}</strong> Respostas
        </span>
        <span style="color:var(--text-secondary);font-size:14px;">
          <strong style="color:var(--text-primary);">${likeCount}</strong> Curtidas
        </span>
      </div>

      <!-- Ações -->
      <div style="
        display:flex;gap:24px;
        padding-bottom:16px;
        border-bottom:1px solid var(--border);
        margin-bottom:16px;
      ">
        <button id="detailLikeBtn" data-post-id="${postId}" data-author-id="${authorId}" data-liked="${isLiked}"
          style="
            background:none;border:none;cursor:pointer;
            display:flex;align-items:center;gap:6px;
            color:${isLiked ? 'var(--danger, #e0245e)' : 'var(--text-secondary)'};
            font-size:15px;font-weight:600;
            transition:color 0.2s;
          ">
          ${isLiked ? '❤️' : '🤍'} <span id="detailLikeCount">${likeCount}</span>
        </button>
        <button id="detailReplyToggle"
          style="
            background:none;border:none;cursor:pointer;
            display:flex;align-items:center;gap:6px;
            color:var(--text-secondary);font-size:15px;font-weight:600;
          ">
          💬 Responder
        </button>
      </div>

      <!-- Composer de resposta -->
      <div id="detailReplyComposer" style="display:none;margin-bottom:16px;">
        <div style="display:flex;gap:12px;">
          <img src="${userAvatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;">
          <div style="flex:1;">
            <textarea id="detailReplyInput" placeholder="Postar sua resposta..." rows="3"
              style="
                width:100%;resize:none;
                background:var(--dark-bg);
                border:1px solid var(--border);
                border-radius:12px;padding:10px 14px;
                color:var(--text-primary);font-size:14px;
                outline:none;font-family:inherit;
              "></textarea>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
                <input type="checkbox" id="detailReplyPrivacy">
                🔒 Apenas o autor pode ver
              </label>
              <button id="detailReplySubmit" data-post-id="${postId}" data-author-id="${authorId}"
                style="
                  background:var(--primary);color:white;
                  border:none;border-radius:20px;
                  padding:8px 20px;font-size:14px;font-weight:600;
                  cursor:pointer;
                ">Responder</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Lista de respostas -->
      <div id="detailRepliesList">
        <p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:14px;">Carregando respostas...</p>
      </div>
    `;

    // Clique em avatar/nome dentro do modal → vai pro perfil
    content.querySelectorAll('.detail-clickable-avatar').forEach(el => {
      el.addEventListener('click', () => {
        const h = el.dataset.handle;
        if (!h) return;
        closePostDetailModal();
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page').classList.add('active');
        loadProfileByHandle(h);
      });
    });

    // Like no modal
    const detailLikeBtn = document.getElementById('detailLikeBtn');
    detailLikeBtn?.addEventListener('click', async () => {
      if (!currentProfile) { showNotification('Faça login para curtir! 🔐'); return; }
      const pid = detailLikeBtn.dataset.postId;
      const aid = detailLikeBtn.dataset.authorId;
      const wasLiked = detailLikeBtn.dataset.liked === 'true';
      const countEl = document.getElementById('detailLikeCount');
      const currentCount = parseInt(countEl.textContent) || 0;

      detailLikeBtn.style.pointerEvents = 'none';
      const newLiked = !wasLiked;
      detailLikeBtn.dataset.liked = newLiked;
      detailLikeBtn.textContent = '';
      detailLikeBtn.innerHTML = `${newLiked ? '❤️' : '🤍'} <span id="detailLikeCount">${Math.max(0, currentCount + (newLiked ? 1 : -1))}</span>`;
      detailLikeBtn.style.color = newLiked ? 'var(--danger, #e0245e)' : 'var(--text-secondary)';

      // Sincroniza no feed também
      const feedLikeBtn = document.querySelector(`.like-action[data-post-id="${pid}"]`);
      if (feedLikeBtn) {
        feedLikeBtn.dataset.liked = newLiked;
        feedLikeBtn.classList.toggle('liked', newLiked);
        const feedCount = feedLikeBtn.querySelector('.like-count');
        if (feedCount) feedCount.textContent = Math.max(0, currentCount + (newLiked ? 1 : -1));
      }
      if (newLiked) likedPostIds.add(pid);
      else likedPostIds.delete(pid);

      try {
        if (newLiked) {
          await likePost(pid);
          if (aid && aid !== currentProfile.id) {
            await createNotification({ toUserId: aid, actorId: currentProfile.id, type: NOTIF_TYPES.LIKE, postId: pid });
          }
        } else {
          await unlikePost(pid);
        }
      } catch (err) {
        showNotification('Erro ao curtir.');
      } finally {
        detailLikeBtn.style.pointerEvents = '';
      }
    });

    // Toggle responder
    document.getElementById('detailReplyToggle')?.addEventListener('click', () => {
      const composer = document.getElementById('detailReplyComposer');
      if (composer.style.display === 'none') {
        composer.style.display = 'block';
        document.getElementById('detailReplyInput')?.focus();
      } else {
        composer.style.display = 'none';
      }
    });

    // Enviar resposta no modal
    document.getElementById('detailReplySubmit')?.addEventListener('click', async (e) => {
      if (!currentProfile) { showNotification('Faça login para comentar! 🔐'); return; }
      const btn = e.currentTarget;
      const pid = btn.dataset.postId;
      const aid = btn.dataset.authorId;
      const input = document.getElementById('detailReplyInput');
      const privacy = document.getElementById('detailReplyPrivacy');
      const text = input.value.trim();
      if (!text) return;

      btn.disabled = true; btn.textContent = '...';

      try {
        await addReply(pid, text, privacy.checked);
        input.value = '';
        privacy.checked = false;
        document.getElementById('detailReplyComposer').style.display = 'none';
        showNotification(privacy.checked ? 'Resposta privada enviada! 🤫' : 'Resposta enviada! 💬');

        // Atualiza contador no feed
        const replyCountEl = document.querySelector(`.reply-action[data-post-id="${pid}"] .reply-count`);
        if (replyCountEl) replyCountEl.textContent = parseInt(replyCountEl.textContent) + 1;

        if (aid && aid !== currentProfile.id) {
          await createNotification({ toUserId: aid, actorId: currentProfile.id, type: NOTIF_TYPES.REPLY, postId: pid });
        }

        // Recarrega respostas no modal
        await loadDetailReplies(pid);
      } catch (err) {
        showNotification('Erro ao enviar resposta.');
      } finally {
        btn.disabled = false; btn.textContent = 'Responder';
      }
    });

    // Carrega respostas
    await loadDetailReplies(postId);

  } catch (err) {
    console.error('Erro ao abrir post:', err);
    content.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">Erro ao carregar post.</p>';
  }
}

async function loadDetailReplies(postId) {
  const container = document.getElementById('detailRepliesList');
  if (!container) return;

  container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:14px;">Carregando...</p>';

  try {
    const replies = await getReplies(postId, currentProfile?.id);

    if (replies.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:14px;">Nenhuma resposta ainda. Seja o primeiro! 💬</p>';
      return;
    }

    container.innerHTML = replies.map(r => {
      const avatar = r.author?.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author?.handle}`;
      const timeAgo = formatTimeAgo(r.created_at);
      return `
        <div style="
          display:flex;gap:12px;
          padding:14px 0;
          border-bottom:1px solid var(--border);
        ">
          <img src="${avatar}" 
               class="detail-reply-avatar"
               data-handle="${r.author?.handle ?? ''}"
               style="width:38px;height:38px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
              <span class="detail-reply-avatar" data-handle="${r.author?.handle ?? ''}"
                style="font-weight:700;font-size:14px;color:var(--text-primary);cursor:pointer;">
                ${escapeHtml(r.author?.name ?? 'Usuário')}
              </span>
              <span style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(r.author?.handle ?? '')}</span>
              <span style="color:var(--text-secondary);font-size:11px;">· ${timeAgo}</span>
              ${r.is_private ? '<span style="background:rgba(255,150,0,0.15);color:#f90;border-radius:10px;padding:1px 8px;font-size:11px;">🔒 Privado</span>' : ''}
            </div>
            <p style="font-size:14px;color:var(--text-primary);line-height:1.5;word-break:break-word;">${escapeHtml(r.content)}</p>
          </div>
        </div>
      `;
    }).join('');

    // Avatares nas respostas também levam ao perfil
    container.querySelectorAll('.detail-reply-avatar').forEach(el => {
      el.addEventListener('click', () => {
        const h = el.dataset.handle;
        if (!h) return;
        closePostDetailModal();
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page').classList.add('active');
        loadProfileByHandle(h);
      });
    });

  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:16px;">Erro ao carregar respostas.</p>';
  }
}

// ============================================================
// CARREGA REPLIES INLINE NO FEED
// ============================================================
async function loadRepliesForPost(postId) {
  const repliesList = document.getElementById(`replies-list-${postId}`);
  if (!repliesList) return;

  repliesList.innerHTML = '<p style="padding:12px;text-align:center;color:var(--text-secondary);font-size:13px;">Carregando...</p>';

  try {
    const replies = await getReplies(postId, currentProfile?.id);

    if (replies.length === 0) {
      repliesList.innerHTML = '<p style="padding:16px;text-align:center;color:var(--text-secondary);font-size:13px;">Nenhum comentário ainda. Seja o primeiro!</p>';
      return;
    }

    repliesList.innerHTML = replies.map(r => {
      const avatar = r.author?.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author?.handle}`;
      const timeAgo = formatTimeAgo(r.created_at);

      return `
        <div class="reply-item">
          <img src="${avatar}" class="reply-avatar" style="width:30px;height:30px;">
          <div class="reply-bubble">
            <div class="reply-header">
              <div>
                <span class="reply-author">${escapeHtml(r.author?.name)}</span>
                <span class="reply-handle">@${escapeHtml(r.author?.handle)}</span>
                <span style="color:var(--text-secondary);font-size:11px;margin-left:6px;">${timeAgo}</span>
              </div>
              ${r.is_private ? '<span class="reply-private-badge">🔒 Privado</span>' : ''}
            </div>
            <p style="font-size:13.5px;color:var(--text-primary);line-height:1.4;">${escapeHtml(r.content)}</p>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar comentários:', err);
    repliesList.innerHTML = '<p style="padding:12px;text-align:center;color:var(--danger);font-size:13px;">Erro ao carregar comentários.</p>';
  }
}

function prependPost(post) {
  const container = document.getElementById('postsContainer');
  if (!container) return;
  const emptyMsg = container.querySelector('[style*="Nenhum post"]');
  if (emptyMsg) emptyMsg.remove();

  const div = document.createElement('div');
  div.innerHTML = createPostHTML(post);
  const postEl = div.firstElementChild;
  postEl.style.animation = 'slideDown 0.3s ease';
  container.prepend(postEl);
  attachPostEventListeners();
}

function setupPostComposer() {
  const postInput = document.getElementById('postInput');
  const postSubmitBtn = document.getElementById('postSubmitBtn');
  if (!postInput || !postSubmitBtn) return;

  postInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  postInput.addEventListener('keypress', (e) => {
    if (e.ctrlKey && e.key === 'Enter') handleSubmitPost(postInput.value);
  });

  postSubmitBtn.addEventListener('click', () => handleSubmitPost(postInput.value));
}

function setupPostModal() {
  const modal = document.getElementById('postModal');
  const openBtn = document.getElementById('postBtnSidebar');
  const closeBtn = document.getElementById('closePostModal');
  const cancelBtn = document.getElementById('cancelPostBtn');
  const submitBtn = document.getElementById('submitPostBtn');
  const modalInput = document.getElementById('modalPostInput');

  openBtn?.addEventListener('click', () => { modal.classList.add('active'); modalInput?.focus(); });

  const closeModal = () => { modal.classList.remove('active'); if (modalInput) modalInput.value = ''; };
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  submitBtn?.addEventListener('click', async () => { await handleSubmitPost(modalInput?.value ?? ''); closeModal(); });
}

async function handleSubmitPost(content) {
  content = content?.trim();
  if (!content) return;
  if (!currentProfile) { showNotification('Faça login para postar! 🔐'); return; }

  const postInput = document.getElementById('postInput');
  const modalInput = document.getElementById('modalPostInput');
  if (postInput) { postInput.value = ''; postInput.style.height = 'auto'; }
  if (modalInput) modalInput.value = '';

  try {
    await createPost(content);
    showNotification('Post criado! ✨');
  } catch (err) {
    console.error('Erro ao criar post:', err);
    showNotification('Erro ao criar post. Tente novamente.');
  }
}

function startRealtimeFeed() {
  if (unsubscribePosts) unsubscribePosts();
  unsubscribePosts = subscribeToNewPosts((newPost) => {
    const exists = document.querySelector(`[data-post-id="${newPost.id}"]`);
    if (!exists) prependPost(newPost);
  });
}

// ============================================================
// PERFIL — FIX DEFINITIVO para não duplicar botões
// ============================================================
function setupProfileTabs() {
  const tabs = document.querySelectorAll('.profile-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadProfileTabContent(tab.getAttribute('data-tab'));
    });
  });
}

async function loadProfileTabContent(tabType) {
  const contentEl = document.getElementById('profileContent');
  if (!contentEl) return;

  const profileToLoad = viewingProfile || currentProfile;

  if (!profileToLoad) {
    contentEl.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-secondary);">Faça login para ver seu perfil. 🚀</p>';
    return;
  }

  contentEl.innerHTML = '<p style="padding:20px;text-align:center;">Carregando...</p>';

  try {
    let postsToRender = [];

    if (tabType === 'posts') {
      postsToRender = await getPostsByUser(profileToLoad.id);
    } else if (tabType === 'curtidos') {
      if (currentProfile && profileToLoad.id === currentProfile.id) {
        postsToRender = await getLikedPosts(profileToLoad.id);
      } else {
        contentEl.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-secondary);">Esta informação é privada. 🔒</p>';
        return;
      }
    } else if (tabType === 'midia') {
      const allPosts = await getPostsByUser(profileToLoad.id);
      postsToRender = allPosts.filter(p => p.content && p.content.includes('http'));
    }

    postsToRender = postsToRender.filter(p => p != null);

    if (postsToRender.length === 0) {
      const msg = tabType === 'curtidos' ? 'Nenhum post curtido ainda. ❤️'
        : tabType === 'midia' ? 'Nenhum post com mídia. 📷'
        : 'Nenhum post encontrado. 🚀';
      contentEl.innerHTML = `<p style="padding:40px;text-align:center;color:var(--text-secondary)">${msg}</p>`;
      return;
    }

    renderPosts(postsToRender, contentEl);
  } catch (err) {
    console.error(err);
    contentEl.innerHTML = '<p style="color:var(--danger);text-align:center;">Erro ao carregar conteúdo.</p>';
  }
}

// FIX DEFINITIVO: usa AbortController para cancelar listeners antigos
async function loadProfilePage() {
  // Cancela todos os listeners dos botões de perfil anteriores
  profileBtnControllers.forEach(ctrl => ctrl.abort());
  profileBtnControllers = [];

  const editBtn = document.getElementById('editProfileBtn');
  const profile = viewingProfile || currentProfile;

  if (!profile) {
    document.getElementById('profileName').textContent = 'Visitante';
    document.getElementById('profileHandle').textContent = '@anonimo';
    document.getElementById('profileBio').textContent = 'Faça login para ter seu próprio perfil!';

    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileAvatar) profileAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=visitante';

    document.querySelectorAll('.stat-value').forEach(el => { el.textContent = '0'; });

    if (editBtn) {
      editBtn.textContent = 'Fazer Login';
      editBtn.style.display = 'block';
      editBtn.classList.add('btn-login-animado');
    }

    // Remove botões extras com segurança
    document.getElementById('msgProfileBtn')?.remove();
    document.getElementById('followProfileBtn')?.remove();

    document.getElementById('profileContent').innerHTML =
      '<p style="padding:40px;text-align:center;color:var(--text-secondary);">Faça login para visualizar seus posts. 🚀</p>';
    return;
  }

  // Preenche dados
  document.getElementById('profileName').textContent = profile.name;
  document.getElementById('profileHandle').textContent = `@${profile.handle}`;
  document.getElementById('profileBio').textContent = profile.bio || 'Sem bio.';

  const profileAvatar = document.querySelector('.profile-avatar');
  if (profileAvatar) {
    profileAvatar.src = profile.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.handle}`;
  }

  const statValues = document.querySelectorAll('.stat-value');
  if (statValues.length >= 2) {
    statValues[0].textContent = profile.following_count || 0;
    statValues[1].textContent = profile.followers_count || 0;
  }

  // FIX: remove botões antigos SEMPRE antes de criar novos
  document.getElementById('msgProfileBtn')?.remove();
  document.getElementById('followProfileBtn')?.remove();

  const profileInfo = document.querySelector('.profile-info');
  const isOwnProfile = currentProfile && profile.id === currentProfile.id;

  if (isOwnProfile) {
    if (editBtn) {
      editBtn.textContent = 'Editar Perfil';
      editBtn.style.display = 'block';
      editBtn.classList.remove('btn-login-animado');
    }
  } else {
    if (editBtn) editBtn.style.display = 'none';

    if (currentProfile) {
      // Cria controller para este par de botões
      const controller = new AbortController();
      profileBtnControllers.push(controller);
      const signal = controller.signal;

      // Botão Mensagem — criado fresh, sem clone
      const msgBtn = document.createElement('button');
      msgBtn.id = 'msgProfileBtn';
      msgBtn.className = 'edit-profile-btn';
      msgBtn.style.cssText = 'margin-left:8px;border-color:var(--primary);color:var(--primary);';
      msgBtn.textContent = '✉ Mensagem';
      msgBtn.addEventListener('click', async () => {
        try {
          const conv = await getOrCreateConversation(profile.id);
          document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
          document.getElementById('messages-page').classList.add('active');
          await loadMessagesPage();
          openChat(conv.id, profile);
        } catch (err) {
          showNotification('Erro ao abrir conversa.');
        }
      }, { signal });
      profileInfo.appendChild(msgBtn);

      // Botão Seguir/Seguindo
      const followBtn = document.createElement('button');
      followBtn.id = 'followProfileBtn';
      followBtn.className = 'edit-profile-btn';
      followBtn.style.cssText = 'margin-left:8px;';

      // Carrega estado de seguindo assincronamente
      let alreadyFollowing = false;
      try {
        alreadyFollowing = await isFollowing(profile.id);
      } catch (_) {}

      const setFollowState = (following) => {
        followBtn.textContent = following ? '✓ Seguindo' : '+ Seguir';
        followBtn.style.background = following ? 'var(--primary)' : '';
        followBtn.style.color = following ? 'white' : '';
      };
      setFollowState(alreadyFollowing);

      followBtn.addEventListener('click', async () => {
        // Bloqueia duplo clique
        followBtn.disabled = true;
        try {
          const currentlyFollowing = followBtn.textContent.includes('Seguindo');
          if (currentlyFollowing) {
            await unfollowUser(profile.id);
            setFollowState(false);
          } else {
            await followUser(profile.id);
            setFollowState(true);
            await createNotification({
              toUserId: profile.id,
              actorId: currentProfile.id,
              type: NOTIF_TYPES.FOLLOW,
            });
          }
        } catch (err) {
          showNotification('Erro ao seguir/deixar de seguir.');
        } finally {
          followBtn.disabled = false;
        }
      }, { signal });

      profileInfo.appendChild(followBtn);
    }
  }

  // Reseta tabs e carrega posts
  const tabs = document.querySelectorAll('.profile-tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector('.profile-tab-btn[data-tab="posts"]')?.classList.add('active');

  loadProfileTabContent('posts');
}

// ============================================================
// MODAL DE EDITAR PERFIL
// ============================================================
function setupProfileModal() {
  const editModal = document.getElementById('editProfileModal');
  const openBtn = document.getElementById('editProfileBtn');
  const closeBtn = document.getElementById('closeEditModal');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const saveBtn = document.getElementById('saveEditBtn');

  openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentProfile) {
      window.location.assign('../inicial/login.html');
      return;
    }
    document.getElementById('editName').value = currentProfile.name || '';
    document.getElementById('editHandle').value = currentProfile.handle || '';
    document.getElementById('editBio').value = currentProfile.bio || '';
    editModal.classList.add('active');
  });

  const closeModal = () => editModal.classList.remove('active');
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  saveBtn?.addEventListener('click', async () => {
    saveBtn.textContent = 'Salvando...';
    saveBtn.disabled = true;

    try {
      const fileInput = document.getElementById('avatarInput');
      let avatarUrl = currentProfile?.avatar_url;

      if (fileInput && fileInput.files.length > 0) {
        avatarUrl = await uploadAvatar(fileInput.files[0]);
      }

      const updated = await updateProfile({
        name: document.getElementById('editName').value.trim(),
        handle: document.getElementById('editHandle').value.trim(),
        bio: document.getElementById('editBio').value.trim(),
        avatar_url: avatarUrl,
      });

      currentProfile = updated;
      updateUserUI();
      loadProfilePage();
      showNotification('Perfil atualizado com sucesso! ✅');
      closeModal();
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
      alert(err.message);
    } finally {
      saveBtn.textContent = 'Salvar';
      saveBtn.disabled = false;
    }
  });
}

// ============================================================
// MENSAGENS E CHAT
// ============================================================
async function loadMessagesPage() {
  const listEl = document.getElementById('conversationsList');
  if (!listEl) return;
  listEl.innerHTML = '<p style="padding:20px;text-align:center;">Carregando...</p>';

  try {
    const convs = await getConversations();
    if (convs.length === 0) {
      listEl.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-secondary)">Sem conversas.</p>';
      return;
    }

    listEl.innerHTML = convs.map(c => {
      const avatar = c.otherUser?.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.otherUser?.handle}`;
      return `
        <div class="conversation-item" data-id="${c.id}">
          <img src="${avatar}" alt="Avatar" class="conversation-avatar">
          <div class="conversation-info">
            <p class="conversation-name">${escapeHtml(c.otherUser?.name)}</p>
            <p class="conversation-preview">@${escapeHtml(c.otherUser?.handle)}</p>
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const convId = item.dataset.id;
        const otherUser = convs.find(c => c.id === convId).otherUser;
        openChat(convId, otherUser);
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p style="color:var(--danger);padding:20px;">Erro ao carregar conversas.</p>';
  }
}

async function openChat(convId, otherUser) {
  const chatArea = document.getElementById('chatArea');

  chatArea.innerHTML = `
    <div style="padding:16px;border-bottom:1px solid var(--border);background:var(--dark-bg-secondary);">
      <strong style="font-size:16px;">${escapeHtml(otherUser.name)}</strong>
      <span style="color:var(--text-secondary);font-size:13px;margin-left:8px;">@${escapeHtml(otherUser.handle)}</span>
    </div>
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--dark-bg);">
      <p style="text-align:center;color:var(--text-secondary);">Carregando histórico...</p>
    </div>
    <div style="padding:16px;border-top:1px solid var(--border);display:flex;gap:10px;background:var(--dark-bg-secondary);">
      <input type="text" id="msgInput" placeholder="Envie uma mensagem..."
        style="flex:1;padding:12px 16px;border-radius:20px;border:1px solid var(--border);background:var(--dark-bg);color:var(--text-primary);outline:none;">
      <button id="sendMsgBtn" class="post-submit-btn" style="padding:0 24px;">Enviar</button>
    </div>
  `;

  try {
    const msgs = await getMessages(convId);
    renderMessagesList(msgs);
  } catch (err) {
    document.getElementById('chatMessages').innerHTML = '<p style="color:var(--danger);">Erro ao carregar mensagens.</p>';
  }

  const input = document.getElementById('msgInput');
  const btn = document.getElementById('sendMsgBtn');

  const handleSend = async () => {
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    await sendMessage(convId, content);
  };

  btn.addEventListener('click', handleSend);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });

  if (unsubscribeCurrentChat) unsubscribeCurrentChat();
  unsubscribeCurrentChat = subscribeToMessages(convId, appendMessageToUI);
}

function renderMessagesList(msgs) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = msgs.length === 0
    ? '<p style="text-align:center;color:var(--text-secondary);">Diga olá! 👋</p>' : '';
  msgs.forEach(appendMessageToUI);
}

function appendMessageToUI(msg) {
  const container = document.getElementById('chatMessages');
  if (!container || !currentProfile) return;

  const emptyText = container.querySelector('p');
  if (emptyText?.textContent.includes('Diga olá')) emptyText.remove();

  const isMe = msg.sender_id === currentProfile.id;
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    max-width:75%;padding:10px 14px;border-radius:18px;
    font-size:15px;line-height:1.4;word-break:break-word;
    ${isMe
      ? 'background:var(--primary);color:white;align-self:flex-end;border-bottom-right-radius:4px;'
      : 'background:var(--dark-bg-tertiary);color:var(--text-primary);align-self:flex-start;border-bottom-left-radius:4px;'
    }
  `;
  bubble.textContent = msg.content;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
async function initNotifications() {
  if (!currentProfile) return;
  await refreshNotifBadge();

  if (unsubscribeNotifs) unsubscribeNotifs();

  unsubscribeNotifs = subscribeToNotifications(currentProfile.id, (newNotif) => {
    refreshNotifBadge();
    showNotifToast(newNotif);
    pulseNotifBell();
  });
}

async function refreshNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;

  const count = await getUnreadCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

function pulseNotifBell() {
  const bell = document.getElementById('notifBellBtn');
  if (!bell) return;
  bell.classList.remove('notif-bell-pulse');
  void bell.offsetWidth;
  bell.classList.add('notif-bell-pulse');
  setTimeout(() => bell.classList.remove('notif-bell-pulse'), 1000);
}

function setupNotifications() {
  const bellBtn = document.getElementById('notifBellBtn');
  const panel = document.getElementById('notifPanel');
  const backdrop = document.getElementById('notifBackdrop');
  const markAllBtn = document.getElementById('notifMarkAllBtn');

  if (!bellBtn || !panel) return;

  bellBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!currentProfile) {
      showNotification('Faça login para ver suas notificações! 🔐');
      return;
    }

    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
      await renderNotifList();
    }
  });

  backdrop?.addEventListener('click', () => panel.classList.remove('active'));

  markAllBtn?.addEventListener('click', async () => {
    await markAllAsRead();
    await refreshNotifBadge();
    await renderNotifList();
    showNotification('Todas as notificações foram lidas! ✅');
  });
}

async function renderNotifList() {
  const listEl = document.getElementById('notifList');
  if (!listEl) return;

  listEl.innerHTML = '<div class="notif-empty"><span class="notif-empty-icon">⏳</span>Carregando...</div>';

  const notifs = await getNotifications(30);

  if (notifs.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty">
        <span class="notif-empty-icon">🔔</span>
        Nenhuma notificação ainda.<br>Interaja com a galera!
      </div>`;
    return;
  }

  listEl.innerHTML = notifs.map(n => {
    const avatar = n.actor?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${n.actor?.handle || 'anon'}`;
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}">
        <img src="${avatar}" class="notif-item-avatar" alt="Avatar">
        <div class="notif-item-icon">${getNotifIcon(n.type)}</div>
        <div class="notif-item-body">
          <p class="notif-item-text">${escapeHtml(getNotifText(n))}</p>
          <p class="notif-item-time">${formatTimeAgoNotif(n.created_at)}</p>
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      item.classList.remove('unread');
      await markAsRead(item.dataset.notifId);
      await refreshNotifBadge();
    });
  });

  setTimeout(async () => {
    if (document.getElementById('notifPanel')?.classList.contains('active')) {
      await markAllAsRead();
      await refreshNotifBadge();
    }
  }, 3000);
}

function showNotifToast(notif) {
  document.querySelector('.notif-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `
    <span class="notif-toast-icon">${getNotifIcon(notif.type)}</span>
    <p class="notif-toast-text">${escapeHtml(getNotifText(notif))}</p>
  `;

  toast.addEventListener('click', async () => {
    removeToast(toast);
    document.getElementById('notifPanel')?.classList.add('active');
    await renderNotifList();
  });

  document.body.appendChild(toast);
  setTimeout(() => removeToast(toast), 5000);
}

function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

// ============================================================
// EXPLORAR
// ============================================================
async function loadExplorePage() {
  const exploreContent = document.getElementById('exploreContent');
  if (!exploreContent) return;

  exploreContent.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Carregando recomendações... 🔄</p>';

  try {
    const posts = await getPosts(30);
    const topPosts = [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 4);
    const recentPosts = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    const friendsLiked = [...posts].sort(() => 0.5 - Math.random()).slice(0, 4);

    const suggestedUsers = [
      { name: 'Diretório Central', handle: 'dce_puc', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dce' },
      { name: 'Atlética de Exatas', handle: 'atletica_exatas', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=exatas' },
      { name: 'Bateria Fúria', handle: 'bateria_furia', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=furia' },
      { name: 'Lucas Mendes', handle: 'lucas_mendes', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lucas' },
      { name: 'Mariana Souza', handle: 'mari_sz', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mari' },
    ];

    const renderMiniPost = (post, contextLabel, contextIcon) => {
      const avatar = post.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
      return `
        <div class="explore-post-card">
          ${contextLabel ? `<div class="explore-context"><span class="explore-context-icon">${contextIcon}</span> ${contextLabel}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;">
            <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${escapeHtml(post.author?.name)}</div>
              <div style="color:var(--text-secondary);font-size:12px;">@${escapeHtml(post.author?.handle)}</div>
            </div>
          </div>
          <div style="font-size:14px;color:var(--text-primary);line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">
            ${escapeHtml(post.content)}
          </div>
          <div style="color:var(--text-secondary);font-size:12px;display:flex;justify-content:space-between;margin-top:auto;padding-top:8px;">
            <span style="display:flex;gap:12px;"><span>❤️ ${post.likes_count || 0}</span><span>💬 ${post.replies_count || 0}</span></span>
            <span>📍 PUC</span>
          </div>
        </div>`;
    };

    exploreContent.innerHTML = `
      <div class="explore-sections">
        <section>
          <h3 class="explore-section-title">✨ Sugestões para você</h3>
          <div class="suggested-users-row">
            ${suggestedUsers.map(u => `
              <div class="suggested-user-card">
                <img src="${u.avatar}" alt="${u.name}">
                <div><h4>${u.name}</h4><p>@${u.handle}</p></div>
                <button class="btn-follow-small">Seguir</button>
              </div>`).join('')}
          </div>
        </section>
        <section>
          <h3 class="explore-section-title">🔥 Em Alta no VazaPUC</h3>
          <div class="explore-grid">${topPosts.map(p => renderMiniPost(p, 'Baseado nos seus gostos', '⭐')).join('')}</div>
        </section>
        <section>
          <h3 class="explore-section-title">👀 O que a galera tá vendo</h3>
          <div class="explore-grid">${friendsLiked.map(p => renderMiniPost(p, 'Amigos também interagiram', '👥')).join('')}</div>
        </section>
        <section>
          <h3 class="explore-section-title">🕒 Acabou de vazar</h3>
          <div class="explore-grid">${recentPosts.map(p => renderMiniPost(p, 'Postado recentemente', '✨')).join('')}</div>
        </section>
      </div>`;
  } catch (err) {
    console.error('Erro ao carregar explorar:', err);
    exploreContent.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px;">Erro ao carregar. Tente novamente!</p>';
  }
}

// ============================================================
// TRENDING WIDGET
// ============================================================
function setupTrendingWidget() {
  const widget = document.getElementById('trendingWidget');
  const btn = document.getElementById('toggleBlocksBtn');
  if (widget && btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.toggle('expanded');
    });
  }
}

// ============================================================
// EMOJIS
// ============================================================
function setupEmojis() {
  const emojis = ['😀','😂','🥰','😎','😭','😡','👍','👎','❤️','🔥','✨','🎉','🤔','👀','🙌','🙏','💀','🤡','💩','💯','✅','❌','⚠️','💡','🗣️','🧊','🍺','🍕','🎓','📚'];

  const renderEmojis = (containerId, inputId) => {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;

    container.innerHTML = emojis.map(e => `<span class="emoji-item">${e}</span>`).join('');
    container.querySelectorAll('.emoji-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + item.textContent + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + item.textContent.length;
        input.focus();
        input.dispatchEvent(new Event('input'));
      });
    });
  };

  renderEmojis('pickerEmojiFeed', 'postInput');
  renderEmojis('pickerEmojiModal', 'modalPostInput');

  const toggleFeed = document.getElementById('btnEmojiFeed');
  const pickerFeed = document.getElementById('pickerEmojiFeed');
  const toggleModal = document.getElementById('btnEmojiModal');
  const pickerModal = document.getElementById('pickerEmojiModal');

  toggleFeed?.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); pickerFeed?.classList.toggle('active'); pickerModal?.classList.remove('active'); });
  toggleModal?.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); pickerModal?.classList.toggle('active'); pickerFeed?.classList.remove('active'); });

  document.addEventListener('click', () => { pickerFeed?.classList.remove('active'); pickerModal?.classList.remove('active'); });
  pickerFeed?.addEventListener('click', e => e.stopPropagation());
  pickerModal?.addEventListener('click', e => e.stopPropagation());
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimeAgo(isoString) {
  const diffMin = Math.floor((Date.now() - new Date(isoString)) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h atrás`;
  return `${Math.floor(diffMin / 1440)}d atrás`;
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position:fixed;bottom:20px;right:20px;
    background:var(--primary);color:white;
    padding:12px 20px;border-radius:8px;
    font-weight:600;z-index:2000;
    box-shadow:0 4px 12px rgba(0,0,0,0.3);
    transition:opacity 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}