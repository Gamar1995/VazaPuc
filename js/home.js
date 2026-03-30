// ============================================================
// js/home.js — Controla a página principal (feed de posts)
//
// Este arquivo é o "maestro" da home: ele usa as funções dos
// outros módulos (posts.js, supabase.js) e atualiza o HTML.
// ============================================================

import { getCurrentProfile, onAuthChange } from './supabase.js';
import {
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getLikedPostIds,
  subscribeToNewPosts
} from './posts.js';

// ============================================================
// ESTADO LOCAL
// Guarda os dados em memória enquanto a página está aberta
// ============================================================
let currentProfile = null;     // perfil do usuário logado
let likedPostIds = new Set();  // IDs dos posts que o usuário curtiu
let unsubscribePosts = null;   // função para cancelar o realtime

// ============================================================
// INICIALIZAÇÃO
// Roda quando a página carrega
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Observa mudanças de autenticação (login/logout)
  onAuthChange(async (session) => {
    if (session) {
      // Usuário logado: carrega perfil e posts
      currentProfile = await getCurrentProfile();
      updateUserUI();
      await loadFeed();
      startRealtimeFeed();
    } else {
      // Não logado: redireciona para login
      // window.location.href = 'login.html';
      // Por ora, carrega posts mesmo sem login (modo leitura)
      await loadFeed();
    }
  });

  // Configura o composer de post
  setupPostComposer();
  setupPostModal();
});

// ============================================================
// ATUALIZA A UI COM OS DADOS DO USUÁRIO
// ============================================================
function updateUserUI() {
  if (!currentProfile) return;

  // Atualiza o mini-card da sidebar
  document.querySelector('.user-name').textContent = currentProfile.name;
  document.querySelector('.user-handle').textContent = `@${currentProfile.handle}`;

  // Atualiza o avatar do composer
  const composerAvatar = document.querySelector('.composer-avatar');
  if (composerAvatar && currentProfile.avatar_url) {
    composerAvatar.src = currentProfile.avatar_url;
  }
}

// ============================================================
// CARREGA O FEED DE POSTS
// ============================================================
async function loadFeed() {
  const container = document.getElementById('postsContainer');
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Carregando...</div>';

  try {
    const posts = await getPosts(20);

    // Descobre quais posts o usuário curtiu (uma chamada só, mais eficiente)
    if (currentProfile) {
      const ids = posts.map(p => p.id);
      likedPostIds = await getLikedPostIds(ids);
    }

    renderPosts(posts);
  } catch (err) {
    console.error('Erro ao carregar feed:', err);
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--danger)">Erro ao carregar posts.</div>';
  }
}

// ============================================================
// RENDERIZA LISTA DE POSTS NO HTML
// ============================================================
function renderPosts(posts) {
  const container = document.getElementById('postsContainer');

  if (posts.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Nenhum post ainda. Seja o primeiro! 🚀</div>';
    return;
  }

  container.innerHTML = posts.map(post => createPostHTML(post)).join('');
  attachPostEventListeners();
}

// ============================================================
// CRIA O HTML DE UM POST
// ============================================================
function createPostHTML(post) {
  const isLiked = likedPostIds.has(post.id);
  const avatar = post.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
  const timeAgo = formatTimeAgo(post.created_at);

  return `
    <div class="post-card" data-post-id="${post.id}">
      <img src="${avatar}" alt="${post.author?.name}" class="post-avatar">
      <div class="post-content">
        <div class="post-header">
          <span class="post-author">${escapeHtml(post.author?.name ?? 'Usuário')}</span>
          <span class="post-handle">@${escapeHtml(post.author?.handle ?? '')}</span>
          <span class="post-time">${timeAgo}</span>
        </div>
        <p class="post-text">${escapeHtml(post.content)}</p>
        <div class="post-actions">
          <div class="post-action reply-action" title="Responder">
            💬 <span>${post.replies_count ?? 0}</span>
          </div>
          <div class="post-action like-action ${isLiked ? 'liked' : ''}"
               title="Curtir"
               data-post-id="${post.id}"
               data-liked="${isLiked}">
            ❤️ <span>${post.likes_count ?? 0}</span>
          </div>
          <div class="post-action share-action" title="Compartilhar">
            📤
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// ADICIONA EVENTOS NOS BOTÕES DOS POSTS
// Chamado toda vez que a lista é re-renderizada
// ============================================================
function attachPostEventListeners() {
  document.querySelectorAll('.like-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentProfile) {
        showNotification('Faça login para curtir! 🔐');
        return;
      }

      const postId = btn.dataset.postId;
      const wasLiked = btn.dataset.liked === 'true';
      const countEl = btn.querySelector('span');

      // Atualiza a UI imediatamente (feedback instantâneo)
      const newLiked = !wasLiked;
      btn.dataset.liked = newLiked;
      btn.classList.toggle('liked', newLiked);
      countEl.textContent = parseInt(countEl.textContent) + (newLiked ? 1 : -1);

      // Atualiza o Set local
      if (newLiked) likedPostIds.add(postId);
      else likedPostIds.delete(postId);

      // Envia para o banco (assíncrono)
      try {
        if (newLiked) await likePost(postId);
        else await unlikePost(postId);
      } catch (err) {
        // Reverte se der erro
        btn.dataset.liked = wasLiked;
        btn.classList.toggle('liked', wasLiked);
        countEl.textContent = parseInt(countEl.textContent) + (wasLiked ? 1 : -1);
        showNotification('Erro ao curtir. Tente novamente.');
      }
    });
  });
}

// ============================================================
// ADICIONA UM ÚNICO POST NO TOPO DO FEED (para o realtime)
// ============================================================
function prependPost(post) {
  const container = document.getElementById('postsContainer');
  const emptyMsg = container.querySelector('[style*="Nenhum post"]');
  if (emptyMsg) emptyMsg.remove();

  const div = document.createElement('div');
  div.innerHTML = createPostHTML(post);
  const postEl = div.firstElementChild;
  postEl.style.animation = 'slideDown 0.3s ease';
  container.prepend(postEl);
  attachPostEventListeners();
}

// ============================================================
// COMPOSER DE POST (caixa de texto na timeline)
// ============================================================
function setupPostComposer() {
  const postInput = document.getElementById('postInput');
  const postSubmitBtn = document.getElementById('postSubmitBtn');

  if (!postInput || !postSubmitBtn) return;

  // Auto-expande o textarea conforme digita
  postInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  // Ctrl+Enter para postar
  postInput.addEventListener('keypress', (e) => {
    if (e.ctrlKey && e.key === 'Enter') handleSubmitPost(postInput.value);
  });

  postSubmitBtn.addEventListener('click', () => handleSubmitPost(postInput.value));
}

// ============================================================
// MODAL DE NOVO POST (botão "Novo Post" da sidebar)
// ============================================================
function setupPostModal() {
  const modal = document.getElementById('postModal');
  const openBtn = document.getElementById('postBtnSidebar');
  const closeBtn = document.getElementById('closePostModal');
  const cancelBtn = document.getElementById('cancelPostBtn');
  const submitBtn = document.getElementById('submitPostBtn');
  const modalInput = document.getElementById('modalPostInput');

  openBtn?.addEventListener('click', () => {
    modal.classList.add('active');
    modalInput?.focus();
  });

  const closeModal = () => {
    modal.classList.remove('active');
    if (modalInput) modalInput.value = '';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  submitBtn?.addEventListener('click', async () => {
    await handleSubmitPost(modalInput?.value ?? '');
    closeModal();
  });
}

// ============================================================
// LÓGICA DE ENVIO DE POST (usada pelo composer e pelo modal)
// ============================================================
async function handleSubmitPost(content) {
  content = content?.trim();
  if (!content) return;

  if (!currentProfile) {
    showNotification('Faça login para postar! 🔐');
    return;
  }

  // Limpa os inputs
  const postInput = document.getElementById('postInput');
  const modalInput = document.getElementById('modalPostInput');
  if (postInput) { postInput.value = ''; postInput.style.height = 'auto'; }
  if (modalInput) modalInput.value = '';

  try {
    await createPost(content);
    // O realtime vai detectar e adicionar o post no feed automaticamente
    showNotification('Post criado! ✨');
  } catch (err) {
    console.error('Erro ao criar post:', err);
    showNotification('Erro ao criar post. Tente novamente.');
  }
}

// ============================================================
// REALTIME — escuta novos posts e adiciona no feed
// ============================================================
function startRealtimeFeed() {
  // Cancela subscription anterior se existir
  if (unsubscribePosts) unsubscribePosts();

  unsubscribePosts = subscribeToNewPosts((newPost) => {
    // Não duplica se for o próprio post do usuário atual
    // (o createPost já retornou e foi adicionado via handleSubmitPost)
    const exists = document.querySelector(`[data-post-id="${newPost.id}"]`);
    if (!exists) prependPost(newPost);
  });
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

// Converte timestamp ISO em "2h atrás", "agora", etc.
function formatTimeAgo(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h atrás`;
  return `${Math.floor(diffMin / 1440)}d atrás`;
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background: var(--primary); color: white;
    padding: 12px 20px; border-radius: 8px;
    font-weight: 600; z-index: 2000;
    animation: slideUp 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}