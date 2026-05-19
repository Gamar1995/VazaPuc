// ============================================================
// js/home.js — Com Sistema de Blocos (#bloco 01 a #bloco 10) e Banner de Perfil
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';
import { getCurrentProfile, onAuthChange, signOut } from './supabase.js';

import {
  isPremium,
  activatePremium,
  deactivatePremium,
  profileIsPremium,
} from './premium.js';

import {
  recordProfileVisit,
  getProfileVisitors,
} from './visita_perfil.js';

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
  deleteNotification,
  getNotifText,
  getNotifIcon,
  formatTimeAgoNotif,
  deleteAllNotifications,
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

import { 
  updateProfile, getProfileByHandle, isFollowing, followUser, unfollowUser,
  isProfilePrivate, setAccountPrivacy,
  requestFollow, cancelFollowRequest,
  acceptFollowRequest, rejectFollowRequest,
  getPendingFollowRequests, getPendingRequestsCount,
  getFollowRequestStatus, canViewProfile,
  getFollowing, getFollowers
} from './profile.js';

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
let feedSelectedFiles = [];

let feedListenersController = new AbortController();
let profileListenersController = new AbortController();
let profileBtnControllers = [];

window.renderPostPage = (postId) => openPostDetailModal(postId);

// ============================================================
// LIMPEZA AUTOMÁTICA DE HTML PERDIDO (Impede o bug do fundo da página)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Procura por inputs de banner que tenham ficado de fora do modal e apaga-os
    document.querySelectorAll('input#bannerInput').forEach(input => {
        const formGroup = input.closest('.form-group');
        if (formGroup && !formGroup.closest('.modal')) {
            formGroup.remove();
        }
    });
});

// ============================================================
// Sistema de Blocos — #bloco 01 até #bloco 10
// ============================================================

const BLOCOS = [
  { id: 'bloco-01', label: '#bloco 01', emoji: '🟥', cor: '#e0245e' },
  { id: 'bloco-02', label: '#bloco 02', emoji: '🟧', cor: '#f4700f' },
  { id: 'bloco-03', label: '#bloco 03', emoji: '🟨', cor: '#f5b700' },
  { id: 'bloco-04', label: '#bloco 04', emoji: '🟩', cor: '#17bf63' },
  { id: 'bloco-05', label: '#bloco 05', emoji: '🟦', cor: '#1d9bf0' },
  { id: 'bloco-06', label: '#bloco 06', emoji: '🟪', cor: '#7856ff' },
  { id: 'bloco-07', label: '#bloco 07', emoji: '🩷', cor: '#ff5eab' },
  { id: 'bloco-08', label: '#bloco 08', emoji: '🤎', cor: '#a0522d' },
  { id: 'bloco-09', label: '#bloco 09', emoji: '🩶', cor: '#8899aa' },
  { id: 'bloco-10', label: '#bloco 10', emoji: '🖤', cor: '#dddddd' },
];

const BLOCO_REGEX = /#[Bb]loco\s*(0?[1-9]|10)\b/g;

function normalizarBloco(match) {
  const num = match.replace(/#[Bb]loco\s*/i, '').trim().padStart(2, '0');
  return `bloco-${num}`;
}

function getBlocoById(id) {
  return BLOCOS.find(b => b.id === id) || null;
}

function detectarBlocosNoPost(content) {
  if (!content) return [];
  const matches = [...content.matchAll(BLOCO_REGEX)];
  const ids = [...new Set(matches.map(m => normalizarBloco(m[0])))];
  return ids.map(id => getBlocoById(id)).filter(Boolean);
}

function renderizarTextoComBlocos(content) {
  if (!content) return '';
  const div = document.createElement('div');
  div.textContent = content;
  let escaped = div.innerHTML;

  escaped = escaped.replace(/#[Bb]loco\s*(0?[1-9]|10)\b/g, (match) => {
    const id = normalizarBloco(match);
    const bloco = getBlocoById(id);
    if (!bloco) return match;
    return `<span class="hashtag-bloco" data-bloco-id="${bloco.id}" style="color:${bloco.cor};font-weight:700;cursor:pointer;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${match}</span>`;
  });

  return escaped;
}

function contarPostsPorBloco(posts) {
  const contagem = {};
  BLOCOS.forEach(b => { contagem[b.id] = 0; });
  posts.forEach(post => {
    const blocos = detectarBlocosNoPost(post.content);
    blocos.forEach(b => { contagem[b.id] = (contagem[b.id] || 0) + 1; });
  });
  return contagem;
}

function renderBlocosWidget(contagem) {
  const items = BLOCOS.map(b => {
    const qty = contagem[b.id] || 0;
    return `
      <button class="bloco-tag-btn" data-bloco-id="${b.id}" title="${qty} post${qty !== 1 ? 's' : ''}" style="
        display:inline-flex;align-items:center;gap:6px;
        padding:7px 14px;border-radius:20px;
        border:2px solid ${b.cor}44;
        background:${b.cor}12;color:${b.cor};
        font-size:13px;font-weight:700;cursor:pointer;
        transition:all 0.18s;white-space:nowrap;font-family:inherit;
      "
      onmouseover="this.style.background='${b.cor}2e';this.style.borderColor='${b.cor}'"
      onmouseout="if(!this.classList.contains('bloco-ativo')){this.style.background='${b.cor}12';this.style.borderColor='${b.cor}44'}"
      >
        ${b.emoji} ${b.label}
        <span style="
          background:${b.cor}2e;border-radius:10px;
          padding:1px 7px;font-size:11px;margin-left:2px;
          min-width:20px;text-align:center;
        ">${qty}</span>
      </button>`;
  }).join('');

  return `
    <section id="blocosWidgetSection" style="margin-bottom:4px;">
      <h3 class="explore-section-title" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        🏷️ Blocos em destaque
        <span style="font-size:12px;font-weight:400;color:var(--text-secondary);">clique para filtrar posts</span>
      </h3>
      <div id="blocosTagsRow" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 20px;">
        ${items}
      </div>
      <div id="blocoFeedContainer" style="display:none;"></div>
    </section>`;
}

function attachBlocosListeners(exploreContent, allPosts) {
  exploreContent.querySelectorAll('.bloco-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const blocoId = btn.dataset.blocoId;
      const bloco = getBlocoById(blocoId);
      if (!bloco) return;

      const jaAtivo = btn.classList.contains('bloco-ativo');

      exploreContent.querySelectorAll('.bloco-tag-btn').forEach(b => {
        b.classList.remove('bloco-ativo');
        b.style.boxShadow = '';
        b.style.background = `${getBlocoById(b.dataset.blocoId)?.cor || '#fff'}12`;
        b.style.borderColor = `${getBlocoById(b.dataset.blocoId)?.cor || '#fff'}44`;
      });

      const feedContainer = document.getElementById('blocoFeedContainer');
      if (jaAtivo) {
        feedContainer.style.display = 'none';
        feedContainer.innerHTML = '';
        return;
      }

      btn.classList.add('bloco-ativo');
      btn.style.boxShadow = `0 0 0 2px ${bloco.cor}`;
      btn.style.background = `${bloco.cor}2e`;
      btn.style.borderColor = bloco.cor;

      const postsFiltrados = allPosts.filter(post =>
        detectarBlocosNoPost(post.content).some(b => b.id === blocoId)
      );

      feedContainer.style.display = 'block';
      feedContainer.innerHTML = renderBlocoFeed(postsFiltrados, bloco);

      feedContainer.querySelectorAll('.bloco-mini-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.explore-avatar-clickable') || e.target.closest('.hashtag-bloco')) return;
          const postId = card.dataset.postId;
          if (postId) openPostDetailModal(postId);
        });
      });

      feedContainer.querySelectorAll('.explore-avatar-clickable').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const handle = el.dataset.handle;
          if (!handle) return;
          document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
          document.getElementById('profile-page').classList.add('active');
          loadProfileByHandle(handle);
        });
      });

      feedContainer.querySelectorAll('.hashtag-bloco').forEach(tag => {
        tag.addEventListener('click', (e) => {
          e.stopPropagation();
          const outroId = tag.dataset.blocoId;
          const outroBtn = exploreContent.querySelector(`.bloco-tag-btn[data-bloco-id="${outroId}"]`);
          if (outroBtn && outroId !== blocoId) outroBtn.click();
        });
      });

      feedContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  exploreContent.addEventListener('click', (e) => {
    const hashtag = e.target.closest('.hashtag-bloco');
    if (!hashtag) return;
    e.stopPropagation();
    const blocoId = hashtag.dataset.blocoId;
    const btn = exploreContent.querySelector(`.bloco-tag-btn[data-bloco-id="${blocoId}"]`);
    if (btn) btn.click();
  });
}

function renderBlocoFeed(posts, bloco) {
  if (posts.length === 0) {
    return `
      <div style="
        padding:36px;text-align:center;
        border:2px dashed ${bloco.cor}55;border-radius:16px;
        margin-bottom:24px;color:var(--text-secondary);
      ">
        <div style="font-size:40px;margin-bottom:12px;">${bloco.emoji}</div>
        <p style="font-size:15px;font-weight:700;color:${bloco.cor};margin:0 0 6px;">
          Nenhum post em ${bloco.label} ainda
        </p>
        <p style="font-size:13px;margin:0;color:var(--text-secondary);">
          Use <strong style="color:${bloco.cor};">${bloco.label}</strong> em um post para aparecer aqui!
        </p>
      </div>`;
  }

  const header = `
    <div style="
      display:flex;align-items:center;gap:12px;
      padding:12px 16px;margin-bottom:14px;
      background:${bloco.cor}12;border-radius:14px;
      border-left:4px solid ${bloco.cor};
    ">
      <span style="font-size:26px;line-height:1;">${bloco.emoji}</span>
      <div>
        <p style="margin:0;font-weight:800;font-size:15px;color:${bloco.cor};">${bloco.label}</p>
        <p style="margin:2px 0 0;font-size:12px;color:var(--text-secondary);">
          ${posts.length} post${posts.length !== 1 ? 's' : ''} encontrado${posts.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>`;

  const cards = posts.map(post => {
    const avatar = post.author?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
    const mediaThumb = post.media_urls?.length
      ? `<img src="${post.media_urls[0]}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-top:8px;" loading="lazy">`
      : '';
    const textoDestacado = renderizarTextoComBlocos(post.content);
    const diffMin = Math.floor((Date.now() - new Date(post.created_at)) / 60000);
    const timeStr = diffMin < 1 ? 'agora' : diffMin < 60 ? `${diffMin}min` : diffMin < 1440 ? `${Math.floor(diffMin/60)}h` : `${Math.floor(diffMin/1440)}d`;

    return `
      <div class="bloco-mini-card" data-post-id="${post.id}" style="
        background:var(--dark-bg-secondary);
        border:1px solid var(--border);
        border-top:3px solid ${bloco.cor};
        border-radius:14px;padding:14px;
        cursor:pointer;
        transition:transform 0.15s,border-color 0.18s;
      "
      onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${bloco.cor}'"
      onmouseout="this.style.transform='';this.style.borderColor='var(--border)';this.style.borderTopColor='${bloco.cor}'">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
          <img src="${avatar}" class="explore-avatar-clickable" data-handle="${post.author?.handle ?? ''}"
            style="width:34px;height:34px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;" loading="lazy">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:700;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(post.author?.name ?? 'Usuário')}
            </div>
            <div style="color:var(--text-secondary);font-size:12px;">@${escapeHtml(post.author?.handle ?? '')}</div>
          </div>
        </div>
        <p style="
          font-size:13.5px;color:var(--text-primary);line-height:1.5;margin:0;
          display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;
        ">${textoDestacado}</p>
        ${mediaThumb}
        <div style="display:flex;gap:14px;margin-top:10px;font-size:12px;color:var(--text-secondary);align-items:center;">
          <span>❤️ ${post.likes_count || 0}</span>
          <span>💬 ${post.replies_count || 0}</span>
          <span style="margin-left:auto;">${timeStr} atrás</span>
        </div>
      </div>`;
  }).join('');

  return `
    ${header}
    <div style="
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(230px,1fr));
      gap:12px;margin-bottom:28px;
    ">
      ${cards}
    </div>`;
}

async function navegarParaBloco(blocoId) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-page="explore"]')?.classList.add('active');
  document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
  document.getElementById('explore-page')?.classList.add('active');

  await loadExplorePage();

  requestAnimationFrame(() => {
    const btn = document.querySelector(`.bloco-tag-btn[data-bloco-id="${blocoId}"]`);
    if (btn) btn.click();
  });
}

// ============================================================
// INICIALIZAÇÃO
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
  setupPrivacySettings();
  setupFollowListModal();
} catch (erroInterface) {
  console.error('Erro ao carregar interface:', erroInterface);
}

try {
  onAuthChange(async (session) => {
  if (session) {
    currentProfile = await getCurrentProfile();
    window.currentProfile = currentProfile;
    updateUserUI();
    await initNotifications();
    await loadFeed();
    startRealtimeFeed();
  } else {
    currentProfile = null;
    window.currentProfile = null;
    updateUserUI();
    await loadFeed();
  }
});

window.refreshPendingBadge = refreshPendingBadge;
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
}

// ============================================================
// UPLOAD DE AVATAR E BANNER
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

function validarDimensoesBanner(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => resolve(); // Permite sempre, sem bloquear o utilizador
    img.onerror = () => resolve(); 
  });
}

async function uploadBanner(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');
  if (!file.type.startsWith('image/')) throw new Error('Arquivo de banner inválido');
  if (file.size > 5 * 1024 * 1024) throw new Error('Imagem do banner muito grande (Max 5MB)');

  const fileExt = file.name.split('.').pop();
  const filePath = `banners/${user.id}-${Date.now()}.${fileExt}`;

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
    console.error('[seguindo] Erro:', err);
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger)">
      Erro ao carregar.<br><small>${err?.message ?? ''}</small>
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
// CRIA HTML DO POST — com suporte a blocos
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
    <div style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:12px;padding:0 0 6px 52px;">
      🔁 <span>${escapeHtml(post.reposted_by_name ?? '')} repostou</span>
    </div>
  ` : '';

  const mediaGrid = post.media_urls?.length
    ? createMediaGridHTML(post.media_urls, post.id)
    : '';

  const quoteCard = post.is_quote && post.quoted_post_id
    ? `<div class="quote-placeholder" data-quoted-id="${post.quoted_post_id}">
        <div style="margin-top:10px;border:1px solid var(--border);border-radius:12px;padding:10px 14px;background:var(--dark-bg);color:var(--text-secondary);font-size:13px;">Carregando post citado...</div>
       </div>`
    : '';

  const blocosDoPost = detectarBlocosNoPost(post.content);
  const blocosBadges = blocosDoPost.length > 0
    ? `<div class="post-blocos-badges" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
        ${blocosDoPost.map(b => `
          <span class="bloco-badge-post" data-bloco-id="${b.id}" style="
            display:inline-flex;align-items:center;gap:3px;
            background:${b.cor}18;color:${b.cor};
            border:1px solid ${b.cor}44;
            border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;
            cursor:pointer;transition:background 0.15s;
          "
          onmouseover="this.style.background='${b.cor}33'"
          onmouseout="this.style.background='${b.cor}18'"
          >${b.emoji} ${b.label}</span>
        `).join('')}
       </div>`
    : '';

  const textoPost = renderizarTextoComBlocos(post.content);

  // --- NOVO: LÓGICA DE TEXTO LONGO (LER MAIS) ---
  const numLines = post.content ? (post.content.match(/\n/g) || []).length : 0;
  // Aciona o botão "Ler mais" se o texto tiver mais de 250 caracteres OU mais de 4 linhas
  const isLongText = (post.content && post.content.length > 250) || numLines > 4;

  const textoPostElement = `
    <div class="post-text-wrapper" style="width: 100%;">
      <p class="post-text post-clickable-body ${isLongText ? 'collapsed-text' : ''}" data-post-id="${post.id}" style="
        margin: 0;
        font-size: 15px;
        line-height: 1.5;
        color: var(--text-primary);
        word-break: break-word;
        white-space: pre-wrap;
        ${isLongText ? 'display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;' : ''}
      ">${textoPost}</p>
      ${isLongText ? `<button class="toggle-text-btn" data-post-id="${post.id}" style="
        background: transparent;
        border: none;
        color: var(--primary);
        font-size: 14px;
        font-weight: 700;
        padding: 0;
        margin-top: 6px;
        cursor: pointer;
        transition: opacity 0.2s;
      " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">Ler mais</button>` : ''}
    </div>
  `;
  // ----------------------------------------------

  return `
    <div class="post-card" data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}" style="flex-direction:column;cursor:pointer;">
      ${repostIndicator}
      <div class="post-main" style="display:flex;gap:16px;width:100%;">
        <img src="${authorAvatar}" class="avatar clickable-avatar" data-handle="${post.author?.handle}" style="cursor:pointer;">
        <div class="post-content" style="flex:1;min-width:0;">
          <div class="post-header" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;width:100%;">
            <span class="post-author clickable-avatar" data-handle="${post.author?.handle}" style="cursor:pointer;">
             ${escapeHtml(post.author?.name ?? 'Usuário')}${post.author?.is_premium ? ' <span class="premium-badge-tag" title="Premium">✦</span>' : ''}
            </span>
            <span class="post-handle">@${escapeHtml(post.author?.handle ?? '')}</span>
            <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
              <span class="post-time" style="margin-left:0;">${timeAgo}</span>
              ${optionsMenu}
            </div>
          </div>
          ${textoPostElement}
          ${blocosBadges}
          ${mediaGrid}
          ${quoteCard}
          <div class="post-actions">
            <button class="post-action reply-action" title="Responder" data-post-id="${post.id}" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;color:inherit;font-size:inherit;padding:4px 8px;">
              💬 <span class="reply-count">${post.replies_count ?? 0}</span>
            </button>
            <button class="post-action like-action ${isLiked ? 'liked' : ''}"
                 data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}" data-liked="${isLiked}"
                 style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;color:inherit;font-size:inherit;padding:4px 8px;">
              ❤️ <span class="like-count">${post.likes_count ?? 0}</span>
            </button>
            <button class="post-action repost-action ${isReposted ? 'reposted' : ''}"
                 data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}" data-reposted="${isReposted}"
                 style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;
                        color:${isReposted ? 'var(--success, #17bf63)' : 'inherit'};font-size:inherit;padding:4px 8px;transition:color 0.2s;">
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
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;">
    <input type="checkbox" class="reply-private-toggle" style="accent-color:var(--primary);">
    🔒 Só o autor vê
  </label>
              <button class="reply-submit-btn" data-post-id="${post.id}" data-author-id="${post.author?.id ?? ''}">Responder</button>
            </div>
          </div>
        </div>
        <div class="replies-list" id="replies-list-${post.id}"></div>
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

  container.querySelectorAll('.bloco-badge-post').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const blocoId = badge.dataset.blocoId;
      if (blocoId) navegarParaBloco(blocoId);
    }, { signal });
  });

  container.querySelectorAll('.hashtag-bloco').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      const blocoId = tag.dataset.blocoId;
      if (blocoId) navegarParaBloco(blocoId);
    }, { signal });
  });

  container.querySelectorAll('.post-options-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('floatingPostMenu')?.remove();

      const postId = btn.dataset.postId;
      const rect = btn.getBoundingClientRect();

      const menu = document.createElement('div');
      menu.id = 'floatingPostMenu';
      menu.style.cssText = `
        position:fixed;top:${rect.bottom + 4}px;
        left:${Math.min(rect.right - 190, window.innerWidth - 198)}px;
        z-index:9999;background:var(--dark-bg-secondary);
        border:1px solid var(--border);border-radius:10px;
        min-width:190px;box-shadow:0 4px 20px rgba(0,0,0,0.4);overflow:hidden;
      `;
      menu.innerHTML = `
        <button class="fm-edit" data-post-id="${postId}" style="display:block;width:100%;text-align:left;padding:11px 16px;background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:14px;">✏️ Editar</button>
        <button class="fm-delete" data-post-id="${postId}" style="display:block;width:100%;text-align:left;padding:11px 16px;background:none;border:none;cursor:pointer;color:var(--danger,#e0245e);font-size:14px;">🗑️ Apagar</button>
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

  container.querySelectorAll('.like-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentProfile) { showNotification('Faça login para curtir! 🔐'); return; }

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
            await createNotification({ toUserId: authorId, actorId: currentProfile.id, type: NOTIF_TYPES.LIKE, postId });
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

  attachRepostListeners(container, currentProfile, signal, {
    showNotification,
    createNotification: async (payload) => { try { await createNotification(payload); } catch (_) {} },
    onRepostSuccess: (postId) => { repostedPostIds.add(postId); },
    onUndoRepostSuccess: (postId) => { repostedPostIds.delete(postId); },
    prependPost: () => {
      if (activeFeedTab === 'para-voce') loadFeed();
      else loadFollowingFeed();
    },
  });

  attachMediaListeners(container, signal);

  container.querySelectorAll('.quote-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const quotedId = card.dataset.quotedPostId;
      if (quotedId) openPostDetailModal(quotedId);
    }, { signal });
  });

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

  // --- NOVO: LÓGICA DO BOTÃO DE "LER MAIS / ESCONDER" ---
  container.querySelectorAll('.toggle-text-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Previne que o card do post abra
      const postId = btn.dataset.postId;
      const textEl = container.querySelector(`.post-text[data-post-id="${postId}"]`);
      if (!textEl) return;

      const isCollapsed = textEl.classList.contains('collapsed-text');
      if (isCollapsed) {
        // Expandir
        textEl.classList.remove('collapsed-text');
        textEl.style.display = 'block';
        textEl.style.webkitLineClamp = 'unset';
        btn.textContent = 'Esconder';
      } else {
        // Encolher de volta
        textEl.classList.add('collapsed-text');
        textEl.style.display = '-webkit-box';
        textEl.style.webkitLineClamp = '5';
        btn.textContent = 'Ler mais';
      }
    }, { signal });
  });

  container.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (
        e.target.closest('.post-actions') ||
        e.target.closest('.clickable-avatar') ||
        e.target.closest('.post-options-wrapper') ||
        e.target.closest('.post-replies-section') ||
        e.target.closest('.media-grid') ||
        e.target.closest('.quote-card') ||
        e.target.closest('.bloco-badge-post') ||
        e.target.closest('.hashtag-bloco') ||
        e.target.closest('.toggle-text-btn') // <-- Ignora o clique no Ler Mais
      ) return;
      const postId = card.dataset.postId;
      if (postId) openPostDetailModal(postId);
    }, { signal });
  });

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

  container.querySelectorAll('.reply-submit-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentProfile) { showNotification('Faça login para comentar! 🔐'); return; }

      const postId = btn.dataset.postId;
      const authorId = btn.dataset.authorId;
      const postCard = btn.closest('.post-card');
      const input = postCard.querySelector('.reply-input');
      const content = input?.value.trim();
      if (!content) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        const isPrivate = btn.closest('.reply-toolbar')?.querySelector('.reply-private-toggle')?.checked ?? false;
        await addReply(postId, content, isPrivate);

        const userAvatar = currentProfile.avatar_url
          || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentProfile.handle}`;

        const newReplyHTML = `
          <div class="reply-item" style="animation:slideDown 0.3s ease;">
            <img src="${userAvatar}" class="reply-avatar" style="width:30px;height:30px;">
            <div class="reply-bubble">
              <div class="reply-header">
                <span class="reply-author">${escapeHtml(currentProfile.name)}</span>
                <span class="reply-handle">@${escapeHtml(currentProfile.handle)}</span>
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
          await createNotification({ toUserId: authorId, actorId: currentProfile.id, type: NOTIF_TYPES.REPLY, postId });
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
async function openLikesModal(postId) {
  document.getElementById('likesModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'likesModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:5000;
    background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;
    padding:20px;backdrop-filter:blur(6px);
  `;
  modal.innerHTML = `
    <div style="
      background:var(--dark-bg-secondary);border:1px solid var(--border);
      border-radius:24px;width:100%;max-width:400px;max-height:75vh;
      display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5);
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:16px 24px;border-bottom:1px solid var(--border);">
        <h3 style="font-size:17px;font-weight:800;color:var(--text-primary);margin:0;">❤️ Curtidas</h3>
        <button id="closeLikesModal" style="background:none;border:none;color:var(--text-secondary);
          font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;
          transition:color 0.2s;">✕</button>
      </div>
      <div id="likesModalContent" style="overflow-y:auto;flex:1;padding:8px 0;">
        <p style="text-align:center;padding:30px;color:var(--text-secondary);">Carregando...</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('closeLikesModal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  const content = document.getElementById('likesModalContent');

  try {
    const { data, error } = await supabase
      .from('likes')
      .select('user:profiles(id, name, handle, avatar_url, is_premium)')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const users = (data || []).map(d => d.user).filter(Boolean);

    if (users.length === 0) {
      content.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text-secondary);">
          <div style="font-size:40px;margin-bottom:12px;">🤍</div>
          <p style="font-size:15px;font-weight:600;color:var(--text-primary);margin:0 0 6px;">
            Nenhuma curtida ainda
          </p>
          <p style="font-size:13px;margin:0;">Seja o primeiro a curtir este post!</p>
        </div>`;
      return;
    }

    content.innerHTML = users.map(u => {
      const avatar = u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.handle}`;
      return `
        <div class="likes-modal-item" data-handle="${escapeHtml(u.handle)}" style="
          display:flex;align-items:center;gap:12px;
          padding:12px 20px;cursor:pointer;
          transition:background 0.15s;
        "
        onmouseover="this.style.background='var(--dark-bg, #0d0d0d)'"
        onmouseout="this.style.background='transparent'">
          <img src="${avatar}" style="
            width:44px;height:44px;border-radius:50%;object-fit:cover;
            border:2px solid ${u.is_premium ? '#ffd700' : 'var(--border)'};
            flex-shrink:0;
          " loading="lazy">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(u.name ?? 'Usuário')}
              ${u.is_premium ? '<span class="premium-badge-tag" title="Premium">✦</span>' : ''}
            </div>
            <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(u.handle ?? '')}</div>
          </div>
          <span style="color:var(--text-secondary);font-size:18px;flex-shrink:0;">❤️</span>
        </div>`;
    }).join('');

    content.querySelectorAll('.likes-modal-item').forEach(item => {
      item.addEventListener('click', () => {
        const handle = item.dataset.handle;
        if (!handle) return;
        modal.remove();
        document.getElementById('postDetailModal') && closePostDetailModal();
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page').classList.add('active');
        loadProfileByHandle(handle);
      });
    });

  } catch (err) {
    console.error('[likesModal]', err);
    content.innerHTML = `
      <p style="text-align:center;padding:30px;color:var(--danger);">
        Erro ao carregar curtidas.
      </p>`;
  }
}
// ============================================================
// MODAL DE DETALHE DO POST
// ============================================================
function setupPostDetailModal() {
  if (document.getElementById('postDetailModal')) return;

  const modal = document.createElement('div');
  modal.id = 'postDetailModal';
  modal.style.cssText = `
    display:none;position:fixed;inset:0;z-index:3000;
    background:rgba(0,0,0,0.7);align-items:center;justify-content:center;
    padding:20px;backdrop-filter:blur(4px);
  `;
  modal.innerHTML = `
    <div id="postDetailBox" style="
      background:var(--dark-bg-secondary);border:1px solid var(--border);
      border-radius:16px;width:100%;max-width:600px;
      max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;position:relative;
    ">
      <div style="position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;
        padding:16px 20px;background:var(--dark-bg-secondary);border-bottom:1px solid var(--border);">
        <button id="closePostDetailBtn" style="background:none;border:none;color:var(--text-primary);
          font-size:20px;cursor:pointer;padding:4px 8px;border-radius:50%;transition:background 0.2s;line-height:1;"
          onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='none'">←</button>
        <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);">Post</h3>
      </div>
      <div id="postDetailContent" style="padding:20px;flex:1;"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('closePostDetailBtn').addEventListener('click', closePostDetailModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closePostDetailModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePostDetailModal(); });
}

function closePostDetailModal() {
  const modal = document.getElementById('postDetailModal');
  if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
}

async function openPostDetailModal(postId) {
  const modal = document.getElementById('postDetailModal');
  const content = document.getElementById('postDetailContent');
  if (!modal || !content) return;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  content.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Carregando...</p>';

  try {
    // ── Busca o post direto do banco ──────────────────────────
    const { data: postData, error: postError } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!author_id (id, name, handle, avatar_url, is_premium),
        likes:likes(count),
        replies:replies(count)
      `)
      .eq('id', postId)
      .single();

    if (postError || !postData) throw postError || new Error('Post não encontrado');

    const authorName   = postData.author?.name ?? 'Usuário';
    const authorHandle = `@${postData.author?.handle ?? ''}`;
    const postText     = postData.content ?? '';
    const authorAvatar = postData.author?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${postData.author?.handle}`;
    const authorId     = postData.author?.id ?? postData.author_id ?? '';
    const handle       = postData.author?.handle ?? '';
    const isLiked      = likedPostIds.has(postId);

    // Conta likes e replies vindos do join
    const likeCount  = postData.likes_count  ?? postData.likes?.[0]?.count  ?? 0;
    const replyCount = postData.replies_count ?? postData.replies?.[0]?.count ?? 0;

    const userAvatar = currentProfile?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;

    // Formata a data
    const postDate = new Date(postData.created_at);
    const postTime = postDate.toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // Mídia
    const mediaHtml = postData.media_urls?.length
      ? createMediaGridHTML(postData.media_urls, postId)
      : '';

    // Quote card
    const quoteCardHtml = postData.is_quote && postData.quoted_post_id
      ? `<div class="quote-placeholder" data-quoted-id="${postData.quoted_post_id}">
          <div style="margin-top:10px;border:1px solid var(--border);border-radius:12px;padding:10px 14px;background:var(--dark-bg);color:var(--text-secondary);font-size:13px;">Carregando post citado...</div>
         </div>`
      : '';

    // Blocos
    const blocosDoPost = detectarBlocosNoPost(postText);
    const blocosBadgesModal = blocosDoPost.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;">
          ${blocosDoPost.map(b => `
            <span class="bloco-badge-modal" data-bloco-id="${b.id}" style="
              display:inline-flex;align-items:center;gap:4px;
              background:${b.cor}18;color:${b.cor};
              border:1px solid ${b.cor}55;border-radius:12px;
              padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer;
              transition:background 0.15s;"
            onmouseover="this.style.background='${b.cor}33'"
            onmouseout="this.style.background='${b.cor}18'">
              ${b.emoji} ${b.label}
            </span>
          `).join('')}
         </div>`
      : '';

    const textoDestacado = renderizarTextoComBlocos(postText);

    content.innerHTML = `
      <div style="display:flex;gap:14px;margin-bottom:20px;">
        <img src="${authorAvatar}" class="detail-clickable-avatar" data-handle="${handle}"
             style="width:48px;height:48px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="detail-clickable-avatar" data-handle="${handle}"
              style="font-weight:700;font-size:15px;color:var(--text-primary);cursor:pointer;">
              ${escapeHtml(authorName)}
              ${postData.author?.is_premium ? '<span class="premium-badge-tag" title="Premium">✦</span>' : ''}
            </span>
            <span style="color:var(--text-secondary);font-size:14px;">${escapeHtml(authorHandle)}</span>
          </div>
          <p style="font-size:18px;color:var(--text-primary);line-height:1.6;margin-top:12px;word-break:break-word;white-space:pre-wrap;">
            ${textoDestacado}
          </p>
          ${blocosBadgesModal}
          ${mediaHtml}
          ${quoteCardHtml}
          <p style="color:var(--text-secondary);font-size:13px;margin-top:12px;">${postTime}</p>
        </div>
      </div>

      <div style="display:flex;gap:20px;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:16px;">
        <span style="color:var(--text-secondary);font-size:14px;">
          <strong style="color:var(--text-primary);">${replyCount}</strong> Respostas
        </span>
        <span id="detailLikeCountWrapper" data-post-id="${postId}" style="
          color:var(--text-secondary);font-size:14px;cursor:pointer;transition:color 0.15s;"
          onmouseover="this.style.color='var(--text-primary)'"
          onmouseout="this.style.color='var(--text-secondary)'">
          <strong id="detailLikeCountStat">${likeCount}</strong> Curtidas
        </span>
      </div>

      <div style="display:flex;gap:24px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
        <button id="detailLikeBtn"
          data-post-id="${postId}"
          data-author-id="${authorId}"
          data-liked="${isLiked}"
          class="like-action ${isLiked ? 'liked' : ''}"
          style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;
                 color:${isLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)'};font-size:15px;font-weight:600;padding:0;">
          <span id="detailLikeEmoji">${isLiked ? '❤️' : '🤍'}</span>
          <span class="like-count">${likeCount}</span>
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
                     outline:none;font-family:inherit;box-sizing:border-box;"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;">
                <input type="checkbox" id="detailReplyPrivate" style="accent-color:var(--primary);">
                🔒 Só o autor vê
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

    // Carrega quote card se existir
    if (postData.is_quote && postData.quoted_post_id) {
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = content.innerHTML;
      await loadQuoteCards(content);
    }

    // Media listeners
    const { attachMediaListeners: attachMedia } = await import('./Midia.js');
    attachMedia(content, new AbortController().signal);

    // Bloco badges
    content.querySelectorAll('.bloco-badge-modal').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const blocoId = badge.dataset.blocoId;
        if (blocoId) { closePostDetailModal(); navegarParaBloco(blocoId); }
      });
    });

    content.querySelectorAll('.hashtag-bloco').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        const blocoId = tag.dataset.blocoId;
        if (blocoId) { closePostDetailModal(); navegarParaBloco(blocoId); }
      });
    });

    // Avatar clickável
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

    // ── Botão de curtir ───────────────────────────────────────
    const detailLikeBtn = document.getElementById('detailLikeBtn');
    const detailLikeEmoji = document.getElementById('detailLikeEmoji');

    detailLikeBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentProfile) { showNotification('Faça login para curtir! 🔐'); return; }

      const pid = detailLikeBtn.dataset.postId;
      const aid = detailLikeBtn.dataset.authorId;
      const wasLiked = detailLikeBtn.dataset.liked === 'true';
      const countEl = detailLikeBtn.querySelector('.like-count');
      const statEl  = document.getElementById('detailLikeCountStat');
      const currentCount = parseInt(countEl?.textContent || '0');
      const newLiked = !wasLiked;
      const newCount = Math.max(0, currentCount + (newLiked ? 1 : -1));

      // UI imediata
      detailLikeBtn.dataset.liked = String(newLiked);
      detailLikeBtn.classList.toggle('liked', newLiked);
      detailLikeBtn.style.color = newLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)';
      if (detailLikeEmoji) detailLikeEmoji.textContent = newLiked ? '❤️' : '🤍';
      if (countEl) countEl.textContent = newCount;
      if (statEl)  statEl.textContent  = newCount;
      detailLikeBtn.style.pointerEvents = 'none';

      // Sincroniza botão no feed também
      document.querySelectorAll(`.like-action[data-post-id="${pid}"]`).forEach(b => {
        b.dataset.liked = String(newLiked);
        b.classList.toggle('liked', newLiked);
        const c = b.querySelector('.like-count');
        if (c) c.textContent = newCount;
      });

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
        // Reverte
        detailLikeBtn.dataset.liked = String(wasLiked);
        detailLikeBtn.classList.toggle('liked', wasLiked);
        detailLikeBtn.style.color = wasLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)';
        if (detailLikeEmoji) detailLikeEmoji.textContent = wasLiked ? '❤️' : '🤍';
        if (countEl) countEl.textContent = currentCount;
        if (statEl)  statEl.textContent  = currentCount;
        if (wasLiked) likedPostIds.add(pid);
        else likedPostIds.delete(pid);
        if (err?.status !== 409) showNotification('Erro ao curtir.');
      } finally {
        detailLikeBtn.style.pointerEvents = '';
      }
    });

    // ── Ver quem curtiu ───────────────────────────────────────
    document.getElementById('detailLikeCountWrapper')?.addEventListener('click', () => {
      const isOwner = currentProfile && currentProfile.id === authorId;
      if (!currentProfile) { showNotification('Faça login para ver quem curtiu! 🔐'); return; }
      if (!isOwner && !isPremium()) { openPremiumModalCurtida(); return; }
      openLikesModal(postId);
    });

    // ── Toggle composer de resposta ───────────────────────────
    document.getElementById('detailReplyToggle')?.addEventListener('click', () => {
      const composer = document.getElementById('detailReplyComposer');
      if (!composer) return;
      composer.style.display = composer.style.display === 'none' ? 'block' : 'none';
      if (composer.style.display === 'block') document.getElementById('detailReplyInput')?.focus();
    });

    // ── Enviar resposta ao post ───────────────────────────────
    document.getElementById('detailReplySubmit')?.addEventListener('click', async (e) => {
      if (!currentProfile) { showNotification('Faça login para comentar! 🔐'); return; }
      const btn = e.currentTarget;
      const pid = btn.dataset.postId;
      const aid = btn.dataset.authorId;
      const input = document.getElementById('detailReplyInput');
      const text = input?.value.trim();
      if (!text) return;

      const isPrivate = document.getElementById('detailReplyPrivate')?.checked ?? false;
      btn.disabled = true;
      btn.textContent = '...';

      try {
        await addReply(pid, text, isPrivate);
        if (input) input.value = '';
        document.getElementById('detailReplyComposer').style.display = 'none';
        showNotification('Resposta enviada! 💬');

        // Atualiza contador
        const repliesCountEl = content.querySelector('strong');
        if (repliesCountEl) {
          repliesCountEl.textContent = parseInt(repliesCountEl.textContent || '0') + 1;
        }
        document.querySelectorAll(`.reply-action[data-post-id="${pid}"] .reply-count`).forEach(el => {
          el.textContent = parseInt(el.textContent || '0') + 1;
        });

        if (aid && aid !== currentProfile.id) {
          await createNotification({ toUserId: aid, actorId: currentProfile.id, type: NOTIF_TYPES.REPLY, postId: pid });
        }
        await loadDetailReplies(pid, aid);
      } catch (err) {
        console.error('Erro ao enviar resposta:', err);
        showNotification('Erro ao enviar resposta.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Responder';
      }
    });

    await loadDetailReplies(postId, authorId);

  } catch (err) {
    console.error('Erro ao abrir post:', err);
    content.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">Erro ao carregar post.</p>';
  }
}

async function loadDetailReplies(postId, authorId = '') {
  const container = document.getElementById('detailRepliesList');
  if (!container) return;
  container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:14px;">Carregando...</p>';

  try {
    const allReplies = await getReplies(postId, currentProfile?.id, authorId);

    const repliesFiltradas = allReplies.filter(r => {
      if (!r.is_private) return true;
      if (!currentProfile) return false;
      return currentProfile.id === authorId || currentProfile.id === r.author?.id;
    });

    if (repliesFiltradas.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;font-size:14px;">Nenhuma resposta ainda. Seja o primeiro! 💬</p>';
      return;
    }

    // Separa raiz e filhos
    const raiz = repliesFiltradas.filter(r => !r.parent_reply_id);
    const filhos = repliesFiltradas.filter(r => r.parent_reply_id);
    const MAX_FILHOS_VISIVEIS = 2;

    // ✅ RENDERIZAR FUNÇÃO
    const renderReply = (r, isChild = false) => {
      const avatar = r.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author?.handle}`;
      const isMyReply = currentProfile && currentProfile.id === r.author?.id;
      const childReplies = filhos.filter(f => f.parent_reply_id === r.id);
      const filhosVisiveis = childReplies.slice(0, MAX_FILHOS_VISIVEIS);
      const filhosOcultos = childReplies.slice(MAX_FILHOS_VISIVEIS);

      const filhosHTML = filhosVisiveis.map(child => renderReply(child, true)).join('');

      const verMaisBtn = filhosOcultos.length > 0 ? `
        <button class="ver-mais-respostas-btn" data-parent-id="${r.id}"
          style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:12px;font-weight:700;padding:4px 8px 4px 48px;display:block;transition:opacity 0.2s;margin-bottom:4px;"
          onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
          ↳ Ver mais ${filhosOcultos.length} resposta${filhosOcultos.length > 1 ? 's' : ''}
        </button>
      ` : '';

      const hiddenFilhosHTML = filhosOcultos.length > 0 ? `
        <div class="respostas-ocultas" data-parent-id="${r.id}" style="display:none;">
          ${filhosOcultos.map(child => renderReply(child, true)).join('')}
        </div>
      ` : '';

      return `
        <div class="reply-thread-item" data-reply-id="${r.id}" style="display:flex;gap:10px;padding:${isChild ? '10px 0 10px 48px' : '14px 0 6px'};border-bottom:${isChild ? 'none' : '1px solid var(--border)'};position:relative;">
          ${isChild ? `<div style="position:absolute;left:36px;top:-6px;bottom:0;width:2px;background:var(--border);border-radius:2px;"></div>` : ''}
          <img src="${avatar}" class="detail-reply-avatar" data-handle="${r.author?.handle ?? ''}"
               style="width:${isChild ? '30px' : '38px'};height:${isChild ? '30px' : '38px'};border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
              <span class="detail-reply-avatar" data-handle="${r.author?.handle ?? ''}"
                style="font-weight:700;font-size:${isChild ? '13px' : '14px'};color:var(--text-primary);cursor:pointer;">
                ${escapeHtml(r.author?.name ?? 'Usuário')}
              </span>
              <span style="color:var(--text-secondary);font-size:12px;">@${escapeHtml(r.author?.handle ?? '')}</span>
              <span style="color:var(--text-secondary);font-size:11px;">· ${formatTimeAgo(r.created_at)}</span>
              ${r.is_private ? '<span style="font-size:10px;background:var(--primary)22;color:var(--primary);padding:1px 6px;border-radius:8px;font-weight:700;">🔒</span>' : ''}
              ${isMyReply ? `
                <button class="delete-reply-btn" data-reply-id="${r.id}" data-post-id="${postId}" data-is-child="${isChild}"
                  style="margin-left:auto;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px;transition:color 0.2s;"
                  onmouseover="this.style.color='var(--danger,#e0245e)'" onmouseout="this.style.color='var(--text-secondary)'">🗑️</button>
              ` : ''}
            </div>
            <p style="font-size:${isChild ? '13px' : '14px'};color:var(--text-primary);line-height:1.5;word-break:break-word;margin:0 0 8px;">
              ${escapeHtml(r.content)}
            </p>
            ${filhosHTML}
            ${verMaisBtn}
            ${hiddenFilhosHTML}
          </div>
        </div>
      `;
    };

    // ✅ RENDERIZAR NO CONTAINER
    container.innerHTML = raiz.map(r => renderReply(r, false)).join('');

    // ✅ EXPANDIR REPLIES OCULTAS
    container.querySelectorAll('.ver-mais-respostas-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parentId = btn.dataset.parentId;
        const ocultas = container.querySelector(`.respostas-ocultas[data-parent-id="${parentId}"]`);
        if (ocultas) {
          ocultas.style.display = 'block';
          btn.remove();
        }
      });
    });

    // ✅ AVATARES CLICÁVEIS
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

    // ✅ BOTÃO APAGAR
    container.querySelectorAll('.delete-reply-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Apagar este comentário?')) return;

        const replyId = btn.dataset.replyId;
        const pid = btn.dataset.postId;
        const isChild = btn.dataset.isChild === 'true';

        btn.disabled = true;

        try {
          const { error } = await supabase.from('replies').delete().eq('id', replyId);
          if (error) throw error;

          // Decrementa só se for raiz
          if (!isChild) {
            await supabase.rpc('decrement_replies', { post_id: pid });
            document.querySelectorAll(`.reply-action[data-post-id="${pid}"] .reply-count`).forEach(el => {
              el.textContent = Math.max(0, parseInt(el.textContent || '0') - 1);
            });
          }

          showNotification('Comentário apagado 🗑️');
          await loadDetailReplies(pid, authorId);
        } catch (err) {
          console.error(err);
          showNotification('Erro ao apagar comentário.');
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error('[loadDetailReplies]', err);
    container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:16px;">Erro ao carregar respostas.</p>';
  }
}

async function loadRepliesForPost(postId, listElement = null) {

  console.log('CARREGANDO REPLIES...', postId);

  const repliesList =
    listElement ||
    document.getElementById(`replies-list-${postId}`);

  if (!repliesList) {
    console.log('LISTA NÃO ENCONTRADA');
    return;
  }

  repliesList.innerHTML = 'Carregando...';

  try {

    console.log('ANTES DO GET REPLIES');

    const postAuthorId =
      document.querySelector(`.post-card[data-post-id="${postId}"]`)
      ?.dataset.authorId ?? null;

    const replies = await getReplies(
      postId,
      currentProfile?.id,
      postAuthorId
    );

    console.log('REPLIES:', replies);

    // =========================
    // TESTE RAIZ/FILHOS
    // =========================

    const raiz = replies.filter(
      r =>
        r.parent_reply_id === null ||
        r.parent_reply_id === undefined ||
        r.parent_reply_id === ''
    );
    console.log('RENDER:', r.id, r.parent_reply_id);
    const filhos = replies.filter(
      r =>
        r.parent_reply_id !== null &&
        r.parent_reply_id !== undefined &&
        r.parent_reply_id !== ''
    );

    console.log('RAIZ:', raiz);
    console.log('FILHOS:', filhos);

    repliesList.innerHTML = raiz
      .map(r => `<p>${r.content}</p>`)
      .join('');

  } catch (err) {
    console.error('ERRO:', err);
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
  if (post.is_quote && post.quoted_post_id) loadQuoteCards(container);
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

  const modalFileInput = document.getElementById('modalFileInput');
  const btnImgModal = document.getElementById('btnImgModal');

  btnImgModal?.addEventListener('click', (e) => {
    e.stopPropagation();
    modalFileInput?.click();
  });

  modalFileInput?.addEventListener('change', () => {
    if (!mediaComposer) return;
    const files = Array.from(modalFileInput.files || []);
    if (files.length > 0) {
      mediaComposer.openFilePicker();
    }
    modalFileInput.value = '';
  });

  submitBtn?.addEventListener('click', async () => {
    const content = modalInput?.value ?? '';
    await handleSubmitPost(content, 'modal');
    closeModal();
  });
}

async function handleSubmitPost(content, source = 'feed') {
  content = content?.trim();
  const hasModalMedia = mediaComposer?.hasFiles() ?? false;
  const hasFeedMedia = feedSelectedFiles.length > 0;

  if (!content && !hasModalMedia && !hasFeedMedia) return;
  if (!currentProfile) { showNotification('Faça login para postar! 🔐'); return; }

  const postInput = document.getElementById('postInput');
  const modalInput = document.getElementById('modalPostInput');
  const previewArea = document.getElementById('feedImgPreview');

  if (postInput) { postInput.value = ''; postInput.style.height = 'auto'; }
  if (modalInput) modalInput.value = '';

  try {
    let mediaUrls = [];

    if (hasModalMedia) {
      showNotification('Enviando fotos... 📸');
      mediaUrls = await uploadPostMedia(mediaComposer.getFiles());
      mediaComposer.clearFiles();
    } else if (hasFeedMedia) {
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
// PERFIL (Com Adição de Banner)
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
      postsToRender = [...myPosts, ...myReposts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
 
async function renderProfileLocked(profile, profileInfo) {
  document.getElementById('ownPrivacyBadge')?.remove();
  document.getElementById('profileActionsWrapper')?.remove(); // Limpa botões antigos

  const controller = new AbortController();
  profileBtnControllers.push(controller);
  const signal = controller.signal;

  if (currentProfile) {
    // Cria um agrupador para os botões ficarem lado a lado
    const actionsWrapper = document.createElement('div');
    actionsWrapper.id = 'profileActionsWrapper';
    actionsWrapper.style.cssText = 'position: absolute; top: 15px; right: 20px; display: flex; gap: 8px; z-index: 10;';
    profileInfo.appendChild(actionsWrapper);

    await renderFollowButton(profile, actionsWrapper, signal);
  }

  const content = document.getElementById('profileContent');
  content.innerHTML = `
    <div id="privateProfileBanner" style="
      display:flex;flex-direction:column;align-items:center;
      padding:60px 24px;text-align:center;gap:16px;
    ">
      <div style="font-size:56px;opacity:0.6;">🔒</div>
      <p style="font-size:19px;font-weight:800;color:var(--text-primary);margin:0;">
        Conta privada
      </p>
      <p style="font-size:14px;color:var(--text-secondary);max-width:300px;margin:0;line-height:1.6;">
        Apenas seguidores aprovados por <strong>@${escapeHtml(profile.handle)}</strong>
        podem ver os posts desta conta.
      </p>
      ${currentProfile
        ? '<p style="font-size:13px;color:var(--text-secondary);margin:0;">Use o botão acima para solicitar acesso.</p>'
        : '<p style="font-size:13px;color:var(--text-secondary);margin:0;">Faça login e solicite acesso para ver os posts.</p>'
      }
    </div>`;
}

// ============================================================
// VISUALIZADOR DE IMAGENS (MODAL DE ZOOM PARA AVATAR/BANNER)
// ============================================================
window.openImageViewer = function(imageUrl) {
    if (!imageUrl) return;

    let viewer = document.getElementById('imageViewerModal');
    
    // Cria o modal dinamicamente se ele ainda não existir
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'imageViewerModal';
        viewer.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.85); display: flex;
            align-items: center; justify-content: center;
            backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.2s ease;
        `;
        
        viewer.innerHTML = `
            <button id="closeImageViewer" style="
                position: absolute; top: 20px; right: 24px; background: rgba(0,0,0,0.5); 
                border: none; color: white; width: 40px; height: 40px; border-radius: 50%;
                font-size: 24px; cursor: pointer; z-index: 100000; transition: background 0.2s;
                display: flex; align-items: center; justify-content: center;
            " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.5)'">✕</button>
            <img id="imageViewerImg" src="" style="
                max-width: 90vw; max-height: 90vh; border-radius: 12px; 
                box-shadow: 0 10px 40px rgba(0,0,0,0.5); object-fit: contain; 
                transform: scale(0.9); transition: transform 0.2s ease;
            ">
        `;
        document.body.appendChild(viewer);
        
        // Função para fechar o visualizador com animação
        const closeFn = () => {
            viewer.style.opacity = '0';
            document.getElementById('imageViewerImg').style.transform = 'scale(0.9)';
            setTimeout(() => viewer.style.display = 'none', 200);
        };
        
        document.getElementById('closeImageViewer').addEventListener('click', closeFn);
        viewer.addEventListener('click', (e) => { if (e.target === viewer) closeFn(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && viewer.style.display === 'flex') closeFn(); });
    }
    
    // Atualiza a imagem e mostra o modal
    const imgEl = document.getElementById('imageViewerImg');
    imgEl.src = imageUrl;
    viewer.style.display = 'flex';
    void viewer.offsetWidth; // Força renderização
    viewer.style.opacity = '1';
    imgEl.style.transform = 'scale(1)';
};

// ============================================================
// CARREGAR PÁGINA DE PERFIL
// ============================================================
async function loadProfilePage() {
  profileBtnControllers.forEach(ctrl => ctrl.abort());
  profileBtnControllers = [];

  document.getElementById('visitorsWidget')?.remove();

  const editBtn = document.getElementById('editProfileBtn');
  const profile = viewingProfile || currentProfile;

  if (!profile) {
    document.getElementById('profileName').textContent = 'Visitante';
    document.getElementById('profileHandle').textContent = '@anonimo';
    document.getElementById('profileBio').textContent = 'Faça login para ter seu próprio perfil!';
    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileAvatar) profileAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=visitante';
    document.querySelectorAll('.stat-value').forEach(el => { el.textContent = '0'; });
    if (editBtn) { editBtn.textContent = 'Fazer Login'; editBtn.style.display = 'block'; }
    document.getElementById('msgProfileBtn')?.remove();
    document.getElementById('followProfileBtn')?.remove();
    document.getElementById('profileActionsWrapper')?.remove();
    document.getElementById('profileContent').innerHTML =
      '<p style="padding:40px;text-align:center;color:var(--text-secondary);">Faça login para visualizar seus posts. 🚀</p>';
    return; 
  }

  const isOwnProfile = currentProfile && profile.id === currentProfile.id;

  document.querySelectorAll('#profileBannerDisplay, .profile-banner, .profile-cover, .profile-bg').forEach(el => el.remove());

  const profileInfoContainer = document.querySelector('.profile-info');
  
  if (profileInfoContainer) {
      if (profileInfoContainer.parentElement) {
          profileInfoContainer.parentElement.style.background = 'transparent';
          profileInfoContainer.parentElement.style.border = 'none';
          
          Array.from(profileInfoContainer.parentElement.children).forEach(child => {
              if (child !== profileInfoContainer && child.tagName === 'DIV' && !child.innerHTML.trim() && !child.id) {
                  child.style.display = 'none';
              }
          });
      }

      const bannerEl = document.createElement('div');
      bannerEl.id = 'profileBannerDisplay';
      const defaultBanner = 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1200&auto=format&fit=crop';
      
      // GUARDA O URL FINAL DO BANNER PARA USAR NO CLIQUE
      const finalBannerUrl = profile.banner_url || defaultBanner;
      
      bannerEl.style.cssText = `
        width: 100%;
        height: 220px;
        background-image: linear-gradient(to bottom, rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.75) 100%), url('${finalBannerUrl}');
        background-size: cover;
        background-position: center;
        border-radius: 16px 16px 0 0;
        border: 1px solid var(--border);
        border-bottom: none;
        margin-bottom: -50px; 
        position: relative;
        z-index: 1;
        cursor: pointer;
      `;

      // ADICIONA O EVENTO DE CLIQUE AO BANNER
      bannerEl.onclick = () => window.openImageViewer(finalBannerUrl);

      profileInfoContainer.style.position = 'relative';
      profileInfoContainer.style.zIndex = '2';
      profileInfoContainer.style.paddingTop = '10px';

      const avatarImg = profileInfoContainer.querySelector('.profile-avatar');
      if (avatarImg) {
          avatarImg.style.position = 'relative';
          avatarImg.style.border = '4px solid var(--dark-bg-secondary, #150f16)';
          avatarImg.style.backgroundColor = 'var(--dark-bg-secondary, #150f16)';
          avatarImg.style.borderRadius = '50%';
      }

      profileInfoContainer.parentElement.insertBefore(bannerEl, profileInfoContainer);
  }

  const _nameEl = document.getElementById('profileName');
  if (_nameEl) {
    const _isViewedPremium = isOwnProfile ? isPremium() : profileIsPremium(profile);
    _nameEl.innerHTML = escapeHtml(profile.name) + (_isViewedPremium ? ` <span class="premium-badge-tag" title="Usuário Premium">✦ Premium</span>` : '');
  }

  document.getElementById('profileHandle').textContent = `@${profile.handle}`;
  document.getElementById('profileBio').textContent = profile.bio || 'Sem bio.';

  const profileAvatar = document.querySelector('.profile-avatar');
  if (profileAvatar) {
    // GUARDA O URL DA FOTO PARA USAR NO CLIQUE
    const finalAvatarUrl = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.handle}`;
    profileAvatar.src = finalAvatarUrl;
    
    // ADICIONA O EVENTO DE CLIQUE À FOTO DE PERFIL
    profileAvatar.style.cursor = 'pointer';
    profileAvatar.onclick = (e) => {
        e.stopPropagation();
        window.openImageViewer(finalAvatarUrl);
    };
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
  
  const followCtrl = new AbortController();
  profileBtnControllers.push(followCtrl);
  const followSignal = followCtrl.signal;

  const btnShowFollowing = document.getElementById('btnShowFollowing');
  const btnShowFollowers = document.getElementById('btnShowFollowers');

  if (btnShowFollowing) {
    btnShowFollowing.addEventListener('click', () => {
      openFollowListModal('following', profile.id);
    }, { signal: followSignal });
  }
  
  if (btnShowFollowers) {
    btnShowFollowers.addEventListener('click', () => {
      openFollowListModal('followers', profile.id);
    }, { signal: followSignal });
  }

  document.getElementById('msgProfileBtn')?.remove();
  document.getElementById('followProfileBtn')?.remove();
  document.getElementById('profileActionsWrapper')?.remove();
  document.getElementById('privateProfileBanner')?.remove();

  if (isOwnProfile) {
    if (editBtn) { editBtn.textContent = 'Editar Perfil'; editBtn.style.display = 'block'; }

    let privacyBadge = document.getElementById('ownPrivacyBadge');
    if (!privacyBadge) {
      privacyBadge = document.createElement('span');
      privacyBadge.id = 'ownPrivacyBadge';
      privacyBadge.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;
        font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;
        margin-left:8px;
      `;
      document.getElementById('profileHandle').insertAdjacentElement('afterend', privacyBadge);
    }
    const isPrivate = profile.is_private ?? false;
    privacyBadge.textContent = isPrivate ? '🔒 Conta privada' : '🌐 Conta pública';
    privacyBadge.style.background = isPrivate ? 'var(--primary)22' : '#17bf6322';
    privacyBadge.style.color = isPrivate ? 'var(--primary)' : '#17bf63';

    const tabs = document.querySelectorAll('.profile-tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector('.profile-tab-btn[data-tab="posts"]')?.classList.add('active');
    loadProfileTabContent('posts');

    renderVisitorsWidget(profile.id);

  } else {
    if (editBtn) editBtn.style.display = 'none';

    document.getElementById('ownPrivacyBadge')?.remove();

    // Registra visita
    recordProfileVisit(profile.id);

    const podeVer = await canViewProfile(profile.id);

    if (!podeVer) {
      renderProfileLocked(profile, profileInfoContainer);
      return;
    }

    if (currentProfile) {
      const controller = new AbortController();
      profileBtnControllers.push(controller);
      const signal = controller.signal;

      // Agrupador de botões
      const actionsWrapper = document.createElement('div');
      actionsWrapper.id = 'profileActionsWrapper';
      actionsWrapper.style.cssText = 'position: absolute; top: 15px; right: 20px; display: flex; gap: 8px; z-index: 10;';
      profileInfoContainer.appendChild(actionsWrapper);

      const msgBtn = document.createElement('button');
      msgBtn.id = 'msgProfileBtn';
      msgBtn.className = 'edit-profile-btn';
      msgBtn.style.cssText = 'position: relative; top: 0; right: 0; border-color:var(--primary);color:var(--primary); margin: 0;';
      msgBtn.textContent = '✉ Mensagem';
      msgBtn.addEventListener('click', async () => {
        try {
          const conv = await getOrCreateConversation(profile.id);
          document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
          document.getElementById('messages-page').classList.add('active');
          await loadMessagesPage();
          openChat(conv.id, profile);
          document.querySelector('.messages-wrapper')?.classList.add('mobile-chat-open');
        } catch (err) { showNotification('Erro ao abrir conversa.'); }
      }, { signal });
      actionsWrapper.appendChild(msgBtn);

      await renderFollowButton(profile, actionsWrapper, signal);
    }

    const tabs = document.querySelectorAll('.profile-tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector('.profile-tab-btn[data-tab="posts"]')?.classList.add('active');
    loadProfileTabContent('posts');
  }
}
async function renderFollowButton(profile, parentContainer, signal) {
  const followBtn = document.createElement('button');
  followBtn.id = 'followProfileBtn';
  followBtn.className = 'edit-profile-btn';
  // Desativa o posicionamento absoluto dentro do contêiner para não empilhar
  followBtn.style.cssText = 'position: relative; top: 0; right: 0; margin: 0;';

  let alreadyFollowing = false;
  let requestStatus = 'none';
  const isPrivate = profile.is_private ?? false;

  try { alreadyFollowing = await isFollowing(profile.id); } catch (_) {}
  if (!alreadyFollowing && isPrivate) {
    try { requestStatus = await getFollowRequestStatus(profile.id); } catch (_) {}
  }

  const setFollowState = (state) => {
    if (state === 'following') {
      followBtn.textContent = '✓ Seguindo';
      followBtn.style.background = 'var(--primary)';
      followBtn.style.color = 'white';
      followBtn.dataset.state = 'following';
    } else if (state === 'pending') {
      followBtn.textContent = '⏳ Solicitado';
      followBtn.style.background = 'var(--dark-bg-secondary,#1e1e2e)';
      followBtn.style.color = 'var(--text-secondary)';
      followBtn.style.border = '1px solid var(--border)';
      followBtn.dataset.state = 'pending';
    } else {
      followBtn.textContent = isPrivate ? '🔒 Solicitar' : '+ Seguir';
      followBtn.style.background = '';
      followBtn.style.color = '';
      followBtn.dataset.state = 'none';
    }
  };

  const initialState = alreadyFollowing ? 'following'
    : requestStatus === 'pending' ? 'pending'
    : 'none';
  setFollowState(initialState);

  followBtn.addEventListener('click', async () => {
    followBtn.disabled = true;
    const state = followBtn.dataset.state;

    try {
      if (state === 'following') {
        await unfollowUserAndSync(currentProfile.id, profile.id);
        setFollowState('none');
        const statVals = document.querySelectorAll('.stat-value');
        if (statVals.length >= 2)
          statVals[1].textContent = Math.max(0, parseInt(statVals[1].textContent) - 1);

        if (isPrivate) {
          document.getElementById('msgProfileBtn')?.remove();
          document.getElementById('followProfileBtn')?.remove();
          document.getElementById('profileActionsWrapper')?.remove();
          const info = document.querySelector('.profile-info');
          await renderProfileLocked(profile, info);
          return;
        }

      } else if (state === 'pending') {
        await cancelFollowRequest(profile.id);
        setFollowState('none');
        showNotification('Solicitação cancelada.');

      } else {
        if (isPrivate) {
          await requestFollow(profile.id);
          setFollowState('pending');
          showNotification('Solicitação enviada! ⏳');
          await createNotification({
            toUserId: profile.id,
            actorId: currentProfile.id,
            type: NOTIF_TYPES.FOLLOW_REQUEST ?? 'follow_request',
          });
        } else {
          await followUserAndSync(currentProfile.id, profile.id);
          setFollowState('following');
          const statVals = document.querySelectorAll('.stat-value');
          if (statVals.length >= 2)
            statVals[1].textContent = parseInt(statVals[1].textContent) + 1;
          await createNotification({
            toUserId: profile.id,
            actorId: currentProfile.id,
            type: NOTIF_TYPES.FOLLOW,
          });
        }
      }
    } catch (err) {
      console.error('[followBtn]', err);
      showNotification('Erro ao processar. Tente novamente.');
    } finally {
      followBtn.disabled = false;
    }
  }, { signal });

  parentContainer.appendChild(followBtn);
}
 
function setupPrivacySettings() {
  document.addEventListener('change', async (e) => {
    const toggle = e.target.closest('#privacyToggle');
    if (!toggle) return;
    if (!currentProfile) {
      showNotification('Faça login para alterar. 🔐');
      toggle.checked = !toggle.checked;
      return;
    }
    const isPrivate = toggle.checked;
    try {
      toggle.disabled = true;
      const updated = await setAccountPrivacy(isPrivate);
      currentProfile = { ...currentProfile, is_private: updated.is_private };
      showNotification(isPrivate
        ? 'Conta privada ativada 🔒'
        : 'Conta pública ativada 🌐');
    } catch (err) {
      console.error('[privacy]', err);
      toggle.checked = !isPrivate;
      showNotification('Erro ao salvar configuração.');
    } finally {
      toggle.disabled = false;
    }
  });
 
  refreshPendingBadge();
}
 
async function renderVisitorsWidget(profileId) {
  document.getElementById('visitorsWidget')?.remove();
  const profileContent = document.getElementById('profileContent');
  if (!profileContent) return;
 
  const userIsPremium = isPremium();
 
  const widget = document.createElement('div');
  widget.id = 'visitorsWidget';
  widget.style.cssText = 'padding:20px;border-bottom:1px solid var(--border);margin-bottom:4px;';
  widget.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <span style="font-size:16px;">👁️</span>
      <h3 style="font-size:15px;font-weight:800;color:var(--text-primary);margin:0;">Quem visitou seu perfil</h3>
      ${!userIsPremium
        ? `<span style="font-size:10px;font-weight:700;background:linear-gradient(135deg,#ffd700,#ff8c00);color:#1a0008;padding:2px 8px;border-radius:10px;margin-left:auto;">✦ PREMIUM</span>`
        : `<span style="font-size:10px;font-weight:700;background:var(--primary)22;color:var(--primary);border:1px solid var(--primary)44;padding:2px 8px;border-radius:10px;margin-left:auto;">Ativo ✓</span>`
      }
    </div>
    <div id="visitorsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:10px;">
      <div style="color:var(--text-secondary);font-size:13px;grid-column:1/-1;text-align:center;padding:8px;">Carregando...</div>
    </div>
    ${!userIsPremium ? `
      <div id="premiumVisitorsTeaser" style="margin-top:14px;padding:14px 16px;background:linear-gradient(135deg,#ffd70011,#ff8c0011);border:1px solid #ffd70033;border-radius:12px;display:flex;align-items:center;gap:12px;cursor:pointer;">
        <span style="font-size:22px;">✦</span>
        <div style="flex:1;">
          <p style="font-weight:700;font-size:13px;color:#ffd700;margin:0 0 2px;">Ative o Premium para ver quem visitou</p>
          <p style="font-size:12px;color:var(--text-secondary);margin:0;">Veja os perfis completos de quem te visitou</p>
        </div>
        <button id="btnActivatePremiumWidget" style="background:linear-gradient(135deg,#ffd700,#ff8c00);color:#1a0008;border:none;border-radius:20px;padding:8px 16px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;flex-shrink:0;">Ativar Grátis</button>
      </div>
    ` : ''}
  `;
 
  profileContent.parentElement?.insertBefore(widget, profileContent);
 
  const visitors = await getProfileVisitors(profileId, 12);
  const grid = document.getElementById('visitorsGrid');
  if (!grid) return;
 
  if (visitors.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:20px 0;">
        <div style="font-size:32px;margin-bottom:8px;opacity:0.5;">👀</div>
        <p style="color:var(--text-secondary);font-size:13px;margin:0;">Nenhuma visita registrada ainda</p>
        <p style="color:var(--text-secondary);font-size:11px;margin:6px 0 0;opacity:0.7;">Quando alguém ver seu perfil, aparece aqui</p>
      </div>`;
  } else {
    grid.innerHTML = visitors.map((v, i) => {
      const avatar = v.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.handle}`;
      const shouldBlur = !userIsPremium && i >= 2;
 
      return `
        <div class="visitor-avatar-wrap" data-handle="${shouldBlur ? '' : escapeHtml(v.handle ?? '')}"
          data-blurred="${shouldBlur}"
          style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:${shouldBlur ? 'pointer' : 'pointer'};">
          <div style="position:relative;width:52px;height:52px;">
            <img src="${avatar}"
              style="width:52px;height:52px;border-radius:50%;object-fit:cover;
                     border:2px solid ${v.is_premium ? '#ffd700' : 'var(--border)'};
                     ${shouldBlur ? 'filter:blur(8px);' : ''}
                     transition:transform 0.15s;"
              loading="lazy">
            ${shouldBlur
              ? `<div style="position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,0.25);
                            display:flex;align-items:center;justify-content:center;">
                   <span style="font-size:18px;">🔒</span>
                 </div>`
              : (v.is_premium
                  ? `<div style="position:absolute;bottom:-2px;right:-2px;background:#ffd700;
                                border-radius:50%;width:16px;height:16px;display:flex;
                                align-items:center;justify-content:center;font-size:9px;border:1px solid var(--dark-bg);">✦</div>`
                  : '')
            }
          </div>
          <span style="font-size:10px;color:var(--text-secondary);white-space:nowrap;
                       overflow:hidden;text-overflow:ellipsis;max-width:60px;text-align:center;
                       ${shouldBlur ? 'filter:blur(5px);user-select:none;' : ''}">
            ${shouldBlur ? '••••••' : '@' + escapeHtml(v.handle ?? '')}
          </span>
        </div>`;
    }).join('');
 
    grid.querySelectorAll('.visitor-avatar-wrap').forEach((wrap) => {
      wrap.addEventListener('click', () => {
        const isBlurred = wrap.dataset.blurred === 'true';
 
        if (isBlurred) {
          showVisitorPremiumModal();
          return;
        }
 
        const handle = wrap.dataset.handle;
        if (!handle) return;
        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.getElementById('profile-page').classList.add('active');
        loadProfileByHandle(handle);
      });
    });
  }
 
  document.getElementById('btnActivatePremiumWidget')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openPremiumModal();
  });
 
  document.getElementById('premiumVisitorsTeaser')?.addEventListener('click', (e) => {
    if (!e.target.closest('#btnActivatePremiumWidget')) openPremiumModal();
  });
}

function openPremiumModal() {
  document.getElementById('premiumModal')?.remove();

  const alreadyPremium = isPremium();

  const modal = document.createElement('div');
  modal.id = 'premiumModal';

  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:9999;
    background:rgba(0,0,0,0.88);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    backdrop-filter:blur(10px);
    animation:fadeIn .2s ease;
  `;

  modal.innerHTML = `
    <div style="
      background:linear-gradient(180deg,var(--dark-bg-secondary),#111);
      border:1px solid rgba(255,215,0,0.18);
      border-radius:28px;
      width:100%;
      max-width:470px;
      padding:38px 32px;
      position:relative;
      box-shadow:
        0 0 70px rgba(255,215,0,0.10),
        0 10px 40px rgba(0,0,0,0.45);
      text-align:center;
      overflow:hidden;
    ">

      <div style="
        position:absolute;
        top:-120px;
        right:-120px;
        width:220px;
        height:220px;
        background:radial-gradient(circle,#ffd70033,transparent 70%);
        pointer-events:none;
      "></div>

      <button id="closePremiumModal"
        style="
          position:absolute;
          top:16px;
          right:16px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.06);
          color:var(--text-secondary);
          font-size:18px;
          cursor:pointer;
          width:34px;
          height:34px;
          border-radius:10px;
          transition:.2s;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.08)'"
        onmouseout="this.style.background='rgba(255,255,255,0.04)'"
      >
        ✕
      </button>

      <div style="
        width:82px;
        height:82px;
        margin:0 auto 18px;
        border-radius:50%;
        background:linear-gradient(135deg,#ffd700,#ff8c00);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:38px;
        color:#1a0008;
        box-shadow:0 8px 30px rgba(255,215,0,0.25);
      ">
        ✦
      </div>

      <div style="
        display:inline-block;
        background:linear-gradient(135deg,#ffd700,#ff8c00);
        color:#1a0008;
        font-weight:900;
        font-size:11px;
        padding:5px 16px;
        border-radius:999px;
        letter-spacing:1px;
        text-transform:uppercase;
        margin-bottom:22px;
      ">
        VazaPUC Premium
      </div>

      <h2 style="
        font-size:28px;
        font-weight:900;
        color:var(--text-primary);
        margin:0 0 10px;
        line-height:1.2;
      ">
        ${
          alreadyPremium
            ? 'Você já faz parte do Premium ✦'
            : 'Desbloqueie recursos exclusivos'
        }
      </h2>

      <p style="
        color:var(--text-secondary);
        font-size:15px;
        line-height:1.7;
        margin:0 0 30px;
      ">
        ${
          alreadyPremium
            ? 'Aproveite todos os benefícios premium da sua conta.'
            : 'Tenha acesso a funcionalidades exclusivas, navegação avançada e recursos liberados apenas para membros Premium.'
        }
      </p>

      <div style="
        background:rgba(255,255,255,0.02);
        border:1px solid var(--border);
        border-radius:20px;
        padding:20px;
        margin-bottom:26px;
        text-align:left;
      ">

        ${[
          ['👁️','Ver quem visitou seu perfil'],
          ['❤️','Ver curtidas exclusivas'],
          ['👻','Modo Ghost invisível'],
          ['💬','Mensagens ilimitadas'],
          ['🚫','Experiência sem anúncios'],
          ['⚡','Destaque nos posts'],
        ].map(([icon,text]) => `
          <div style="
            display:flex;
            align-items:center;
            gap:12px;
            padding:12px 0;
            border-bottom:1px solid rgba(255,255,255,0.05);
          ">

            <div style="
              min-width:34px;
              height:34px;
              border-radius:10px;
              background:rgba(255,215,0,0.08);
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:16px;
            ">
              ${icon}
            </div>

            <span style="
              font-size:14px;
              color:var(--text-primary);
              font-weight:500;
            ">
              ${text}
            </span>

            <span style="
              margin-left:auto;
              color:#ffd700;
              font-size:13px;
              font-weight:700;
            ">
              ✓
            </span>

          </div>
        `).join('')}

      </div>

      ${
        alreadyPremium
          ? `
            <button id="deactivatePremiumBtn"
              style="
                width:100%;
                padding:15px;
                border-radius:18px;
                font-size:14px;
                font-weight:700;
                cursor:pointer;
                background:rgba(255,255,255,0.03);
                border:1px solid var(--border);
                color:var(--text-secondary);
                transition:.2s;
              "
              onmouseover="this.style.opacity='0.8'"
              onmouseout="this.style.opacity='1'"
            >
              Desativar Premium
            </button>
          `
          : `
            <button id="activatePremiumBtn"
              style="
                width:100%;
                padding:17px;
                border-radius:20px;
                font-size:16px;
                font-weight:900;
                cursor:pointer;
                border:none;
                background:linear-gradient(135deg,#ffd700,#ff8c00);
                color:#1a0008;
                box-shadow:0 8px 30px rgba(255,215,0,0.25);
                transition:.2s;
              "
              onmouseover="
                this.style.transform='translateY(-2px)';
                this.style.boxShadow='0 12px 35px rgba(255,215,0,0.35)';
              "
              onmouseout="
                this.style.transform='translateY(0)';
                this.style.boxShadow='0 8px 30px rgba(255,215,0,0.25)';
              "
            >
              ✦ Quero ser Premium
            </button>

            <p style="
              font-size:11px;
              color:var(--text-secondary);
              margin:12px 0 0;
            ">
              Novas vantagens exclusivas sendo adicionadas constantemente.
            </p>
          `
      }

    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closePremiumModal')
    ?.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('activatePremiumBtn')
    ?.addEventListener('click', async () => {

      activatePremium();

      if (currentProfile) {
        currentProfile = {
          ...currentProfile,
          is_premium: true
        };

        window.currentProfile = currentProfile;
      }

      modal.remove();

      showNotification('✦ Premium ativado! Bem-vindo ao clube.');

      await loadProfilePage();
    });

  document.getElementById('deactivatePremiumBtn')
    ?.addEventListener('click', async () => {

      deactivatePremium();

      if (currentProfile) {
        currentProfile = {
          ...currentProfile,
          is_premium: false
        };

        window.currentProfile = currentProfile;
      }

      modal.remove();

      showNotification('Premium desativado.');

      await loadProfilePage();
    });
}

window.openPremiumModal = openPremiumModal;
function openPremiumModalCurtida() {
  document.getElementById('premiumModal')?.remove();

  const alreadyPremium = isPremium();

  const modal = document.createElement('div');
  modal.id = 'premiumModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';

  modal.innerHTML = `
    <div style="background:var(--dark-bg-secondary);border:1px solid #ffd70033;border-radius:24px;width:100%;max-width:460px;padding:36px 32px;position:relative;box-shadow:0 0 60px rgba(255,215,0,0.15);text-align:center;">

      <button id="closePremiumModal"
        style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;">
        ✕
      </button>

      <div style="font-size:52px;margin-bottom:8px;">🔒</div>

      <div style="display:inline-block;
        background:linear-gradient(135deg,#ffd700,#ff8c00);
        color:#1a0008;
        font-weight:800;
        font-size:11px;
        padding:5px 14px;
        border-radius:20px;
        letter-spacing:1px;
        text-transform:uppercase;
        margin-bottom:20px;">
        VazaPUC Premium
      </div>

      <h2 style="font-size:26px;font-weight:800;color:var(--text-primary);margin:0 0 10px;">
        ${alreadyPremium
          ? 'Você já possui o Premium ✦'
          : 'Conteúdo exclusivo para Premium'}
      </h2>

      <p style="color:var(--text-secondary);font-size:15px;line-height:1.7;margin:0 0 28px;">
        ${alreadyPremium
          ? 'Aproveite todos os recursos exclusivos disponíveis na sua conta.'
          : 'Quer ver quem curtiu os perfis de outras pessoas e desbloquear diversos benefícios exclusivos? Acesse agora nossa área Premium.'}
      </p>

      <div style="
        background:var(--dark-bg);
        border:1px solid var(--border);
        border-radius:18px;
        padding:20px;
        margin-bottom:24px;
        text-align:left;
      ">
        ${[
          ['❤️','Ver curtidas de outros usuários'],
          ['👁️','Ver quem visitou seu perfil'],
          ['👻','Modo Ghost invisível'],
          ['💬','Mensagens ilimitadas'],
          ['🚫','Sem anúncios'],
          ['⚡','Destaque no feed'],
        ].map(([icon,text]) => `
          <div style="
            display:flex;
            align-items:center;
            gap:12px;
            padding:10px 0;
            border-bottom:1px solid var(--border);
          ">
            <span style="font-size:18px;width:24px;text-align:center;">
              ${icon}
            </span>

            <span style="font-size:14px;color:var(--text-primary);">
              ${text}
            </span>

            <span style="margin-left:auto;color:#ffd700;font-size:13px;">
              ✓
            </span>
          </div>
        `).join('')}
      </div>

      ${
        alreadyPremium
          ? `
            <button id="deactivatePremiumBtn"
              style="
                width:100%;
                padding:14px;
                border-radius:18px;
                font-size:14px;
                font-weight:700;
                cursor:pointer;
                background:none;
                border:1px solid var(--border);
                color:var(--text-secondary);
              ">
              Desativar Premium
            </button>
          `
          : `
            <button id="activatePremiumBtn"
              style="
                width:100%;
                padding:16px;
                border-radius:20px;
                font-size:16px;
                font-weight:800;
                cursor:pointer;
                border:none;
                background:linear-gradient(135deg,#ffd700,#ff8c00);
                color:#1a0008;
                box-shadow:0 4px 20px rgba(255,215,0,0.3);
                transition:0.2s;
              "
              onmouseover="this.style.transform='translateY(-2px)'"
              onmouseout="this.style.transform='translateY(0)'">
              ✦ Quero acessar o Premium
            </button>

            <p style="font-size:11px;color:var(--text-secondary);margin:10px 0 0;">
              Novos recursos exclusivos chegando em breve.
            </p>
          `
      }

    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closePremiumModal')
    ?.addEventListener('click', () => modal.remove());

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('activatePremiumBtn')
    ?.addEventListener('click', async () => {

      activatePremium();

      if (currentProfile) {
        currentProfile = {
          ...currentProfile,
          is_premium: true
        };

        window.currentProfile = currentProfile;
      }

      modal.remove();

      showNotification('✦ Premium ativado com sucesso!');

      await loadProfilePage();
    });

  document.getElementById('deactivatePremiumBtn')
    ?.addEventListener('click', async () => {

      deactivatePremium();

      if (currentProfile) {
        currentProfile = {
          ...currentProfile,
          is_premium: false
        };

        window.currentProfile = currentProfile;
      }

      modal.remove();

      showNotification('Premium desativado.');

      await loadProfilePage();
    });
}

window.openPremiumModalCurtida = openPremiumModalCurtida;
function showVisitorPremiumModal() {
  document.getElementById('visitorPremiumModal')?.remove();
 
  const modal = document.createElement('div');
  modal.id = 'visitorPremiumModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;
    padding:20px;backdrop-filter:blur(8px);
  `;
  modal.innerHTML = `
    <div style="
      background:var(--dark-bg-secondary);
      border:1px solid #ffd70033;border-radius:24px;
      width:100%;max-width:380px;padding:36px 28px;
      position:relative;text-align:center;
      box-shadow:0 0 60px rgba(255,215,0,0.15);
      animation:slideDown 0.25s ease;
    ">
      <button id="closeVisitorModal" style="
        position:absolute;top:14px;right:14px;
        background:none;border:none;color:var(--text-secondary);
        font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;
      ">✕</button>
 
      <div style="position:relative;width:72px;height:72px;margin:0 auto 20px;">
        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=mystery123"
          style="width:72px;height:72px;border-radius:50%;object-fit:cover;
                 filter:blur(10px);border:3px solid #ffd70066;">
        <div style="position:absolute;inset:0;border-radius:50%;
                    background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;">🔒</span>
        </div>
      </div>
 
      <div style="font-size:36px;margin-bottom:4px;">✦</div>
      <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);margin:0 0 10px;">
        Alguém visitou seu perfil!
      </h2>
      <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin:0 0 24px;">
        Ative o <strong style="color:#ffd700;">VazaPUC Premium</strong> para descobrir
        quem são todos os seus visitantes.
      </p>
 
      <div style="
        background:var(--dark-bg);border:1px solid var(--border);
        border-radius:14px;padding:14px 16px;margin-bottom:22px;text-align:left;
      ">
        ${[
          '👁️ Ver todos os visitantes do seu perfil',
          '👻 Modo Ghost — visite sem ser visto',
          '✦ Badge Premium exclusivo',
          '🔔 Notificação de nova visita',
        ].map(item => `
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;
                      border-bottom:1px solid var(--border);">
            <span style="font-size:13px;color:var(--text-primary);">${item}</span>
          </div>`).join('')}
      </div>
 
      <button id="activatePremiumFromVisitor" style="
        width:100%;padding:14px;border-radius:20px;font-size:15px;font-weight:800;
        cursor:pointer;border:none;
        background:linear-gradient(135deg,#ffd700,#ff8c00);color:#1a0008;
        box-shadow:0 4px 20px rgba(255,215,0,0.3);
        transition:transform 0.15s;
      "
      onmouseover="this.style.transform='translateY(-2px)'"
      onmouseout="this.style.transform=''">
        ✦ Ativar Premium Gratuitamente
      </button>
      <p style="font-size:11px;color:var(--text-secondary);margin:10px 0 0;">
        Modo de teste — sem cobranças.
      </p>
    </div>
  `;
 
  document.body.appendChild(modal);
 
  document.getElementById('closeVisitorModal')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
 
  document.getElementById('activatePremiumFromVisitor')?.addEventListener('click', async () => {
    modal.remove();
    activatePremium();
    if (window.currentProfile) {
      window.currentProfile = { ...window.currentProfile, is_premium: true };
    }
    showNotification('✦ Premium ativado! Agora você pode ver todos os visitantes.');
    await loadProfilePage();
  });
}
async function refreshPendingBadge() {
  if (!currentProfile) return;
  try {
    const count = await getPendingRequestsCount();
    const badge = document.getElementById('pendingRequestsBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'inline-flex';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('[refreshPendingBadge]', err);
  }
}
 
window.refreshPendingBadge = refreshPendingBadge;

async function loadPendingRequestsPanel() {
  const panel = document.getElementById('pendingRequestsPanel');
  if (!panel) return;
 
  panel.innerHTML = `
    <div style="padding:20px;text-align:center;color:var(--text-secondary);">
      <div style="font-size:24px;margin-bottom:8px;">⏳</div>
      Carregando solicitações...
    </div>`;
 
  try {
    const requests = await getPendingFollowRequests();
 
    if (!requests || requests.length === 0) {
      panel.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-secondary);">
          <div style="font-size:36px;margin-bottom:12px;">✅</div>
          <p style="font-size:15px;font-weight:700;margin:0;">Nenhuma solicitação pendente</p>
          <p style="font-size:13px;color:var(--text-secondary);margin:8px 0 0;">
            Quando alguém quiser seguir você, aparecerá aqui.
          </p>
        </div>`;
      return;
    }
 
    panel.innerHTML = requests.map(req => {
      const user = req.requester;
      if (!user) return ''; 
      const avatar = user.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle}`;
 
      return `
        <div class="pending-request-item" data-from-id="${user.id}" style="
          display:flex;align-items:center;gap:12px;
          padding:14px 20px;border-bottom:1px solid var(--border);
          transition:background 0.2s;
        "
        onmouseover="this.style.background='var(--dark-bg-tertiary,#1f1520)'"
        onmouseout="this.style.background=''">
          <img src="${avatar}"
            style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--border);"
            loading="lazy">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(user.name ?? 'Usuário')}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);">
              @${escapeHtml(user.handle ?? '')}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <button class="accept-request-btn" data-from-id="${user.id}" style="
              background:var(--primary);color:white;border:none;
              border-radius:20px;padding:8px 16px;font-size:13px;
              font-weight:700;cursor:pointer;transition:opacity 0.2s;
            "
            onmouseover="this.style.opacity='0.85'"
            onmouseout="this.style.opacity='1'">✓ Aceitar</button>
 
            <button class="reject-request-btn" data-from-id="${user.id}" style="
              background:var(--dark-bg-secondary);color:var(--text-secondary);
              border:1px solid var(--border);border-radius:20px;
              padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;
              transition:all 0.2s;
            "
            onmouseover="this.style.borderColor='var(--danger,#e0245e)';this.style.color='var(--danger,#e0245e)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-secondary)'">✕</button>
          </div>
        </div>`;
    }).filter(Boolean).join('');
 
    panel.querySelectorAll('.accept-request-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fromId = btn.dataset.fromId;
        const item = btn.closest('.pending-request-item');
 
        btn.disabled = true;
        btn.textContent = '...';
 
        try {
          await acceptFollowRequest(fromId);
 
          if (item) {
            item.style.transition = 'opacity 0.3s, transform 0.3s';
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
            setTimeout(() => item.remove(), 300);
          }
 
          showNotification('Solicitação aceita! ✅');
          await refreshPendingBadge();
 
          setTimeout(() => {
            const remaining = panel.querySelectorAll('.pending-request-item');
            if (remaining.length === 0) {
              panel.innerHTML = `
                <div style="padding:40px;text-align:center;color:var(--text-secondary);">
                  <div style="font-size:36px;margin-bottom:12px;">✅</div>
                  <p style="font-size:15px;font-weight:700;margin:0;">Nenhuma solicitação pendente</p>
                </div>`;
            }
          }, 350);
 
        } catch (err) {
          console.error('[aceitar solicitação]', err);
          showNotification('Erro ao aceitar. Tente novamente.');
          btn.disabled = false;
          btn.textContent = '✓ Aceitar';
        }
      });
    });
 
    panel.querySelectorAll('.reject-request-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fromId = btn.dataset.fromId;
        const item = btn.closest('.pending-request-item');
 
        btn.disabled = true;
 
        try {
          await rejectFollowRequest(fromId);
 
          if (item) {
            item.style.transition = 'opacity 0.3s';
            item.style.opacity = '0';
            setTimeout(() => item.remove(), 300);
          }
 
          showNotification('Solicitação recusada.');
          await refreshPendingBadge();
 
          setTimeout(() => {
            const remaining = panel.querySelectorAll('.pending-request-item');
            if (remaining.length === 0) {
              panel.innerHTML = `
                <div style="padding:40px;text-align:center;color:var(--text-secondary);">
                  <div style="font-size:36px;margin-bottom:12px;">✅</div>
                  <p style="font-size:15px;font-weight:700;margin:0;">Nenhuma solicitação pendente</p>
                </div>`;
            }
          }, 350);
 
        } catch (err) {
          console.error('[rejeitar solicitação]', err);
          showNotification('Erro ao recusar. Tente novamente.');
          btn.disabled = false;
        }
      });
    });
 
  } catch (err) {
    console.error('[loadPendingRequestsPanel]', err);
    panel.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--danger);">
        <p style="margin:0;font-size:14px;">Erro ao carregar solicitações.</p>
        <p style="margin:8px 0 0;font-size:12px;color:var(--text-secondary);">
          ${err?.message ?? 'Verifique o console para detalhes.'}
        </p>
        <button onclick="loadPendingRequestsPanel()" style="
          margin-top:12px;background:var(--primary);color:white;
          border:none;border-radius:20px;padding:8px 16px;
          font-size:13px;cursor:pointer;
        ">Tentar novamente</button>
      </div>`;
  }
}
 
window.loadPendingRequestsPanel = loadPendingRequestsPanel;

// ============================================================
// MODAL DE EDITAR PERFIL (Com suporte e validação de Banner Segura)
// ============================================================
function setupProfileModal() {
  const editModal = document.getElementById('editProfileModal');
  const openBtn = document.getElementById('editProfileBtn');
  const closeBtn = document.getElementById('closeEditModal');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const saveBtn = document.getElementById('saveEditBtn');

  openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentProfile) { window.location.assign('../inicial/login.html'); return; }
    
    const currentBannerUrl = currentProfile?.banner_url || 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1200&auto=format&fit=crop';

    // Remove qualquer input duplicado ou problemático de banner
    const existingHardcoded = document.querySelector('input#bannerInput')?.closest('.form-group');
    if (existingHardcoded && existingHardcoded.id !== 'bannerInputGroup') {
         existingHardcoded.remove(); 
    }

    let bannerInputGroup = document.getElementById('bannerInputGroup');
    if (!bannerInputGroup) {
        const modalBody = document.querySelector('#editProfileModal .modal-body');
        
        if (modalBody) {
            modalBody.insertAdjacentHTML('afterbegin', `
                <div class="form-group" id="bannerInputGroup" style="margin-bottom: 20px;">
                    <div id="editBannerPreview" style="
                        position: relative;
                        width: 100%;
                        height: 130px;
                        background-image: url('${currentBannerUrl}');
                        background-size: cover;
                        background-position: center;
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border: 1px solid var(--border);
                        overflow: hidden;">
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.5);"></div>

                        <label for="bannerInput" style="
                            position: relative;
                            z-index: 2;
                            cursor: pointer;
                            background: rgba(0,0,0,0.7);
                            color: white;
                            padding: 8px 18px;
                            border-radius: 20px;
                            font-size: 13px;
                            font-weight: 700;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            border: 1px solid rgba(255,255,255,0.2);
                            transition: all 0.2s;
                        " onmouseover="this.style.background='var(--primary)'; this.style.borderColor='var(--primary)';" onmouseout="this.style.background='rgba(0,0,0,0.7)'; this.style.borderColor='rgba(255,255,255,0.2)';">
                            📷 Mudar Capa
                        </label>
                        <input type="file" id="bannerInput" accept="image/*" style="display: none;" />
                    </div>
                    <p style="font-size: 11px; color: var(--text-secondary); margin-top: 6px; text-align: right;">Mínimo recomendado: 1200x400px</p>
                </div>
            `);

            document.getElementById('bannerInput').addEventListener('change', function(ev) {
                if(ev.target.files && ev.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = function(e_load) {
                        document.getElementById('editBannerPreview').style.backgroundImage = `url('${e_load.target.result}')`;
                    }
                    reader.readAsDataURL(ev.target.files[0]);
                }
            });
        }
    } else {
        const previewElement = document.getElementById('editBannerPreview');
        if (previewElement) {
            previewElement.style.backgroundImage = `url('${currentBannerUrl}')`;
        }
    }

    document.getElementById('editName').value = currentProfile.name || '';
    document.getElementById('editHandle').value = currentProfile.handle || '';
    document.getElementById('editBio').value = currentProfile.bio || '';
    editModal.classList.add('active');
  });

  const closeModal = () => {
    editModal.classList.remove('active');
    const bInput = document.getElementById('bannerInput');
    if(bInput) bInput.value = '';
  }
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  saveBtn?.addEventListener('click', async () => {
    saveBtn.textContent = 'Salvando...';
    saveBtn.disabled = true;

    try {
      const fileInput = document.getElementById('avatarInput');
      const bannerInput = document.getElementById('bannerInput'); 

      let avatarUrl = currentProfile?.avatar_url;
      let bannerUrl = currentProfile?.banner_url;

      if (fileInput && fileInput.files.length > 0) {
        avatarUrl = await uploadAvatar(fileInput.files[0]);
      }

      if (bannerInput && bannerInput.files.length > 0) {
        const bannerFile = bannerInput.files[0];
        await validarDimensoesBanner(bannerFile);
        showNotification('A enviar banner... 📸');
        bannerUrl = await uploadBanner(bannerFile);
      }

      const updated = await updateProfile({
        name: document.getElementById('editName').value.trim(),
        handle: document.getElementById('editHandle').value.trim(),
        bio: document.getElementById('editBio').value.trim(),
        avatar_url: avatarUrl,
        banner_url: bannerUrl, 
      });

      // GARANTE QUE O UI ATUALIZA MESMO QUE O BD FALHE NO BANNER
      if(bannerUrl) updated.banner_url = bannerUrl;

      currentProfile = updated;
      window.currentProfile = updated;
      updateUserUI();

      // Recarrega interface instantaneamente com a nova info
      await loadProfilePage();
      
      showNotification('Perfil atualizado com sucesso! ✅');
      closeModal();
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
      alert(typeof err === 'string' ? err : err.message);
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
      const avatar = c.otherUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.otherUser?.handle}`;
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

  if (unsubscribeCurrentChat) { unsubscribeCurrentChat(); unsubscribeCurrentChat = null; }
  if (window._chatPolling) { clearInterval(window._chatPolling); window._chatPolling = null; }

  renderedMessageIds.clear();
  currentOpenConvId = convId;

 chatArea.innerHTML = `
    <div style="padding:16px;border-bottom:1px solid var(--border);background:var(--dark-bg-secondary);display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <img src="${otherUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser?.handle}`}"
           class="chat-header-avatar"
           data-handle="${escapeHtml(otherUser?.handle ?? '')}"
           style="width:36px;height:36px;border-radius:50%;object-fit:cover;cursor:pointer;transition:opacity 0.2s;"
           onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
      <div style="cursor:pointer;" class="chat-header-name" data-handle="${escapeHtml(otherUser?.handle ?? '')}">
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
  chatArea.querySelectorAll('.chat-header-avatar, .chat-header-name').forEach(el => {
    el.addEventListener('click', () => {
      const handle = el.dataset.handle;
      if (!handle) return;
      document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
      document.getElementById('profile-page').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector('.nav-item[data-page="profile"]')?.classList.add('active');
      viewingProfile = null;
      loadProfileByHandle(handle);
    });
  });

  try {
    unsubscribeCurrentChat = subscribeToMessages(convId, (newMsg) => {
      if (renderedMessageIds.has(newMsg.id)) return;
      if (currentProfile && newMsg.sender_id === currentProfile.id) {
        const ehRecente = Math.abs(Date.now() - new Date(newMsg.created_at).getTime()) < 10000;
        if (ehRecente) { renderedMessageIds.add(newMsg.id); return; }
      }
      renderedMessageIds.add(newMsg.id);
      appendMessageToUI(newMsg);
      updateConversationPreview(convId, newMsg.content);
    });
  } catch (e) {
    console.warn('[chat] Realtime indisponível, usando polling:', e);
  }

  window._chatPolling = setInterval(async () => {
    if (currentOpenConvId !== convId) { clearInterval(window._chatPolling); return; }
    try {
      const msgs = await getMessages(convId);
      let temNova = false;
      msgs.forEach(msg => {
        if (renderedMessageIds.has(msg.id)) return;
        if (currentProfile && msg.sender_id === currentProfile.id) {
          const ehRecente = Math.abs(Date.now() - new Date(msg.created_at).getTime()) < 10000;
          if (ehRecente) { renderedMessageIds.add(msg.id); return; }
        }
        renderedMessageIds.add(msg.id);
        appendMessageToUI(msg);
        temNova = true;
      });
      if (temNova) updateConversationPreview(convId, msgs[msgs.length - 1]?.content ?? '');
    } catch (_) {}
  }, 3000);

  try {
    const msgs = await getMessages(convId);
    document.getElementById('chatLoadingMsg')?.remove();
    const container = document.getElementById('chatMessages');
    if (container && msgs.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">Diga olá! 👋</p>';
    } else {
      msgs.forEach(msg => { renderedMessageIds.add(msg.id); appendMessageToUI(msg); });
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

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg = { id: optimisticId, content, sender_id: currentProfile.id, created_at: new Date().toISOString() };
    renderedMessageIds.add(optimisticId);
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
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); });
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
function subscribeToFollowRequests(userId) {
  const channel = supabase
    .channel(`follow-requests-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'follow_requests',
        filter: `to_user=eq.${userId}`,
      },
      async () => {
        await refreshPendingBadge();
        showNotification('👥 Você tem uma nova solicitação de seguimento!');
      }
    )
    .subscribe();
 
  return () => supabase.removeChannel(channel);
}
 
async function initNotifications() {
  if (!currentProfile) return;
 
  await refreshNotifBadge();
  await refreshPendingBadge();
 
  if (unsubscribeNotifs) unsubscribeNotifs();
  unsubscribeNotifs = subscribeToNotifications(currentProfile.id, (newNotif) => {
    refreshNotifBadge();
    showNotifToast(newNotif);
    pulseNotifBell();
  });
 
  if (window._unsubFollowRequests) {
    try { window._unsubFollowRequests(); } catch (_) {}
  }
  window._unsubFollowRequests = subscribeToFollowRequests(currentProfile.id);
}


async function refreshNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const count = await getUnreadCount();
  if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.add('visible'); }
  else { badge.classList.remove('visible'); }
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
    if (!currentProfile) { showNotification('Faça login para ver suas notificações! 🔐'); return; }
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) await renderNotifList();
  });

  backdrop?.addEventListener('click', () => panel.classList.remove('active'));
  markAllBtn?.addEventListener('click', async () => {
   await deleteAllNotifications();
    await refreshNotifBadge();
    await renderNotifList();
    showNotification('Todas as foram apagadas! ✅');
  });
}

async function renderNotifList() {
  const listEl = document.getElementById('notifList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="notif-empty"><span class="notif-empty-icon">⏳</span>Carregando...</div>';

  const notifs = await getNotifications(30);
  if (notifs.length === 0) {
    listEl.innerHTML = `<div class="notif-empty"><span class="notif-empty-icon">🔔</span>Nenhuma notificação ainda.<br>Interaja com a galera!</div>`;
    return;
  }

  listEl.innerHTML = notifs.map(n => {
    const avatar = n.actor?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${n.actor?.handle || 'anon'}`;
    const handle = n.actor?.handle ?? '';

    const followRequestBtns = n.type === 'follow_request' ? `
      <div class="notif-follow-actions" style="display:flex;gap:6px;margin-top:8px;">
        <button class="notif-accept-btn" data-from-id="${n.actor?.id}" data-notif-id="${n.id}"
          style="background:var(--primary);color:white;border:none;border-radius:20px;
                 padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;">
          ✓ Aceitar
        </button>
        <button class="notif-reject-btn" data-from-id="${n.actor?.id}" data-notif-id="${n.id}"
          style="background:none;color:var(--text-secondary);border:1px solid var(--border);
                 border-radius:20px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;">
          ✕
        </button>
      </div>` : '';

    return `
       <div class="notif-item ${n.read ? '' : 'unread'}" 
       data-notif-id="${n.id}" 
       data-post-id="${n.post_id ?? ''}" 
         data-reply-id="${n.reply_id ?? ''}" 
       data-notif-type="${n.type}">
        <img src="${avatar}" class="notif-item-avatar notif-avatar-clickable" 
             data-handle="${escapeHtml(handle)}" alt="Avatar"
             style="cursor:pointer;" title="Ver perfil de @${escapeHtml(handle)}">
        <div class="notif-item-icon">${getNotifIcon(n.type)}</div>
        <div class="notif-item-body" style="flex:1;min-width:0;">
          <p class="notif-item-text">${escapeHtml(getNotifText(n))}</p>
          <p class="notif-item-time">${formatTimeAgoNotif(n.created_at)}</p>
          ${followRequestBtns}
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.notif-avatar-clickable').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const handle = img.dataset.handle;
      if (!handle) return;
      document.getElementById('notifPanel')?.classList.remove('active');
      document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('profile-page')?.classList.add('active');
      document.querySelector('.nav-item[data-page="profile"]')?.classList.add('active');
      viewingProfile = null;
      loadProfileByHandle(handle);
    });
  });

  listEl.querySelectorAll('.notif-accept-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fromId = btn.dataset.fromId;
      const notifId = btn.dataset.notifId;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        await acceptFollowRequest(fromId);
        await deleteNotification(notifId);

        if (currentProfile) {
          await createNotification({
            toUserId: currentProfile.id,
            actorId: fromId,
            type: NOTIF_TYPES.FOLLOW,
          });
        }
        
        showNotification('Solicitação aceita! ✅');
        await refreshPendingBadge();
        await refreshNotifBadge();
        await renderNotifList();

      } catch (err) {
        console.error('[aceitar notif]', err);
        showNotification('Erro ao aceitar.');
        btn.disabled = false;
        btn.textContent = '✓ Aceitar';
      }
    });
  });

  listEl.querySelectorAll('.notif-reject-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fromId = btn.dataset.fromId;
      const notifId = btn.dataset.notifId;
      btn.disabled = true;
      try {
        await rejectFollowRequest(fromId);
        await deleteNotification(notifId);
        const item = btn.closest('.notif-item');
        if (item) {
          item.style.transition = 'opacity 0.3s';
          item.style.opacity = '0';
          setTimeout(() => item.remove(), 300);
        }
        showNotification('Solicitação recusada.');
        await refreshPendingBadge();
        await refreshNotifBadge();
      } catch (err) {
        console.error('[rejeitar notif]', err);
        showNotification('Erro ao recusar.');
        btn.disabled = false;
      }
    });
  });

listEl.querySelectorAll('.notif-item').forEach(item => {
  item.addEventListener('click', async (e) => {
    if (
      e.target.closest('.notif-accept-btn') ||
      e.target.closest('.notif-reject-btn') ||
      e.target.closest('.notif-avatar-clickable')
    ) return;

    item.classList.remove('unread');
    await markAsRead(item.dataset.notifId);
    await refreshNotifBadge();

    const postId    = item.dataset.postId;
    const replyId   = item.dataset.replyId;
    const type      = item.dataset.notifType;

    document.getElementById('notifPanel')?.classList.remove('active');

    // Tipos que envolvem um post
    const postTypes = ['like', 'reply', 'repost', 'mention', 'reply_like', 'comment_reply'];

    if (postId && postTypes.includes(type)) {
      await openPostDetailModal(postId);

      // Se tem replyId, scrolla até o comentário específico depois de abrir o modal
      if (replyId) {
        // Aguarda o modal renderizar as respostas
        setTimeout(() => {
          const replyEl = document.querySelector(
            `#detailRepliesList [data-reply-id="${replyId}"]`
          );
          if (replyEl) {
            replyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Destaca o comentário brevemente (estilo Instagram)
            replyEl.style.transition = 'background 0.3s';
            replyEl.style.background = 'var(--primary)15';
            replyEl.style.borderRadius = '10px';
            setTimeout(() => {
              replyEl.style.background = '';
              replyEl.style.borderRadius = '';
            }, 2000);
          }
        }, 800); // aguarda renderização das replies
      }
    }
  });
});
}

function showNotifToast(notif) {
  document.querySelector('.notif-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `<span class="notif-toast-icon">${getNotifIcon(notif.type)}</span><p class="notif-toast-text">${escapeHtml(getNotifText(notif))}</p>`;
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
// EXPLORAR — com sistema de blocos integrado
// ============================================================
async function loadExplorePage() {
  const exploreContent = document.getElementById('exploreContent');
  if (!exploreContent) return;
  exploreContent.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Carregando... 🔄</p>';

  try {
    const posts = await getPosts(50);
    const contagemBlocos = contarPostsPorBloco(posts);

    let suggestedUsers = [];

    if (currentProfile) {
      const followingIds = await getFollowingIds(currentProfile.id);
      const authorMap = new Map();
      const authorScore = new Map();
      for (const post of posts) {
        const author = post.author;
        if (!author || author.id === currentProfile.id || followingIds.includes(author.id)) continue;
        if (!authorMap.has(author.id)) authorMap.set(author.id, author);
        const score = (post.likes_count || 0) + (post.replies_count || 0) * 2;
        authorScore.set(author.id, (authorScore.get(author.id) || 0) + score);
      }
      suggestedUsers = [...authorMap.values()]
        .sort((a, b) => ((authorScore.get(b.id) || 0) * (0.7 + Math.random() * 0.6)) - ((authorScore.get(a.id) || 0) * (0.7 + Math.random() * 0.6)))
        .slice(0, 6);
    } else {
      const authorMap = new Map();
      for (const post of posts) {
        if (post.author && !authorMap.has(post.author.id)) authorMap.set(post.author.id, post.author);
      }
      suggestedUsers = [...authorMap.values()].sort(() => Math.random() - 0.5).slice(0, 6);
    }

    const topPosts = [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 4);
    const recentPosts = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    const randomPosts = [...posts].sort(() => Math.random() - 0.5).slice(0, 4);

    const renderMiniPost = (post, contextLabel, contextIcon) => {
      const avatar = post.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
      const mediaThumb = post.media_urls?.length
        ? `<img src="${post.media_urls[0]}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;margin-top:6px;" loading="lazy">`
        : '';
      const textoDestacado = renderizarTextoComBlocos(post.content);
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
            ${textoDestacado}
          </div>
          ${mediaThumb}
          <div style="color:var(--text-secondary);font-size:12px;display:flex;justify-content:space-between;margin-top:auto;padding-top:8px;">
            <span style="display:flex;gap:12px;"><span>❤️ ${post.likes_count || 0}</span><span>💬 ${post.replies_count || 0}</span></span>
            <span>📍 PUC</span>
          </div>
        </div>`;
    };

    const renderSuggestedUser = (user) => {
      const avatar = user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle}`;
      return `
        <div class="suggested-user-card" data-handle="${user.handle}" style="cursor:pointer;">
          <img src="${avatar}" alt="${escapeHtml(user.name)}" loading="lazy">
          <div><h4>${escapeHtml(user.name)}</h4><p>@${escapeHtml(user.handle)}</p></div>
          <button class="btn-follow-small explore-follow-btn" data-user-id="${user.id}">Seguir</button>
        </div>`;
    };

    exploreContent.innerHTML = `
      <div class="explore-sections">
        ${renderBlocosWidget(contagemBlocos)}

        ${suggestedUsers.length > 0 ? `
        <section>
          <h3 class="explore-section-title">✨ Sugestões para você</h3>
          <div class="suggested-users-row">${suggestedUsers.map(u => renderSuggestedUser(u)).join('')}</div>
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

    attachBlocosListeners(exploreContent, posts);

    exploreContent.querySelectorAll('.explore-post-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (
          e.target.closest('.explore-follow-btn') ||
          e.target.closest('.explore-avatar-clickable') ||
          e.target.closest('.hashtag-bloco')
        ) return;
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
          try { await unfollowUserAndSync(currentProfile.id, userId); btn.textContent = 'Seguir'; btn.style.background = ''; btn.style.color = ''; }
          catch { showNotification('Erro ao deixar de seguir.'); }
        } else {
          try {
            await followUserAndSync(currentProfile.id, userId);
            btn.textContent = '✓ Seguindo'; btn.style.background = 'var(--primary)'; btn.style.color = 'white';
            await createNotification({ toUserId: userId, actorId: currentProfile.id, type: NOTIF_TYPES.FOLLOW });
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
    btn.addEventListener('click', (e) => { e.stopPropagation(); widget.classList.toggle('expanded'); });
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

  toggleFeed?.addEventListener('click', (e) => { e.stopPropagation(); pickerFeed?.classList.toggle('active'); pickerModal?.classList.remove('active'); });
  toggleModal?.addEventListener('click', (e) => { e.stopPropagation(); pickerModal?.classList.toggle('active'); pickerFeed?.classList.remove('active'); });

  document.addEventListener('click', () => { pickerFeed?.classList.remove('active'); pickerModal?.classList.remove('active'); });
  pickerFeed?.addEventListener('click', e => e.stopPropagation());
  pickerModal?.addEventListener('click', e => e.stopPropagation());
}

// ============================================================
// UPLOAD DE IMAGEM NO FEED
// ============================================================
function setupFeedImageUpload() {
  const fileInput   = document.getElementById('feedFileInput');
  const imgBtn      = document.getElementById('btnImgFeed');
  const previewArea = document.getElementById('feedImgPreview');
  if (!fileInput || !imgBtn) return;

  imgBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener('change', () => {
    const novos = Array.from(fileInput.files);
    feedSelectedFiles = [...feedSelectedFiles, ...novos].slice(0, 4);
    renderFeedImgPreview(previewArea);
    fileInput.value = '';
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
// ============================================================
// VISUALIZADOR DE IMAGENS (MODAL DE ZOOM PARA AVATAR/BANNER)
// ============================================================
window.openImageViewer = function(imageUrl) {
    if (!imageUrl) return;

    let viewer = document.getElementById('imageViewerModal');
    
    // Se o visualizador ainda não existir no HTML, cria-o dinamicamente
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'imageViewerModal';
        viewer.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.85); display: flex;
            align-items: center; justify-content: center;
            backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.2s ease;
        `;
        
        viewer.innerHTML = `
            <button id="closeImageViewer" style="
                position: absolute; top: 20px; right: 24px; background: rgba(0,0,0,0.5); 
                border: none; color: white; width: 40px; height: 40px; border-radius: 50%;
                font-size: 24px; cursor: pointer; z-index: 100000; transition: background 0.2s;
                display: flex; align-items: center; justify-content: center;
            " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.5)'">✕</button>
            <img id="imageViewerImg" src="" style="
                max-width: 90vw; max-height: 90vh; border-radius: 12px; 
                box-shadow: 0 10px 40px rgba(0,0,0,0.5); object-fit: contain; 
                transform: scale(0.9); transition: transform 0.2s ease;
            ">
        `;
        document.body.appendChild(viewer);
        
        // Lógica para fechar
        const closeFn = () => {
            viewer.style.opacity = '0';
            document.getElementById('imageViewerImg').style.transform = 'scale(0.9)';
            setTimeout(() => viewer.style.display = 'none', 200); // Espera a animação acabar
        };
        
        document.getElementById('closeImageViewer').addEventListener('click', closeFn);
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer) closeFn(); // Fecha ao clicar fora da imagem
        });
        
        // Fecha com a tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && viewer.style.display === 'flex') closeFn();
        });
    }
    
    // Atualiza a imagem e mostra o modal com animação
    const imgEl = document.getElementById('imageViewerImg');
    imgEl.src = imageUrl;
    viewer.style.display = 'flex';
    
    // Força o browser a registar o display:flex antes de animar a opacidade
    void viewer.offsetWidth; 
    
    viewer.style.opacity = '1';
    imgEl.style.transform = 'scale(1)';
};
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
      const updated = await updatePost(currentEditingPostId, newContent);

      document.querySelectorAll(`.post-card[data-post-id="${currentEditingPostId}"] .post-text`)
        .forEach(el => {
          el.innerHTML = renderizarTextoComBlocos(updated.content);
        });

      document.querySelectorAll(`.post-card[data-post-id="${currentEditingPostId}"] .post-blocos-badges`)
        .forEach(badgesEl => {
          const novos = detectarBlocosNoPost(updated.content);
          if (novos.length === 0) { badgesEl.remove(); return; }
          badgesEl.innerHTML = novos.map(b => `
            <span class="bloco-badge-post" data-bloco-id="${b.id}" style="
              display:inline-flex;align-items:center;gap:3px;
              background:${b.cor}18;color:${b.cor};
              border:1px solid ${b.cor}44;
              border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;
              cursor:pointer;transition:background 0.15s;
            ">${b.emoji} ${b.label}</span>
          `).join('');
        });

      showNotification('Post atualizado! ✏️');
      closeModal();
    } catch (err) {
      console.error(err);
      showNotification(`Erro: ${err.message}`);
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
      if (temaEscolhido === 'padrao') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', temaEscolhido);
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
        position:absolute;top:calc(100% + 6px);left:0;right:0;
        background:var(--dark-bg-secondary);border:1px solid var(--border);
        border-radius:14px;z-index:9000;max-height:420px;overflow-y:auto;
        box-shadow:0 8px 32px rgba(0,0,0,0.4);display:none;
      `;
      const searchBox = searchInput.closest('.search-box');
      if (searchBox) {
        if (getComputedStyle(searchBox).position === 'static') searchBox.style.position = 'relative';
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
      dropdown.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary);">
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
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle}`;
        return `
          <div class="search-result-item" data-handle="${escapeHtml(user.handle)}" style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background 0.15s;">
            <img src="${avatar}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0;" loading="lazy">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${escapeHtml(user.name)}</div>
              <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(user.handle)}</div>
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
    dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">🔍 Buscando...</div>`;

    try {
      let { data, error } = await supabase
        .from('profiles')
        .select('id, name, handle, avatar_url, bio, followers_count')
        .or(`name.ilike.%${query}%,handle.ilike.%${query}%`)
        .order('followers_count', { ascending: false })
        .limit(10);

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
      const dd = document.getElementById('searchResultsDropdown');
      if (dd) dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);font-size:14px;">Erro ao buscar. Tente novamente.</div>`;
    }
  };

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    if (!query) { hideResults(); return; }
    searchTimeout = setTimeout(() => performSearch(query), 350);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(searchTimeout); performSearch(e.target.value.trim()); }
    if (e.key === 'Escape') { hideResults(); searchInput.value = ''; }
  });

  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (dropdown && !searchInput.contains(e.target) && !dropdown.contains(e.target)) hideResults();
  });
}

// ============================================================
// PATCH — Expõe funções globais para integração com o HTML
// ============================================================
window.navegarParaBloco = navegarParaBloco;

const _loadFeedOriginal    = loadFeed;
const _loadExploreOriginal = loadExplorePage;

async function loadFeedComBlocos() {
  await _loadFeedOriginal();
  try {
    const posts = await getPosts(50);
    const contagem = contarPostsPorBloco(posts);
    if (typeof window.atualizarBlocosSidebar === 'function') {
      window.atualizarBlocosSidebar(contagem);
    }
  } catch (_) { }
}

window.loadFeedPublico = loadFeedComBlocos;

const _loadExploreWrapped = async function () {
  await _loadExploreOriginal();
  try {
    const posts = await getPosts(50);
    const contagem = contarPostsPorBloco(posts);
    if (typeof window.atualizarBlocosSidebar === 'function') {
      window.atualizarBlocosSidebar(contagem);
    }
  } catch (_) { }
};

const _onAuthOriginal = onAuthChange;
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const posts = await getPosts(50);
    const contagem = contarPostsPorBloco(posts);
    if (typeof window.atualizarBlocosSidebar === 'function') {
      window.atualizarBlocosSidebar(contagem);
    }
  } catch (_) { }
});

// ============================================================
// LÓGICA DAS CONFIGURAÇÕES DE CONTA
// ============================================================
window.mudarTelaConfig = function(idTela) {
    document.querySelectorAll('.config-view').forEach(v => v.classList.remove('active'));
    
    const telaAlvo = document.getElementById(idTela);
    if(telaAlvo) telaAlvo.classList.add('active');
    
    const btnVoltar = document.getElementById('btnVoltarConfig');
    const titulo = document.getElementById('configTitulo');

    if (idTela === 'config-lista') {
        btnVoltar.style.display = 'none';
        titulo.innerText = 'Informações gerais'; 
    } else {
        btnVoltar.style.display = 'block';
        if (idTela === 'config-info') {
            titulo.innerText = 'Informações da conta';
            carregarMeusDadosConfig();
        } else if (idTela === 'config-senha') {
            titulo.innerText = 'Alterar senha';
        }
    }
};

window.carregarMeusDadosConfig = async function() {
    try {
        const emailInput = document.getElementById('configEmail');
        const handleInput = document.getElementById('configHandle');
        
        if(emailInput) emailInput.value = 'A procurar e-mail...';
        if(handleInput) handleInput.value = 'A procurar utilizador...';

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;

        if (user) {
            if(emailInput) emailInput.value = user.email || 'E-mail não encontrado';
            
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('handle')
                .eq('id', user.id)
                .single();
                
            if (profileError) throw profileError;

            if(handleInput) handleInput.value = '@' + (profile?.handle || 'anonimo');
        }
    } catch (err) {
        console.error("Erro ao carregar dados das configurações:", err);
        const emailInput = document.getElementById('configEmail');
        const handleInput = document.getElementById('configHandle');
        if(emailInput) emailInput.value = 'Erro ao carregar';
        if(handleInput) handleInput.value = 'Erro ao carregar';
    }
};

window.atualizarSenhaSupabase = async function() {
    const nova = document.getElementById('configNewPassword').value;
    const confirma = document.getElementById('configConfirmPassword').value;

    if (!nova || nova.length < 6) return alert("A senha tem de ter pelo menos 6 caracteres.");
    if (nova !== confirma) return alert("As senhas não coincidem. Tente novamente.");

    try {
        const { error } = await supabase.auth.updateUser({ password: nova });
        if (error) {
            alert("Erro ao atualizar: " + error.message);
        } else {
            alert("Senha atualizada com sucesso! ✅");
            document.getElementById('configNewPassword').value = '';
            document.getElementById('configConfirmPassword').value = '';
            mudarTelaConfig('config-lista');
        }
    } catch (err) {
        console.error(err);
        alert("Erro de ligação ao alterar a senha.");
    }
};
// ============================================================
// MODAL DE SEGUINDO E SEGUIDORES
// ============================================================
function setupFollowListModal() {
  if (document.getElementById('followListModal')) return;

  const modal = document.createElement('div');
  modal.id = 'followListModal';
  modal.style.cssText = `
    display:none;position:fixed;inset:0;z-index:4000;
    background:rgba(0,0,0,0.75);align-items:center;justify-content:center;
    padding:20px;backdrop-filter:blur(6px);
  `;
  modal.innerHTML = `
    <div style="background:var(--dark-bg-secondary);border:1px solid var(--border);border-radius:24px;width:100%;max-width:400px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);">
        <h3 id="followListTitle" style="font-size:18px;font-weight:800;color:var(--text-primary);">Lista</h3>
        <button id="closeFollowListBtn" style="background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer;transition:color 0.2s;">✕</button>
      </div>
      <div id="followListContent" style="padding:12px;overflow-y:auto;flex:1;"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('closeFollowListBtn').addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

async function openFollowListModal(type, profileId) {
  const modal = document.getElementById('followListModal');
  const title = document.getElementById('followListTitle');
  const content = document.getElementById('followListContent');
  if (!modal || !content) return;

  modal.style.display = 'flex';
  title.textContent = type === 'followers' ? 'Seguidores' : 'Seguindo';
  content.innerHTML = '<p style="text-align:center;padding:30px;color:var(--text-secondary);">Carregando...</p>';

  try {
    let users = [];
    if (type === 'followers') {
      users = await getFollowers(profileId);
    } else {
      users = await getFollowing(profileId);
    }

    if (!users || users.length === 0) {
      content.innerHTML = '<p style="text-align:center;padding:30px;color:var(--text-secondary);">Nenhum usuário encontrado por aqui. 👀</p>';
      return;
    }

    content.innerHTML = users.map(u => {
      const avatar = u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.handle}`;
      return `
        <div class="follow-list-item" data-handle="${escapeHtml(u.handle)}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-radius:12px;transition:background 0.2s;">
          <img src="${avatar}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--border);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(u.name)}
            </div>
            <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(u.handle)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Ao clicar num usuário da lista, envia o usuário para o perfil dele
    content.querySelectorAll('.follow-list-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.style.background = 'var(--dark-bg-tertiary)');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');
      item.addEventListener('click', () => {
         const handle = item.dataset.handle;
         if (!handle) return;
         modal.style.display = 'none';
         document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
         document.getElementById('profile-page').classList.add('active');
         loadProfileByHandle(handle);
      });
    });
  } catch (err) {
    console.error(err);
    content.innerHTML = '<p style="text-align:center;padding:30px;color:var(--danger);">Erro ao carregar a lista.</p>';
  }
}