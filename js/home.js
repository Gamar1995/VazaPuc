// ============================================================
// js/home.js — Versão COMPLETA (Feed, Chat, Mídia e Configurações)
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';
import { getCurrentProfile, onAuthChange, signOut } from './supabase.js';

import {
  uploadPostMedia,
  createPostWithMedia,
  setupMediaComposer,
  createMediaGridHTML,
  attachMediaListeners,
  renderProfileMediaGrid,
  getMediaPostsByUser,
} from './Midia.js';

import {
  repostPost,
  undoRepost,
  quotePost,
  getRepostedPostIds,
  createQuoteCardHTML,
  getOriginalPost,
  attachRepostListeners,
  attachQuoteCardListeners,
  getRepostedPosts,
} from './Reposts.js';

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
import { getFollowingFeed, getFollowingIds, subscribeToFollowingFeed, followUserAndSync, unfollowUserAndSync, syncProfileCounts } from './seguindo.js';

// ============================================================
// ESTADO LOCAL
// ============================================================
let currentProfile = null;
let likedPostIds = new Set();
let repostedPostIds = new Set();
let mediaComposer = null;
let unsubscribePosts = null;
let unsubscribeFollowingFeed = null;
let unsubscribeCurrentChat = null;
let unsubscribeNotifs = null;
let viewingProfile = null;
let activeFeedTab = 'para-voce';
let currentEditingPostId = null;

let feedListenersController = new AbortController();
let profileListenersController = new AbortController();
let profileBtnControllers = [];

window.renderPostPage = (postId) => openPostDetailModal(postId);

// ============================================================
// INICIALIZAÇÃO IMEDIATA
// ============================================================
try {
  setupNotifications();
  setupNavigation();
  setupFeedTabs();
  setupPostComposer();
  setupPostModal();
  setupPostDetailModal();
  setupProfileModal();
  setupEmojis();
    setupFeedImageUpload();
  setupUserMini();
  setupProfileTabs();
  setupEditPostModal();
  setupTrendingWidget();
  setupMediaInModal();
  setupSearch();
  setupTemas();
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
// SETUP DE MÍDIA NO MODAL DE POST
// ============================================================
function setupMediaInModal() {
  const modalBody = document.querySelector('#postModal .modal-body');
  if (!modalBody) return;
  if (!modalBody.id) modalBody.id = 'modalComposerBody';

  mediaComposer = setupMediaComposer({
    composerContainerId: 'modalComposerBody',
    onMediaChange: (files) => {
      const btn = document.querySelector('#postModal .toolbar-btn[data-type="media"]');
      if (btn) btn.style.color = files.length > 0 ? 'var(--primary)' : '';
    },
  });

  const toolbar = document.querySelector('#postModal .toolbar-icons');
  if (toolbar) {
    const imgBtn = toolbar.querySelector('.toolbar-btn');
    if (imgBtn) {
      imgBtn.setAttribute('data-type', 'media');
      imgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mediaComposer.openFilePicker();
      });
    }
  }
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
// ABAS DO FEED
// ============================================================
function setupFeedTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFeedTab = btn.getAttribute('data-tab');

      if (activeFeedTab === 'seguindo') {
        loadFollowingFeed();
      } else {
        loadFeed();
      }
    });
  });
}

// ============================================================
// FEED — "Para você"
// ============================================================
async function loadFeed() {
  const container = document.getElementById('postsContainer');
  if (!container) return;

  abortFeedListeners();

  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Carregando...</div>';

  try {
    const posts = await getPosts(20);

    if (currentProfile) {
      const ids = posts.map(p => p.id);
      likedPostIds = await getLikedPostIds(ids);
      repostedPostIds = await getRepostedPostIds(ids);
    }

    renderPosts(posts, container, 'feed');
    await loadQuoteCards(container);
  } catch (err) {
    console.error('Erro ao carregar feed:', err);
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--danger)">Erro ao carregar posts.</div>';
  }
}

// ============================================================
// FEED — "Seguindo"
// ============================================================
async function loadFollowingFeed() {
  const container = document.getElementById('postsContainer');
  if (!container) return;

  abortFeedListeners();

  if (unsubscribeFollowingFeed) {
    unsubscribeFollowingFeed();
    unsubscribeFollowingFeed = null;
  }

  if (!currentProfile) {
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-secondary)">
        <p style="font-size:18px;margin-bottom:8px;">🔐 Faça login para ver o feed de seguidos</p>
        <p style="font-size:14px;">Entre na sua conta para seguir pessoas e ver os posts delas aqui.</p>
      </div>`;
    return;
  }

  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Carregando...</div>';

  try {
    const posts = await getFollowingFeed(currentProfile.id, 20);

    if (currentProfile) {
      const ids = posts.map(p => p.id);
      if (ids.length > 0) {
        likedPostIds = await getLikedPostIds(ids);
        repostedPostIds = await getRepostedPostIds(ids);
      }
    }

    if (posts.length === 0) {
      container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-secondary)">
          <p style="font-size:18px;margin-bottom:8px;">👥 Nada por aqui ainda</p>
          <p style="font-size:14px;">Siga pessoas para ver os posts delas aqui!</p>
        </div>`;
      return;
    }

    renderPosts(posts, container, 'feed');
    await loadQuoteCards(container);

    const followingIds = await getFollowingIds(currentProfile.id);
    unsubscribeFollowingFeed = subscribeToFollowingFeed(followingIds, (newPost) => {
      const exists = document.querySelector(`[data-post-id="${newPost.id}"]`);
      if (!exists && activeFeedTab === 'seguindo') prependPost(newPost);
    });

  } catch (err) {
    console.error('[seguindo] Erro ao carregar feed de seguidos:', err);
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger)">
      Erro ao carregar. Tente novamente.<br>
      <small style="color:var(--text-secondary);font-size:11px;">${err?.message ?? ''}</small>
    </div>`;
  }
}

// ============================================================
// CARREGA QUOTE CARDS
// ============================================================
async function loadQuoteCards(container) {
  const placeholders = container.querySelectorAll('.quote-placeholder[data-quoted-id]');
  for (const placeholder of placeholders) {
    const quotedId = placeholder.dataset.quotedId;
    try {
      const originalPost = await getOriginalPost(quotedId);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = createQuoteCardHTML(originalPost);
      const newCard = tempDiv.firstElementChild;

      newCard.addEventListener('click', (e) => {
        e.stopPropagation();
        openPostDetailModal(quotedId);
      });

      placeholder.replaceWith(newCard);
    } catch (_) {
      placeholder.remove();
    }
  }
}

// ============================================================
// ABORT CONTROLLERS
// ============================================================
function abortFeedListeners() {
  feedListenersController?.abort();
  feedListenersController = new AbortController();
}

function abortProfileListeners() {
  profileListenersController?.abort();
  profileListenersController = new AbortController();
}

// ============================================================
// RENDER POSTS
// ============================================================
function renderPosts(posts, containerElement, context = 'feed') {
  if (posts.length === 0) {
    containerElement.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Nenhum post ainda. Seja o primeiro! 🚀</div>';
    return;
  }
  if (context === 'profile') abortProfileListeners();
  containerElement.innerHTML = posts.map(post => createPostHTML(post)).join('');
  attachPostEventListeners(containerElement, context);
  attachQuoteCardListeners(containerElement);
}

// ============================================================
// CRIA HTML DO POST
// ============================================================
function createPostHTML(post) {
  const isLiked = likedPostIds.has(post.id);
  const isReposted = repostedPostIds.has(post.id);
  const timeAgo = formatTimeAgo(post.created_at);
  const userAvatar = currentProfile?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;
  const authorAvatar = post.author?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;

  const isMyPost = currentProfile && currentProfile.id === post.author?.id;

  const optionsMenu = isMyPost ? `
    <div class="post-options-wrapper">
      <button class="post-options-btn" data-post-id="${post.id}" style="
        background:none;border:none;cursor:pointer;
        color:var(--text-secondary);font-size:20px;
        padding:2px 8px;border-radius:6px;line-height:1;
        transition:background 0.2s;
      ">⋮</button>
    </div>
  ` : '';

  const repostIndicator = post.reposted_by ? `
    <div style="
      display:flex;align-items:center;gap:6px;
      color:var(--text-secondary);font-size:12px;
      padding:0 0 6px 52px;
    ">
      🔁 <span>${escapeHtml(post.reposted_by_name ?? '')} repostou</span>
    </div>
  ` : '';

  const mediaGrid = post.media_urls?.length
    ? createMediaGridHTML(post.media_urls, post.id)
    : '';

  const quoteCard = post.is_quote && post.quoted_post_id
    ? `<div class="quote-placeholder" data-quoted-id="${post.quoted_post_id}">
        <div style="
          margin-top:10px;border:1px solid var(--border);
          border-radius:12px;padding:10px 14px;
          background:var(--dark-bg);
          color:var(--text-secondary);font-size:13px;
        ">Carregando post citado...</div>
       </div>`
    : '';

  return `
    <div class="post-card" data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}" style="flex-direction:column;cursor:pointer;">
      ${repostIndicator}
      <div class="post-main" style="display:flex;gap:16px;width:100%;">
        <img src="${authorAvatar}" class="avatar clickable-avatar" data-handle="${post.author?.handle}" style="cursor:pointer;">
        <div class="post-content" style="flex:1;min-width:0;">
          <div class="post-header" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;width:100%;">
            <span class="post-author clickable-avatar" data-handle="${post.author?.handle}" style="cursor:pointer;">
              ${escapeHtml(post.author?.name ?? 'Usuário')}
            </span>
            <span class="post-handle">@${escapeHtml(post.author?.handle ?? '')}</span>
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
              <span class="post-time" style="margin-left:0;">${timeAgo}</span>
              ${optionsMenu}
            </div>
          </div>
          <p class="post-text post-clickable-body" data-post-id="${post.id}">${escapeHtml(post.content)}</p>
          ${mediaGrid}
          ${quoteCard}
          <div class="post-actions">
            <button class="post-action reply-action" title="Responder" data-post-id="${post.id}" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;color:inherit;font-size:inherit;padding:4px 8px;">
              💬 <span class="reply-count">${post.replies_count ?? 0}</span>
            </button>
            <button class="post-action like-action ${isLiked ? 'liked' : ''}"
                 title="Curtir"
                 data-post-id="${post.id}"
                 data-author-id="${post.author?.id ?? ''}"
                 data-liked="${isLiked}"
                 style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;color:inherit;font-size:inherit;padding:4px 8px;">
              ❤️ <span class="like-count">${post.likes_count ?? 0}</span>
            </button>
            <button class="post-action repost-action ${isReposted ? 'reposted' : ''}"
                 title="Republicar"
                 data-post-id="${post.id}"
                 data-author-id="${post.author?.id ?? ''}"
                 data-reposted="${isReposted}"
                 style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;
                        color:${isReposted ? 'var(--success, #17bf63)' : 'inherit'};
                        font-size:inherit;padding:4px 8px;transition:color 0.2s;">
              🔁 <span class="repost-count">${post.reposts_count ?? 0}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="post-replies-section" id="replies-${post.id}" style="display:none;">
        <div class="reply-composer">
          <img src="${userAvatar}" class="reply-avatar">
          <div class="reply-input-wrapper">
            <textarea class="reply-input" id="reply-input-${post.id}" placeholder="Postar sua resposta..." rows="1"></textarea>
            <div class="reply-toolbar">
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
function attachPostEventListeners(container = document, context = 'feed') {
  const signal = context === 'feed'
    ? feedListenersController.signal
    : profileListenersController.signal;

  // ── MENU DE OPÇÕES ────────────────────────────────────────
  container.querySelectorAll('.post-options-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('floatingPostMenu')?.remove();

      const postId = btn.dataset.postId;
      const rect = btn.getBoundingClientRect();

      const menu = document.createElement('div');
      menu.id = 'floatingPostMenu';
      menu.dataset.postId = postId;
      menu.style.cssText = `
        position:fixed;
        top:${rect.bottom + 4}px;
        left:${Math.min(rect.right - 190, window.innerWidth - 198)}px;
        z-index:9999;
        background:var(--dark-bg-secondary);
        border:1px solid var(--border);
        border-radius:10px;
        min-width:190px;
        box-shadow:0 4px 20px rgba(0,0,0,0.4);
        overflow:hidden;
      `;

      menu.innerHTML = `
        <button class="post-option-item fm-edit" data-post-id="${postId}" style="display:block;width:100%;text-align:left;padding:11px 16px;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:14px;">✏️ Editar</button>
        <button class="post-option-item fm-delete" data-post-id="${postId}" style="display:block;width:100%;text-align:left;padding:11px 16px;background:none;border:none;cursor:pointer;color:var(--danger,#e0245e);font-size:14px;">🗑️ Apagar</button>
      `;

      document.body.appendChild(menu);

      menu.querySelectorAll('button').forEach(b => {
        b.addEventListener('mouseenter', () => b.style.background = 'var(--border)');
        b.addEventListener('mouseleave', () => b.style.background = 'none');
      });

      menu.querySelector('.fm-edit')?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        menu.remove();
        const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
        const currentText = postCard?.querySelector('.post-text')?.textContent ?? '';
        const editModal = document.getElementById('editPostModal');
        const editInput = document.getElementById('editPostInput');
        if (editModal && editInput) {
          currentEditingPostId = postId;
          editInput.value = currentText;
          editModal.classList.add('active');
          editInput.focus();
        }
      });

      menu.querySelector('.fm-delete')?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        menu.remove();
        if (confirm('Tem certeza que deseja apagar este post permanentemente?')) {
          try {
            const { deletePost } = await import('./posts.js');
            await deletePost(postId);
            document.querySelector(`.post-card[data-post-id="${postId}"]`)?.remove();
            showNotification('Post apagado 🗑️');
          } catch (err) {
            showNotification('Erro ao apagar post.');
          }
        }
      });

    }, { signal });
  });

  document.addEventListener('click', () => {
    document.getElementById('floatingPostMenu')?.remove();
  }, { signal });

  // ── LIKE ──────────────────────────────────────────────────
  container.querySelectorAll('.like-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (!currentProfile) {
        showNotification('Faça login para curtir! 🔐');
        return;
      }

      const postId = btn.dataset.postId;
      const authorId = btn.dataset.authorId;
      const wasLiked = btn.dataset.liked === 'true';
      const countEl = btn.querySelector('.like-count');
      const currentCount = parseInt(countEl?.textContent) || 0;
      const newLiked = !wasLiked;
      const newCount = Math.max(0, currentCount + (newLiked ? 1 : -1));

      const allBtns = document.querySelectorAll(`.like-action[data-post-id="${postId}"]`);
      allBtns.forEach(b => {
        b.dataset.liked = String(newLiked);
        b.classList.toggle('liked', newLiked);
        b.style.pointerEvents = 'none';
        const c = b.querySelector('.like-count');
        if (c) c.textContent = newCount;
      });

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
        allBtns.forEach(b => {
          b.dataset.liked = String(wasLiked);
          b.classList.toggle('liked', wasLiked);
          const c = b.querySelector('.like-count');
          if (c) c.textContent = currentCount;
        });
        if (wasLiked) likedPostIds.add(postId);
        else likedPostIds.delete(postId);
        if (err?.status !== 409) showNotification('Erro ao curtir. Tente novamente.');
      } finally {
        allBtns.forEach(b => { b.style.pointerEvents = ''; });
      }
    }, { signal });
  });

  // ── REPOST ────────────────────────────────────────────────
  attachRepostListeners(container, currentProfile, signal, {
    showNotification,
    createNotification: async (payload) => {
      try { await createNotification(payload); } catch (_) {}
    },
    onRepostSuccess: (postId) => { repostedPostIds.add(postId); },
    onUndoRepostSuccess: (postId) => { repostedPostIds.delete(postId); },
    prependPost: () => {
      if (activeFeedTab === 'para-voce') loadFeed();
      else loadFollowingFeed();
    },
  });

  // ── MÍDIA ─────────────────────────────────────────────────
  attachMediaListeners(container, signal);

  // ── QUOTE CARD ────────────────────────────────────────────
  container.querySelectorAll('.quote-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const quotedId = card.dataset.quotedPostId;
      if (quotedId) openPostDetailModal(quotedId);
    }, { signal });
  });

  // ── AVATAR / NOME → PERFIL ────────────────────────────────
  container.querySelectorAll('.clickable-avatar').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const handle = el.dataset.handle;
      if (!handle) return;
      document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
      document.getElementById('profile-page').classList.add('active');
      loadProfileByHandle(handle);
    }, { signal });
  });

  // ── CLIQUE NO CARD → MODAL DE DETALHE ────────────────────
  container.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (
        e.target.closest('.post-actions') ||
        e.target.closest('.clickable-avatar') ||
        e.target.closest('.post-options-wrapper') ||
        e.target.closest('.post-replies-section') ||
        e.target.closest('.media-grid') ||
        e.target.closest('.quote-card')
      ) return;
      const postId = card.dataset.postId;
      if (postId) openPostDetailModal(postId);
    }, { signal });
  });

  // ── ABRIR COMENTÁRIOS ─────────────────────────────────────
  container.querySelectorAll('.reply-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const postCard = btn.closest('.post-card');
      const repliesSection = postCard.querySelector('.post-replies-section');
      if (!repliesSection) return;

      if (repliesSection.style.display === 'none') {
        repliesSection.style.display = 'block';
        postCard.querySelector('.reply-input')?.focus();
        const repliesList = postCard.querySelector('.replies-list');
        await loadRepliesForPost(postId, repliesList);
      } else {
        repliesSection.style.display = 'none';
      }
    }, { signal });
  });

  // ── ENVIAR COMENTÁRIO ─────────────────────────────────────
  container.querySelectorAll('.reply-submit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (!currentProfile) {
        showNotification('Faça login para comentar! 🔐');
        return;
      }

      const postId = btn.dataset.postId;
      const authorId = btn.dataset.authorId;
      const postCard = btn.closest('.post-card');
      const input = postCard.querySelector('.reply-input');
      const content = input?.value.trim();
      if (!content) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        await addReply(postId, content);

        const userAvatar = currentProfile.avatar_url
          || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentProfile.handle}`;

        const newReplyHTML = `
          <div class="reply-item" style="animation:slideDown 0.3s ease;">
            <img src="${userAvatar}" class="reply-avatar" style="width:30px;height:30px;">
            <div class="reply-bubble">
              <div class="reply-header">
                <div>
                  <span class="reply-author">${escapeHtml(currentProfile.name)}</span>
                  <span class="reply-handle">@${escapeHtml(currentProfile.handle)}</span>
                </div>
              </div>
              <p style="font-size:13.5px;color:var(--text-primary);line-height:1.4;">${escapeHtml(content)}</p>
            </div>
          </div>
        `;

        document.querySelectorAll(`[id="replies-list-${postId}"]`).forEach(list => {
          const emptyMsg = list.querySelector('p');
          if (emptyMsg) emptyMsg.remove();
          list.insertAdjacentHTML('afterbegin', newReplyHTML);
        });

        document.querySelectorAll(`.reply-action[data-post-id="${postId}"] .reply-count`).forEach(el => {
          el.textContent = parseInt(el.textContent) + 1;
        });

        document.querySelectorAll(`[id="reply-input-${postId}"]`).forEach(inp => inp.value = '');

        showNotification('Comentário enviado! 💬');

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
        btn.disabled = false;
        btn.textContent = 'Responder';
      }
    }, { signal });
  });
}

// ============================================================
// MODAL DE DETALHE DO POST
// ============================================================
function setupPostDetailModal() {
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
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const authorName = postCard?.querySelector('.post-author')?.textContent?.trim() ?? 'Usuário';
    const authorHandle = postCard?.querySelector('.post-handle')?.textContent?.trim() ?? '';
    const postText = postCard?.querySelector('.post-text')?.textContent?.trim() ?? '';
    const postTime = postCard?.querySelector('.post-time')?.textContent?.trim() ?? '';
    const authorAvatar = postCard?.querySelector('.avatar')?.src ?? '';
    const likeBtn = postCard?.querySelector('.like-action');
    const likeCount = likeBtn?.querySelector('.like-count')?.textContent ?? '0';
    const replyCount = postCard?.querySelector('.reply-count')?.textContent ?? '0';
    const isLiked = likedPostIds.has(postId);
    const authorId = postCard?.dataset?.authorId ?? likeBtn?.dataset?.authorId ?? '';

    const mediaGrid = postCard?.querySelector('.media-grid');
    const mediaHtml = mediaGrid ? mediaGrid.outerHTML : '';
    const quoteCard = postCard?.querySelector('.quote-card');
    const quoteCardHtml = quoteCard ? quoteCard.outerHTML : '';

    const userAvatar = currentProfile?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;
    const handle = authorHandle.replace('@', '');

    content.innerHTML = `
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
          <p style="font-size:20px;color:var(--text-primary);line-height:1.5;margin-top:12px;word-break:break-word;white-space:pre-wrap;">
            ${escapeHtml(postText)}
          </p>
          ${mediaHtml}
          ${quoteCardHtml}
          <p style="color:var(--text-secondary);font-size:13px;margin-top:12px;">${postTime}</p>
        </div>
      </div>

      <div style="display:flex;gap:20px;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:16px;">
        <span style="color:var(--text-secondary);font-size:14px;">
          <strong style="color:var(--text-primary);">${replyCount}</strong> Respostas
        </span>
        <span style="color:var(--text-secondary);font-size:14px;">
          <strong id="detailLikeCountStat">${likeCount}</strong>&nbsp;Curtidas
        </span>
      </div>

      <div style="display:flex;gap:24px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
        <button id="detailLikeBtn"
          data-post-id="${postId}"
          data-author-id="${authorId}"
          data-liked="${isLiked}"
          class="like-action ${isLiked ? 'liked' : ''}"
          style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;
                 color:${isLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)'};
                 font-size:15px;font-weight:600;transition:color 0.2s;padding:0;">
          ${isLiked ? '❤️' : '🤍'} <span class="like-count">${likeCount}</span>
        </button>
        <button id="detailReplyToggle"
          style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;
                 color:var(--text-secondary);font-size:15px;font-weight:600;">
          💬 Responder
        </button>
      </div>

      <div id="detailReplyComposer" style="display:none;margin-bottom:16px;">
        <div style="display:flex;gap:12px;">
          <img src="${userAvatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;">
          <div style="flex:1;">
            <textarea id="detailReplyInput" placeholder="Postar sua resposta..." rows="3"
              style="width:100%;resize:none;background:var(--dark-bg);border:1px solid var(--border);
                     border-radius:12px;padding:10px 14px;color:var(--text-primary);font-size:14px;
                     outline:none;font-family:inherit;"></textarea>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
                <input type="checkbox" id="detailReplyPrivacy">
                🔒 Apenas o autor pode ver
              </label>
              <button id="detailReplySubmit" data-post-id="${postId}" data-author-id="${authorId}"
                style="background:var(--primary);color:white;border:none;border-radius:20px;
                       padding:8px 20px;font-size:14px;font-weight:600;cursor:pointer;">
                Responder
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="detailRepliesList">
        <p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:14px;">Carregando respostas...</p>
      </div>
    `;

    if (mediaHtml) {
      const { attachMediaListeners: attachMedia } = await import('./Midia.js');
      const modalContent = document.getElementById('postDetailContent');
      if (modalContent) attachMedia(modalContent, new AbortController().signal);
    }

    if (quoteCardHtml) {
      const modalContent = document.getElementById('postDetailContent');
      modalContent?.querySelectorAll('.quote-card').forEach(card => {
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          const qId = card.dataset.quotedPostId;
          if (qId) openPostDetailModal(qId);
        });
      });
    }

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

    const detailLikeBtn = document.getElementById('detailLikeBtn');
    detailLikeBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentProfile) { showNotification('Faça login para curtir! 🔐'); return; }

      const pid = detailLikeBtn.dataset.postId;
      const aid = detailLikeBtn.dataset.authorId;
      const wasLiked = detailLikeBtn.dataset.liked === 'true';
      const currentCount = parseInt(detailLikeBtn.querySelector('.like-count')?.textContent) || 0;
      const newLiked = !wasLiked;
      const newCount = Math.max(0, currentCount + (newLiked ? 1 : -1));

      const allBtns = document.querySelectorAll(`.like-action[data-post-id="${pid}"]`);
      allBtns.forEach(b => {
        b.dataset.liked = String(newLiked);
        b.classList.toggle('liked', newLiked);
        b.style.pointerEvents = 'none';
        const c = b.querySelector('.like-count');
        if (c) c.textContent = newCount;
      });

      const statEl = document.getElementById('detailLikeCountStat');
      if (statEl) statEl.textContent = newCount;

      const iconSpan = detailLikeBtn.childNodes[0];
      if (iconSpan) iconSpan.textContent = newLiked ? '❤️' : '🤍';
      detailLikeBtn.style.color = newLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)';

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
        allBtns.forEach(b => {
          b.dataset.liked = String(wasLiked);
          b.classList.toggle('liked', wasLiked);
          const c = b.querySelector('.like-count');
          if (c) c.textContent = currentCount;
        });
        if (statEl) statEl.textContent = currentCount;
        const iconSpanRev = detailLikeBtn.childNodes[0];
        if (iconSpanRev) iconSpanRev.textContent = wasLiked ? '❤️' : '🤍';
        detailLikeBtn.style.color = wasLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)';
        if (wasLiked) likedPostIds.add(pid);
        else likedPostIds.delete(pid);
        if (err?.status !== 409) showNotification('Erro ao curtir.');
      } finally {
        allBtns.forEach(b => { b.style.pointerEvents = ''; });
      }
    });

    document.getElementById('detailReplyToggle')?.addEventListener('click', () => {
      const composer = document.getElementById('detailReplyComposer');
      if (!composer) return;
      if (composer.style.display === 'none') {
        composer.style.display = 'block';
        document.getElementById('detailReplyInput')?.focus();
      } else {
        composer.style.display = 'none';
      }
    });

    document.getElementById('detailReplySubmit')?.addEventListener('click', async (e) => {
      if (!currentProfile) { showNotification('Faça login para comentar! 🔐'); return; }
      const btn = e.currentTarget;
      const pid = btn.dataset.postId;
      const aid = btn.dataset.authorId;
      const input = document.getElementById('detailReplyInput');
      const privacy = document.getElementById('detailReplyPrivacy');
      const text = input?.value.trim();
      if (!text) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        await addReply(pid, text, privacy?.checked ?? false);
        if (input) input.value = '';
        if (privacy) privacy.checked = false;
        document.getElementById('detailReplyComposer').style.display = 'none';
        showNotification(privacy?.checked ? 'Resposta privada enviada! 🤫' : 'Resposta enviada! 💬');

        document.querySelectorAll(`.reply-action[data-post-id="${pid}"] .reply-count`).forEach(el => {
          el.textContent = parseInt(el.textContent || '0') + 1;
        });

        if (aid && aid !== currentProfile.id) {
          await createNotification({ toUserId: aid, actorId: currentProfile.id, type: NOTIF_TYPES.REPLY, postId: pid });
        }

        await loadDetailReplies(pid);
      } catch (err) {
        showNotification('Erro ao enviar resposta.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Responder';
      }
    });

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
        <div style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);">
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
            </div>
            <p style="font-size:14px;color:var(--text-primary);line-height:1.5;word-break:break-word;">${escapeHtml(r.content)}</p>
          </div>
        </div>
      `;
    }).join('');

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
// REPLIES INLINE
// ============================================================
async function loadRepliesForPost(postId, listElement = null) {
  const repliesList = listElement || document.getElementById(`replies-list-${postId}`);
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
  attachPostEventListeners(container, 'feed');

  if (post.is_quote && post.quoted_post_id) {
    loadQuoteCards(container);
  }
}

// ============================================================
// POST COMPOSER
// ============================================================
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

  const closeModal = () => {
    modal.classList.remove('active');
    if (modalInput) modalInput.value = '';
    mediaComposer?.clearFiles();
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  submitBtn?.addEventListener('click', async () => {
    await handleSubmitPost(modalInput?.value ?? '');
    closeModal();
  });
}

async function handleSubmitPost(content, source = 'feed') {
  content = content?.trim();
  const hasModalMedia = source === 'modal' && mediaComposer?.hasFiles();
  const hasFeedMedia  = source === 'feed'  && feedSelectedFiles.length > 0;
  const hasMedia = hasModalMedia || hasFeedMedia;

  if (!content && !hasMedia) return;
  if (!currentProfile) { showNotification('Faça login para postar! 🔐'); return; }

  const postInput   = document.getElementById('postInput');
  const modalInput  = document.getElementById('modalPostInput');
  const previewArea = document.getElementById('feedImgPreview');

  if (postInput)  { postInput.value = ''; postInput.style.height = 'auto'; }
  if (modalInput) modalInput.value = '';

  try {
    let mediaUrls = [];

    if (hasModalMedia) {
      showNotification('Enviando fotos... 📸');
      mediaUrls = await uploadPostMedia(mediaComposer.getFiles());
      mediaComposer.clearFiles();
    }

    if (hasFeedMedia) {
      showNotification('Enviando fotos... 📸');
      mediaUrls = await uploadPostMedia(feedSelectedFiles);
      feedSelectedFiles = [];
      renderFeedImgPreview(previewArea);
    }

    if (mediaUrls.length > 0) {
      await createPostWithMedia(content || '', mediaUrls);
    } else {
      await createPost(content);
    }

    showNotification('Post criado! ✨');
  } catch (err) {
    console.error('Erro ao criar post:', err);
    showNotification(`Erro: ${err.message || 'Tente novamente.'}`);
  }
}
function startRealtimeFeed() {
  if (unsubscribePosts) unsubscribePosts();
  unsubscribePosts = subscribeToNewPosts((newPost) => {
    if (activeFeedTab !== 'para-voce') return;
    const exists = document.querySelector(`[data-post-id="${newPost.id}"]`);
    if (!exists) prependPost(newPost);
  });
}

// ============================================================
// PERFIL
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
    if (tabType === 'midia') {
      const mediaPosts = await getMediaPostsByUser(profileToLoad.id);
      renderProfileMediaGrid(mediaPosts, contentEl);
      return;
    }

    let postsToRender = [];

    if (tabType === 'posts') {
      const [myPosts, myReposts] = await Promise.all([
        getPostsByUser(profileToLoad.id),
        getRepostedPosts(profileToLoad.id),
      ]);
      postsToRender = [...myPosts, ...myReposts].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    } else if (tabType === 'curtidos') {
      if (currentProfile && profileToLoad.id === currentProfile.id) {
        postsToRender = await getLikedPosts(profileToLoad.id);
      } else {
        contentEl.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-secondary);">Esta informação é privada. 🔒</p>';
        return;
      }
    }

    postsToRender = postsToRender.filter(p => p != null);

    if (postsToRender.length === 0) {
      const msg = tabType === 'curtidos' ? 'Nenhum post curtido ainda. ❤️' : 'Nenhum post encontrado. 🚀';
      contentEl.innerHTML = `<p style="padding:40px;text-align:center;color:var(--text-secondary)">${msg}</p>`;
      return;
    }

    renderPosts(postsToRender, contentEl, 'profile');
    await loadQuoteCards(contentEl);
  } catch (err) {
    console.error(err);
    contentEl.innerHTML = '<p style="color:var(--danger);text-align:center;">Erro ao carregar conteúdo.</p>';
  }
}

async function loadProfilePage() {
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

    document.getElementById('msgProfileBtn')?.remove();
    document.getElementById('followProfileBtn')?.remove();

    document.getElementById('profileContent').innerHTML =
      '<p style="padding:40px;text-align:center;color:var(--text-secondary);">Faça login para visualizar seus posts. 🚀</p>';
    return;
  }

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

  syncProfileCounts(profile.id).then(counts => {
    if (!counts) return;
    const vals = document.querySelectorAll('.stat-value');
    if (vals.length >= 2) {
      vals[0].textContent = counts.following_count;
      vals[1].textContent = counts.followers_count;
    }
  });

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
      const controller = new AbortController();
      profileBtnControllers.push(controller);
      const signal = controller.signal;

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

      const followBtn = document.createElement('button');
      followBtn.id = 'followProfileBtn';
      followBtn.className = 'edit-profile-btn';
      followBtn.style.cssText = 'margin-left:8px;';

      let alreadyFollowing = false;
      try { alreadyFollowing = await isFollowing(profile.id); } catch (_) {}

      const setFollowState = (following) => {
        followBtn.textContent = following ? '✓ Seguindo' : '+ Seguir';
        followBtn.style.background = following ? 'var(--primary)' : '';
        followBtn.style.color = following ? 'white' : '';
      };
      setFollowState(alreadyFollowing);

      followBtn.addEventListener('click', async () => {
        followBtn.disabled = true;
        try {
          const currentlyFollowing = followBtn.textContent.includes('Seguindo');
          if (currentlyFollowing) {
            await unfollowUserAndSync(currentProfile.id, profile.id);
            setFollowState(false);
            const statVals = document.querySelectorAll('.stat-value');
            if (statVals.length >= 2) {
              const cur = parseInt(statVals[1].textContent) || 0;
              statVals[1].textContent = Math.max(0, cur - 1);
            }
          } else {
            await followUserAndSync(currentProfile.id, profile.id);
            setFollowState(true);
            const statVals = document.querySelectorAll('.stat-value');
            if (statVals.length >= 2) {
              const cur = parseInt(statVals[1].textContent) || 0;
              statVals[1].textContent = cur + 1;
            }
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
const renderedMessageIds = new Set();
let currentOpenConvId = null;

async function loadMessagesPage() {
  const listEl = document.getElementById('conversationsList');
  const chatArea = document.getElementById('chatArea');
  if (!listEl) return;

  if (chatArea) {
    chatArea.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-secondary);">
        <div style="font-size:48px;opacity:0.4;">💬</div>
        <p style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0;">Suas mensagens</p>
        <p style="font-size:14px;margin:0;">Selecione uma conversa para começar</p>
      </div>
    `;
  }

  listEl.innerHTML = '<p style="padding:20px;text-align:center;">Carregando...</p>';

  try {
    const convs = await getConversations();

    if (convs.length === 0) {
      listEl.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--text-secondary);">
          <div style="font-size:40px;margin-bottom:12px;">✉️</div>
          <p style="font-size:15px;font-weight:600;color:var(--text-primary);margin:0 0 6px;">Nenhuma conversa ainda</p>
          <p style="font-size:13px;margin:0;">Visite o perfil de alguém e clique em "✉ Mensagem"</p>
        </div>`;
      return;
    }

    listEl.innerHTML = convs.map(c => {
      const avatar = c.otherUser?.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.otherUser?.handle}`;
      const preview = c.lastMessage
        ? `<p class="conversation-preview" style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;margin:2px 0 0;">${escapeHtml(c.lastMessage.content)}</p>`
        : `<p class="conversation-preview" style="font-size:12px;color:var(--text-secondary);font-style:italic;margin:2px 0 0;">Sem mensagens</p>`;

      return `
        <div class="conversation-item" data-id="${c.id}" style="cursor:pointer;">
          <img src="${avatar}" alt="Avatar" class="conversation-avatar">
          <div class="conversation-info" style="flex:1;min-width:0;">
            <p class="conversation-name" style="margin:0;">${escapeHtml(c.otherUser?.name ?? '')}</p>
            ${preview}
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const convId = item.dataset.id;
        const conv = convs.find(c => c.id === convId);
        if (conv) openChat(convId, conv.otherUser);
      });
    });

  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p style="color:var(--danger);padding:20px;">Erro ao carregar conversas.</p>';
  }
}

async function openChat(convId, otherUser) {
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;

  if (unsubscribeCurrentChat) {
    unsubscribeCurrentChat();
    unsubscribeCurrentChat = null;
  }

  renderedMessageIds.clear();
  currentOpenConvId = convId;

  chatArea.innerHTML = `
    <div style="padding:16px;border-bottom:1px solid var(--border);background:var(--dark-bg-secondary);display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <img src="${otherUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser?.handle}`}"
           style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
      <div>
        <strong style="font-size:15px;">${escapeHtml(otherUser?.name ?? '')}</strong>
        <span style="color:var(--text-secondary);font-size:13px;margin-left:6px;">@${escapeHtml(otherUser?.handle ?? '')}</span>
      </div>
    </div>
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--dark-bg);">
      <p id="chatLoadingMsg" style="text-align:center;color:var(--text-secondary);">Carregando histórico...</p>
    </div>
    <div style="padding:16px;border-top:1px solid var(--border);display:flex;gap:10px;background:var(--dark-bg-secondary);flex-shrink:0;">
      <input type="text" id="msgInput" placeholder="Envie uma mensagem..."
        style="flex:1;padding:12px 16px;border-radius:20px;border:1px solid var(--border);background:var(--dark-bg);color:var(--text-primary);outline:none;font-size:14px;">
      <button id="sendMsgBtn" class="post-submit-btn" style="padding:0 24px;">Enviar</button>
    </div>
  `;

  unsubscribeCurrentChat = subscribeToMessages(convId, (newMsg) => {
    if (renderedMessageIds.has(newMsg.id)) return;
    renderedMessageIds.add(newMsg.id);
    appendMessageToUI(newMsg);
    updateConversationPreview(convId, newMsg.content);
  });

  try {
    const msgs = await getMessages(convId);
    document.getElementById('chatLoadingMsg')?.remove();
    const container = document.getElementById('chatMessages');

    if (container && msgs.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">Diga olá! 👋</p>';
    } else {
      msgs.forEach(msg => {
        renderedMessageIds.add(msg.id);
        appendMessageToUI(msg);
      });
    }
  } catch (err) {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px;">Erro ao carregar mensagens.</p>';
  }

  const input = document.getElementById('msgInput');
  const btn = document.getElementById('sendMsgBtn');
  if (!input || !btn) return;

  const handleSend = async () => {
    const content = input.value.trim();
    if (!content || !currentProfile) return;

    input.value = '';
    input.focus();

    const optimisticMsg = {
      id: `optimistic-${Date.now()}`,
      content,
      sender_id: currentProfile.id,
      conversation_id: convId,
      created_at: new Date().toISOString(),
    };
    renderedMessageIds.add(optimisticMsg.id);
    appendMessageToUI(optimisticMsg);
    updateConversationPreview(convId, content);

    try {
      const saved = await sendMessage(convId, content);
      renderedMessageIds.add(saved.id);
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      showNotification('Erro ao enviar mensagem.');
    }
  };

  btn.addEventListener('click', handleSend);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSend();
  });

  input.focus();
}

function appendMessageToUI(msg) {
  const container = document.getElementById('chatMessages');
  if (!container || !currentProfile) return;

  const placeholder = container.querySelector('p');
  if (placeholder && (placeholder.textContent.includes('Diga olá') || placeholder.textContent.includes('Carregando'))) {
    placeholder.remove();
  }

  const isMe = msg.sender_id === currentProfile.id;
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    max-width:75%;padding:10px 14px;border-radius:18px;
    font-size:14px;line-height:1.5;word-break:break-word;
    animation:slideDown 0.2s ease;
    align-self:${isMe ? 'flex-end' : 'flex-start'};
    ${isMe
      ? 'background:var(--primary);color:white;border-bottom-right-radius:4px;'
      : 'background:var(--dark-bg-secondary);color:var(--text-primary);border-bottom-left-radius:4px;border:1px solid var(--border);'
    }
  `;
  bubble.textContent = msg.content;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function updateConversationPreview(convId, content) {
  const item = document.querySelector(`.conversation-item[data-id="${convId}"]`);
  if (!item) return;
  const preview = item.querySelector('.conversation-preview');
  if (preview) preview.textContent = content;
  const list = item.parentElement;
  if (list && list.firstChild !== item) list.prepend(item);
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
    if (panel.classList.contains('active')) await renderNotifList();
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

  exploreContent.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Carregando... 🔄</p>';

  try {
    const posts = await getPosts(50);

    // ── USUÁRIOS SUGERIDOS DINÂMICOS ──────────────────────────
    let suggestedUsers = [];

    if (currentProfile) {
      const followingIds = await getFollowingIds(currentProfile.id);

      const authorMap = new Map();
      for (const post of posts) {
        const author = post.author;
        if (!author) continue;
        if (author.id === currentProfile.id) continue;
        if (followingIds.includes(author.id)) continue;
        if (!authorMap.has(author.id)) authorMap.set(author.id, author);
      }

      const authorScore = new Map();
      for (const post of posts) {
        const author = post.author;
        if (!author || author.id === currentProfile.id) continue;
        if (followingIds.includes(author.id)) continue;
        const score = (post.likes_count || 0) + (post.replies_count || 0) * 2;
        authorScore.set(author.id, (authorScore.get(author.id) || 0) + score);
      }

      const sorted = [...authorMap.values()].sort((a, b) => {
        const scoreA = (authorScore.get(a.id) || 0) * (0.7 + Math.random() * 0.6);
        const scoreB = (authorScore.get(b.id) || 0) * (0.7 + Math.random() * 0.6);
        return scoreB - scoreA;
      });

      suggestedUsers = sorted.slice(0, 6);
    } else {
      const authorMap = new Map();
      for (const post of posts) {
        if (post.author && !authorMap.has(post.author.id)) {
          authorMap.set(post.author.id, post.author);
        }
      }
      suggestedUsers = [...authorMap.values()].sort(() => Math.random() - 0.5).slice(0, 6);
    }

    // ── POSTS CATEGORIZADOS ───────────────────────────────────
    const topPosts = [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 4);
    const recentPosts = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    const randomPosts = [...posts].sort(() => Math.random() - 0.5).slice(0, 4);

    const renderMiniPost = (post, contextLabel, contextIcon) => {
      const avatar = post.author?.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
      const mediaThumb = post.media_urls?.length
        ? `<img src="${post.media_urls[0]}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-top:6px;" loading="lazy">`
        : '';
      return `
        <div class="explore-post-card" data-post-id="${post.id}" style="cursor:pointer;">
          ${contextLabel ? `<div class="explore-context"><span class="explore-context-icon">${contextIcon}</span> ${contextLabel}</div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;">
            <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"
                 class="explore-avatar-clickable" data-handle="${post.author?.handle}" loading="lazy">
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${escapeHtml(post.author?.name)}</div>
              <div style="color:var(--text-secondary);font-size:12px;">@${escapeHtml(post.author?.handle)}</div>
            </div>
          </div>
          <div style="font-size:14px;color:var(--text-primary);line-height:1.5;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;margin-top:8px;">
            ${escapeHtml(post.content)}
          </div>
          ${mediaThumb}
          <div style="color:var(--text-secondary);font-size:12px;display:flex;justify-content:space-between;margin-top:auto;padding-top:8px;">
            <span style="display:flex;gap:12px;"><span>❤️ ${post.likes_count || 0}</span><span>💬 ${post.replies_count || 0}</span></span>
            <span>📍 PUC</span>
          </div>
        </div>`;
    };

    const renderSuggestedUser = (user) => {
      const avatar = user.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle}`;
      return `
        <div class="suggested-user-card" data-handle="${user.handle}" style="cursor:pointer;">
          <img src="${avatar}" alt="${escapeHtml(user.name)}" loading="lazy">
          <div>
            <h4>${escapeHtml(user.name)}</h4>
            <p>@${escapeHtml(user.handle)}</p>
          </div>
          <button class="btn-follow-small explore-follow-btn" data-user-id="${user.id}" data-handle="${user.handle}">Seguir</button>
        </div>`;
    };

    exploreContent.innerHTML = `
      <div class="explore-sections">
        ${suggestedUsers.length > 0 ? `
        <section>
          <h3 class="explore-section-title">✨ Sugestões para você</h3>
          <div class="suggested-users-row">
            ${suggestedUsers.map(u => renderSuggestedUser(u)).join('')}
          </div>
        </section>` : ''}

        <section>
          <h3 class="explore-section-title">🔥 Em Alta no VazaPUC</h3>
          <div class="explore-grid">${topPosts.map(p => renderMiniPost(p, 'Mais curtidos', '⭐')).join('')}</div>
        </section>

        <section>
          <h3 class="explore-section-title">👀 Descobrir posts</h3>
          <div class="explore-grid">${randomPosts.map(p => renderMiniPost(p, 'Pode te interessar', '💫')).join('')}</div>
        </section>

        <section>
          <h3 class="explore-section-title">🕒 Acabou de vazar</h3>
          <div class="explore-grid">${recentPosts.map(p => renderMiniPost(p, 'Postado recentemente', '✨')).join('')}</div>
        </section>
      </div>`;

    // ── EVENT LISTENERS ───────────────────────────────────────
    exploreContent.querySelectorAll('.explore-post-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.explore-follow-btn') || e.target.closest('.explore-avatar-clickable')) return;
        const postId = card.dataset.postId;
        if (postId) openPostDetailModal(postId);
      });
    });

    exploreContent.querySelectorAll('.explore-avatar-clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const handle = el.dataset.handle;
        if (!handle) return;
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page').classList.add('active');
        loadProfileByHandle(handle);
      });
    });

    exploreContent.querySelectorAll('.suggested-user-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.explore-follow-btn')) return;
        const handle = card.dataset.handle;
        if (!handle) return;
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page').classList.add('active');
        loadProfileByHandle(handle);
      });
    });

    exploreContent.querySelectorAll('.explore-follow-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentProfile) { showNotification('Faça login para seguir! 🔐'); return; }
        const userId = btn.dataset.userId;
        btn.disabled = true;

        if (btn.textContent.includes('Seguindo')) {
          try {
            await unfollowUserAndSync(currentProfile.id, userId);
            btn.textContent = 'Seguir';
            btn.style.background = '';
            btn.style.color = '';
          } catch { showNotification('Erro ao deixar de seguir.'); }
        } else {
          try {
            await followUserAndSync(currentProfile.id, userId);
            btn.textContent = '✓ Seguindo';
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
            await createNotification({
              toUserId: userId,
              actorId: currentProfile.id,
              type: NOTIF_TYPES.FOLLOW,
            });
          } catch { showNotification('Erro ao seguir.'); }
        }
        btn.disabled = false;
      });
    });

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
// ============================================================
// EMOJIS (feed + modal)
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

        // fecha o picker após inserir
        document.getElementById(containerId)?.classList.remove('active');
      });
    });
  };

  renderEmojis('pickerEmojiFeed', 'postInput');
  renderEmojis('pickerEmojiModal', 'modalPostInput');

  const toggleFeed  = document.getElementById('btnEmojiFeed');
  const pickerFeed  = document.getElementById('pickerEmojiFeed');
  const toggleModal = document.getElementById('btnEmojiModal');
  const pickerModal = document.getElementById('pickerEmojiModal');

  toggleFeed?.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    pickerFeed?.classList.toggle('active');
    pickerModal?.classList.remove('active');
  });
  toggleModal?.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    pickerModal?.classList.toggle('active');
    pickerFeed?.classList.remove('active');
  });

  document.addEventListener('click', () => {
    pickerFeed?.classList.remove('active');
    pickerModal?.classList.remove('active');
  });
  pickerFeed?.addEventListener('click',  e => e.stopPropagation());
  pickerModal?.addEventListener('click', e => e.stopPropagation());
}

// ============================================================
// UPLOAD DE IMAGEM NO FEED INLINE
// ============================================================
// ============================================================
// UPLOAD DE IMAGEM NO FEED INLINE
// ============================================================
let feedSelectedFiles = [];

function setupFeedImageUpload() {
  const fileInput   = document.getElementById('feedFileInput');
  const imgBtn      = document.getElementById('btnImgFeed');
  const previewArea = document.getElementById('feedImgPreview');
  if (!fileInput || !imgBtn) return;

  imgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const novos = Array.from(fileInput.files);
    feedSelectedFiles = [...feedSelectedFiles, ...novos].slice(0, 4);
    renderFeedImgPreview(previewArea);
    fileInput.value = '';
  });

  // Botão de imagem do modal
  const modalFileInput = document.getElementById('modalFileInput');
  const btnImgModal    = document.getElementById('btnImgModal');
  const modalPreview   = document.getElementById('modalImgPreview');
  let   modalFiles     = [];

  btnImgModal?.addEventListener('click', (e) => {
    e.stopPropagation();
    modalFileInput?.click();
  });

  modalFileInput?.addEventListener('change', () => {
    const novos = Array.from(modalFileInput.files);
    modalFiles = [...modalFiles, ...novos].slice(0, 4);
    renderImgPreview(modalPreview, modalFiles, (i) => { modalFiles.splice(i, 1); renderImgPreview(modalPreview, modalFiles, arguments.callee); });
    modalFileInput.value = '';
  });
}

function renderFeedImgPreview(previewArea) {
  if (!previewArea) return;
  if (feedSelectedFiles.length === 0) {
    previewArea.style.display = 'none';
    previewArea.innerHTML = '';
    return;
  }
  previewArea.style.display = 'flex';
  previewArea.innerHTML = '';
  feedSelectedFiles.forEach((file, index) => {
    const wrapper = criarThumb(file, () => {
      feedSelectedFiles.splice(index, 1);
      renderFeedImgPreview(previewArea);
    });
    previewArea.appendChild(wrapper);
  });
}

function criarThumb(file, onRemove) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;';
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = document.createElement('img');
    img.src = ev.target.result;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    wrapper.appendChild(img);
  };
  reader.readAsDataURL(file);
  const rm = document.createElement('button');
  rm.textContent = '×';
  rm.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:13px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
  rm.addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
  wrapper.appendChild(rm);
  return wrapper;
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

// ============================================================
// MODAL DE EDITAR POST
// ============================================================
function setupEditPostModal() {
  const modal = document.getElementById('editPostModal');
  const closeBtn = document.getElementById('closeEditPostModal');
  const cancelBtn = document.getElementById('cancelEditPostBtn');
  const saveBtn = document.getElementById('saveEditPostBtn');
  const input = document.getElementById('editPostInput');

  const closeModal = () => {
    modal.classList.remove('active');
    currentEditingPostId = null;
    if (input) input.value = '';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn?.addEventListener('click', async () => {
    if (!currentEditingPostId) return;
    const newContent = input?.value.trim();
    if (!newContent) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
      const { updatePost } = await import('./posts.js');
      await updatePost(currentEditingPostId, newContent);

      const postCard = document.querySelector(`.post-card[data-post-id="${currentEditingPostId}"]`);
      if (postCard) {
        const textEl = postCard.querySelector('.post-text');
        if (textEl) textEl.textContent = newContent;
      }

      showNotification('Post atualizado! ✏️');
      closeModal();
    } catch (err) {
      console.error(err);
      showNotification('Erro ao editar post. Tente novamente.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar Alterações';
    }
  });
}

// ============================================================
// CONFIGURAÇÕES E TEMAS
// ============================================================
function setupTemas() {
  const settingsTabs = document.querySelectorAll('.settings-tab-btn');
  const settingsSections = document.querySelectorAll('.settings-section');

  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      settingsTabs.forEach(t => t.classList.remove('active'));
      settingsSections.forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      const targetSection = document.getElementById(`settings-${tab.getAttribute('data-settings-tab')}`);
      if (targetSection) targetSection.classList.add('active');
    });
  });

  const themeOptions = document.querySelectorAll('.theme-option');
  themeOptions.forEach(opcao => {
    opcao.addEventListener('click', () => {
      const temaEscolhido = opcao.getAttribute('data-theme');
      if (temaEscolhido === 'padrao') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', temaEscolhido);
      }
      localStorage.setItem('vazaPucTheme', temaEscolhido);
      themeOptions.forEach(opt => opt.style.borderColor = 'transparent');
      opcao.style.borderColor = '#ffffff';
    });
  });

  const temaAtual = localStorage.getItem('vazaPucTheme') || 'padrao';
  const opcaoAtiva = document.querySelector(`.theme-option[data-theme="${temaAtual}"]`);
  if (opcaoAtiva) opcaoAtiva.style.borderColor = '#ffffff';
}

// ============================================================
// BUSCA DE USUÁRIOS
// ============================================================
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  let searchTimeout = null;

  const getOrCreateDropdown = () => {
    let el = document.getElementById('searchResultsDropdown');
    if (!el) {
      el = document.createElement('div');
      el.id = 'searchResultsDropdown';
      el.style.cssText = `
        position: absolute;
        top: calc(100% + 6px);
        left: 0; right: 0;
        background: var(--dark-bg-secondary);
        border: 1px solid var(--border);
        border-radius: 14px;
        z-index: 9000;
        max-height: 420px;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        display: none;
      `;
      const searchBox = searchInput.closest('.search-box');
      if (searchBox) {
        if (getComputedStyle(searchBox).position === 'static') {
          searchBox.style.position = 'relative';
        }
        searchBox.appendChild(el);
      }
    }
    return el;
  };

  const hideResults = () => {
    const el = document.getElementById('searchResultsDropdown');
    if (el) el.style.display = 'none';
  };

  const showResults = (users, query) => {
    const dropdown = getOrCreateDropdown();
    dropdown.style.display = 'block';

    if (users.length === 0) {
      dropdown.innerHTML = `
        <div style="padding:24px;text-align:center;color:var(--text-secondary);">
          <div style="font-size:32px;margin-bottom:8px;">🔍</div>
          <p style="font-size:14px;">Nenhuma conta para "<strong>${escapeHtml(query)}</strong>"</p>
        </div>`;
      return;
    }

    dropdown.innerHTML = `
      <div style="padding:10px 16px 6px;font-size:11px;font-weight:700;color:var(--text-secondary);letter-spacing:0.08em;text-transform:uppercase;">
        Contas encontradas
      </div>
      ${users.map(user => {
        const avatar = user.avatar_url
          || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle}`;
        const seguidores = user.followers_count != null ? user.followers_count : '—';
        return `
          <div class="search-result-item" data-handle="${escapeHtml(user.handle)}" style="
            display:flex;align-items:center;gap:12px;
            padding:10px 16px;cursor:pointer;
            transition:background 0.15s;
          ">
            <img src="${avatar}"
                 style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0;"
                 loading="lazy"
                 onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${escapeHtml(user.handle)}'">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(user.name)}
              </div>
              <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(user.handle)}</div>
              ${user.bio ? `<div style="color:var(--text-secondary);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(user.bio)}</div>` : ''}
            </div>
            <div style="flex-shrink:0;">
              <div style="font-size:12px;color:var(--text-secondary);">👥 ${seguidores}</div>
            </div>
          </div>`;
      }).join('')}
    `;

    dropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'var(--border)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        const handle = item.dataset.handle;
        hideResults();
        searchInput.value = '';
        if (!handle) return;

        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page')?.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-page="profile"]')?.classList.add('active');

        viewingProfile = null;
        loadProfileByHandle(handle);
      });
    });
  };

  const performSearch = async (query) => {
    if (!query || query.length < 2) { hideResults(); return; }

    const dropdown = getOrCreateDropdown();
    dropdown.style.display = 'block';
    dropdown.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">
        🔍 Buscando...
      </div>`;

    try {
      let data, error;

      ({ data, error } = await supabase
        .from('profiles')
        .select('id, name, handle, avatar_url, bio, followers_count')
        .or(`name.ilike.%${query}%,handle.ilike.%${query}%`)
        .order('followers_count', { ascending: false })
        .limit(10));

      // Fallback se followers_count não existir
      if (error && (error.code === '42703' || error.message?.includes('followers_count'))) {
        ({ data, error } = await supabase
          .from('profiles')
          .select('id, name, handle, avatar_url, bio')
          .or(`name.ilike.%${query}%,handle.ilike.%${query}%`)
          .limit(10));
      }

      if (error) throw error;

      showResults(data || [], query);
    } catch (err) {
      console.error('Erro na busca:', err);
      const dd = document.getElementById('searchResultsDropdown');
      if (dd) {
        dd.innerHTML = `
          <div style="padding:20px;text-align:center;color:var(--danger);font-size:14px;">
            Erro ao buscar. Tente novamente.
          </div>`;
      }
    }
  };

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    if (!query) { hideResults(); return; }
    searchTimeout = setTimeout(() => performSearch(query), 350);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      performSearch(e.target.value.trim());
    }
    if (e.key === 'Escape') {
      hideResults();
      searchInput.value = '';
    }
  });

  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      hideResults();
    }
  });
}

let arquivoSelecionadoModal = null;

// Mostrar preview da imagem quando selecionada
inputImagem.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        arquivoSelecionadoModal = file;
        const reader = new FileReader();
        reader.onload = function(evento) {
            imagemPreview.src = evento.target.result;
            previewContainer.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
});

// Remover a imagem do preview
removerImagem.addEventListener('click', () => {
    inputImagem.value = '';
    arquivoSelecionadoModal = null;
    previewContainer.style.display = 'none';
});

// Abrir/Fechar emojis (adicione aqui a lógica da sua biblioteca de emojis, como o Emoji Button ou Emoji Mart)
btnEmoji.addEventListener('click', () => {
    if (emojiPickerContainer.style.display === 'none') {
        emojiPickerContainer.style.display = 'block';
    } else {
        emojiPickerContainer.style.display = 'none';
    }
});

// Limpar ao fechar o modal (procure onde você já fecha o modal e adicione isso)
document.getElementById('closePostModal').addEventListener('click', limparModalImagem);
document.getElementById('cancelPostBtn').addEventListener('click', limparModalImagem);

function limparModalImagem() {
    inputImagem.value = '';
    arquivoSelecionadoModal = null;
    previewContainer.style.display = 'none';
    emojiPickerContainer.style.display = 'none';
}
// ── EMOJI FIX: garante listeners após DOM pronto ──
document.addEventListener('DOMContentLoaded', () => {
  const btnModal  = document.getElementById('btnEmojiModal');
  const pkrModal  = document.getElementById('pickerEmojiModal');
  const btnFeed   = document.getElementById('btnEmojiFeed');
  const pkrFeed   = document.getElementById('pickerEmojiFeed');

  const toggle = (picker, outro) => {
    if (!picker) return;
    picker.classList.toggle('active');
    outro?.classList.remove('active');
  };

  btnModal?.addEventListener('click', e => {
    e.stopPropagation();
    toggle(pkrModal, pkrFeed);
  });

  btnFeed?.addEventListener('click', e => {
    e.stopPropagation();
    toggle(pkrFeed, pkrModal);
  });

  // fecha ao clicar fora
  document.addEventListener('click', e => {
    if (!e.target.closest('.emoji-picker-container') &&
        !e.target.closest('#btnEmojiModal') &&
        !e.target.closest('#btnEmojiFeed')) {
      pkrModal?.classList.remove('active');
      pkrFeed?.classList.remove('active');
    }
  });
});