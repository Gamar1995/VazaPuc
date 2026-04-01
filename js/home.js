// ============================================================
// js/home.js — Código completo da Home (Feed, Perfil, Chat)
// ============================================================


import { supabase, getCurrentUser } from './supabase.js';
import { getCurrentProfile, onAuthChange, signOut,  } from './supabase.js';

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
   addReply
} from './posts.js';

let unsubscribeNotifs = null;
let viewingProfile = null;

import {updateProfile } from './profile.js';
import { getConversations, getMessages, sendMessage, subscribeToMessages } from './messages.js';
import { getProfileByHandle} from './profile.js';

async function uploadAvatar(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  if (!file.type.startsWith('image/')) {
    throw new Error('Arquivo inválido');
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Imagem muito grande');
  }

  const fileExt = file.name.split('.').pop();
  const filePath = `avatars/${user.id}-${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, file);

  if (error) throw error;

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return data.publicUrl + '?t=' + Date.now();
}
const params = new URLSearchParams(window.location.search);
const profileHandle = params.get('handle');

async function loadProfileByHandle(handle) {
  const profile = await getProfileByHandle(handle);

  viewingProfile = profile; // 🔥 guarda perfil visitado

   loadProfilePage();

  document.getElementById('profileName').textContent = profile.name;
  document.getElementById('profileHandle').textContent = '@' + profile.handle;
  document.getElementById('profileBio').textContent = profile.bio || '';

  const profileAvatar = document.querySelector('.profile-avatar');
  profileAvatar.src =
    profile.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.handle}`;
}
console.log("🚀 VazaPUC: Arquivo home.js foi acionado com sucesso!");
// ============================================================
// ESTADO LOCAL
// ============================================================
let currentProfile = null;
let likedPostIds = new Set();
let unsubscribePosts = null;
let unsubscribeCurrentChat = null;

// ============================================================
// INICIALIZAÇÃO IMEDIATA
// ============================================================
try {
  console.log("⚙️ Conectando os botões da interface...");
  setupNotifications();
  setupNavigation();
  setupPostComposer();
  setupPostModal();
  setupProfileModal(); // <--- Controla o botão do Perfil
  setupEmojis();
  setupUserMini();     // <--- Controla a caixa "Seu Usuário"
  setupProfileTabs();
  setupTrendingWidget();  // <--- ABA DE BLOCOS ATIVADA AQUI!
  console.log("✅ Botões conectados e prontos!");
} catch (erroInterface) {
  console.error("❌ Erro grave ao carregar a interface:", erroInterface);
}

// Inicializa a conexão com o banco logo em seguida
try {
  onAuthChange(async (session) => {
    if (session) {
      console.log("Usuário logado! Carregando dados do perfil...");
      currentProfile = await getCurrentProfile();
      updateUserUI();
      await initNotifications();
      await loadFeed();
      startRealtimeFeed();
    } else {
      console.log("Usuário anônimo. Carregando feed geral...");
      currentProfile = null;
      updateUserUI();
      await loadFeed();
    }
  });
} catch (erroBanco) {
  console.error("Aviso: Erro ao carregar o banco de dados.", erroBanco);
}

// ============================================================
// LOGIN / LOGOUT (CAIXA "SEU USUÁRIO" NO MENU LATERAL)
// ============================================================
function setupUserMini() {
  const userMini = document.querySelector('.user-mini');
  const loginPopup = document.getElementById('userLoginPopup');
  const btnPopupLogin = document.getElementById('btnPopupLogin');

  if (userMini) {
    userMini.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!currentProfile) {
        if (loginPopup) loginPopup.classList.toggle('active');
      } else {
        const querSair = confirm('Deseja sair da sua conta no VazaPUC?');
        if (querSair) {
          try {
            await signOut();
            window.location.assign('../index.html');
          } catch (err) {
            console.error("Erro ao fazer logout:", err);
            showNotification('Erro ao tentar sair da conta.');
          }
        }
      }
    });
  }

  if (btnPopupLogin) {
    btnPopupLogin.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.assign('../inicial/login.html');
    });
  }

  document.addEventListener('click', () => {
    if (loginPopup && loginPopup.classList.contains('active')) {
      loginPopup.classList.remove('active');
    }
  });

  if (loginPopup) {
    loginPopup.addEventListener('click', (e) => e.stopPropagation());
  }
}

// ============================================================
// ATUALIZA A UI COM OS DADOS DO USUÁRIO
// ============================================================
function updateUserUI() {
  const nameEl = document.querySelector('.user-name');
  const handleEl = document.querySelector('.user-handle');
  const composerAvatar = document.querySelector('.composer-avatar');
  const miniAvatar = document.querySelector('.user-mini .user-avatar img');

  if (!currentProfile) {
    if (nameEl) nameEl.textContent = "Fazer Login";
    if (handleEl) handleEl.textContent = "Clique para entrar 🚀";
    return;
  }

  if (nameEl) nameEl.textContent = currentProfile.name;
  if (handleEl) handleEl.textContent = `@${currentProfile.handle}`;

  const avatarSrc = currentProfile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentProfile.handle}`;

  if (composerAvatar) composerAvatar.src = avatarSrc;
  if (miniAvatar) miniAvatar.src = avatarSrc;
}

// ============================================================
// SISTEMA DE NAVEGAÇÃO DE ABAS
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

      const targetPageId = targetDataPage + '-page';
      const targetPage = document.getElementById(targetPageId);
      if (targetPage) targetPage.classList.add('active');

      if (targetPageId === 'profile-page') loadProfilePage();
      if (targetPageId === 'messages-page') loadMessagesPage();
      if (targetPageId === 'explore-page') loadExplorePage();
    });
  });
}

// ============================================================
// FEED DE POSTS E RESTANTE DAS FUNÇÕES
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

// === FUNÇÃO SUBSTITUÍDA: HTML DOS COMENTÁRIOS EXPANSÍVEIS ===
function createPostHTML(post) {
  const isLiked = likedPostIds.has(post.id);
  const avatar = post.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
  const timeAgo = formatTimeAgo(post.created_at);
  const userAvatar = currentProfile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;

  return `
    <div class="post-card" data-post-id="${post.id}" style="flex-direction: column;">
      
      <div class="post-main" style="display: flex; gap: 16px; width: 100%;">
         <img 
        src="${post.author.avatar_url}" 
        class="avatar clickable-avatar"
       data-handle="${post.author.handle}"
      >
        <div class="post-content">
          <div class="post-header">
           <span 
  class="post-author clickable-avatar" 
  data-handle="${post.author.handle}"
>
  ${escapeHtml(post.author?.name ?? 'Usuário')}
</span>
            <span class="post-handle">@${escapeHtml(post.author?.handle ?? '')}</span>
            <span class="post-time">${timeAgo}</span>
          </div>
          <p class="post-text">${escapeHtml(post.content)}</p>
          <div class="post-actions">
            <div class="post-action reply-action" title="Responder" data-post-id="${post.id}">
              💬 <span class="reply-count">${post.replies_count ?? 0}</span>
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

      <div class="post-replies-section" id="replies-${post.id}" style="display: none;">
          <div class="reply-composer">
              <img src="${userAvatar}" class="reply-avatar">
              <div class="reply-input-wrapper">
                  <textarea class="reply-input" id="reply-input-${post.id}" placeholder="Postar sua resposta..." rows="1"></textarea>
                  <div class="reply-toolbar">
                      <label class="privacy-toggle" title="Se marcado, apenas o dono deste post verá sua resposta">
                          <input type="checkbox" id="reply-privacy-${post.id}">
                          <span class="privacy-label">🔒 Apenas o autor pode ver</span>
                      </label>
                      <button class="reply-submit-btn" data-post-id="${post.id}">Responder</button>
                  </div>
              </div>
          </div>
          <div class="replies-list" id="replies-list-${post.id}"></div>
      </div>

    </div>
  `;
}

// === FUNÇÃO SUBSTITUÍDA: LÓGICA DE CLIQUE (LIKE E COMENTÁRIOS) ===
function attachPostEventListeners() {
  // 1. LÓGICA DE CURTIR
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
    const wasLiked = newBtn.dataset.liked === 'true';
    const countEl = newBtn.querySelector('span');
 
    // Feedback visual imediato (optimistic update)
    const newLiked = !wasLiked;
    newBtn.dataset.liked = newLiked;
    newBtn.classList.toggle('liked', newLiked);
    countEl.textContent = parseInt(countEl.textContent) + (newLiked ? 1 : -1);
 
    if (newLiked) likedPostIds.add(postId);
    else likedPostIds.delete(postId);
 
    try {
      if (newLiked) {
        await likePost(postId);
 
        // Busca o dono do post para notificá-lo
        const { data: postData } = await supabase
          .from('posts')
          .select('user_id')
          .eq('id', postId)
          .single();
 
        if (postData?.user_id && postData.user_id !== currentProfile.id) {
          await createNotification({
            toUserId: postData.user_id,
            actorId:  currentProfile.id,
            type:     NOTIF_TYPES.LIKE,
            postId,
          });
        }
      } else {
        await unlikePost(postId);
      }
    } catch (err) {
      // Reverte o feedback visual se der erro no banco
      newBtn.dataset.liked = wasLiked;
      newBtn.classList.toggle('liked', wasLiked);
      countEl.textContent = parseInt(countEl.textContent) + (wasLiked ? 1 : -1);
      if (wasLiked) likedPostIds.add(postId);
      else likedPostIds.delete(postId);
      showNotification('Erro ao curtir. Tente novamente.');
    }
  });
});
  //logica de clicar no avatar pra entrar no perfil 
  document.querySelectorAll('.clickable-avatar').forEach(el => {
    el.addEventListener('click', () => {
      const handle = el.dataset.handle;

      // salva quem foi clicado
      window.selectedProfileHandle = handle;

      // troca para página de perfil (SPA)
      document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
      document.getElementById('profile-page').classList.add('active');

      // carrega perfil
      loadProfileByHandle(handle);
    });
  });
  // 2. LÓGICA DE ABRIR A CAIXA DE COMENTÁRIOS
  document.querySelectorAll('.reply-action').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = newBtn.dataset.postId;
      const repliesSection = document.getElementById(`replies-${postId}`);

      // Alterna entre abrir e fechar a caixa
      if (repliesSection.style.display === 'none') {
        repliesSection.style.display = 'block';
        const input = document.getElementById(`reply-input-${postId}`);
        if (input) input.focus();
      } else {
        repliesSection.style.display = 'none';
      }
    });
  });

  // 3. LÓGICA DE ENVIAR O COMENTÁRIO
  document.querySelectorAll('.reply-submit-btn').forEach(btn => {
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
 
  newBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
 
    // ✅ CORREÇÃO: verificação de login ANTES de qualquer outra coisa
    if (!currentProfile) {
      showNotification('Faça login para comentar! 🔐');
      return; // para aqui, sem tentar acessar postId
    }
 
    const postId = newBtn.dataset.postId;
    const input = document.getElementById(`reply-input-${postId}`);
    const privacyCheckbox = document.getElementById(`reply-privacy-${postId}`);
 
    const content = input.value.trim();
    const isPrivate = privacyCheckbox.checked;
 
    if (!content) return;
 
    newBtn.disabled = true;
    newBtn.textContent = '...';
 
    try {
      // ✅ CORREÇÃO: chama o backend antes de atualizar o visual
      // Você precisa ter uma função addReply em posts.js (ver abaixo)
      await addReply(postId, content, isPrivate);
 
      // Feedback visual na tela após confirmação do banco
      const repliesList = document.getElementById(`replies-list-${postId}`);
      const userAvatar = currentProfile.avatar_url
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentProfile.handle}`;
 
      const replyHTML = `
        <div class="reply-item" style="animation: slideDown 0.3s ease;">
          <img src="${userAvatar}" class="reply-avatar" style="width: 30px; height: 30px;">
          <div class="reply-bubble">
            <div class="reply-header">
              <div>
                <span class="reply-author">${escapeHtml(currentProfile.name)}</span>
                <span class="reply-handle">@${escapeHtml(currentProfile.handle)}</span>
              </div>
              ${isPrivate ? '<span class="reply-private-badge">🔒 Privado</span>' : ''}
            </div>
            <p style="font-size: 13.5px; color: var(--text-primary); line-height: 1.4;">${escapeHtml(content)}</p>
          </div>
        </div>
      `;
 
      repliesList.insertAdjacentHTML('afterbegin', replyHTML);
 
      // ✅ Atualiza o contador de comentários no ícone 💬
      const replyCountSpan = document.querySelector(`.reply-action[data-post-id="${postId}"] .reply-count`);
      if (replyCountSpan) {
        replyCountSpan.textContent = parseInt(replyCountSpan.textContent) + 1;
      }
 
      input.value = '';
      privacyCheckbox.checked = false;
      showNotification(isPrivate ? 'Comentário enviado em modo privado! 🤫' : 'Comentário enviado! 💬');
 
      // ✅ Notifica o dono do post
      const { data: postOwner } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();
 
      if (postOwner?.user_id && postOwner.user_id !== currentProfile.id) {
        await createNotification({
          toUserId: postOwner.user_id,
          actorId:  currentProfile.id,
          type:     NOTIF_TYPES.REPLY,
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

async function handleSubmitPost(content) {
  content = content?.trim();
  if (!content) return;

  if (!currentProfile) {
    showNotification('Faça login para postar! 🔐');
    return;
  }

  const postInput = document.getElementById('postInput');
  const modalInput = document.getElementById('modalPostInput');
  if (postInput) { postInput.value = ''; postInput.style.height = 'auto'; }
  if (modalInput) modalInput.value = '';

  try {
    const newPost = await createPost(content);
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
// PERFIL (PÁGINA) E ABAS DO PERFIL
// ============================================================
function setupProfileTabs() {
  const tabs = document.querySelectorAll('.profile-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (!currentProfile) return;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabType = tab.getAttribute('data-tab');
      loadProfileTabContent(tabType);
    });
  });
}

async function loadProfileTabContent(tabType) {
  const contentEl = document.getElementById('profileContent');
  contentEl.innerHTML = '<p style="padding:20px;text-align:center;">Carregando...</p>';

  if (!currentProfile) return;

  try {
    let postsToRender = [];

    if (tabType === 'posts') {
      postsToRender = await getPostsByUser(currentProfile.id);
    }
    else if (tabType === 'curtidos') {
      postsToRender = await getLikedPosts(currentProfile.id);
    }
    else if (tabType === 'midia') {
      const allPosts = await getPostsByUser(currentProfile.id);
      postsToRender = allPosts.filter(p => p.content && p.content.includes('http'));
    }

    postsToRender = postsToRender.filter(p => p != null);

    if (postsToRender.length === 0) {
      const msg = tabType === 'curtidos' ? 'Você ainda não curtiu nenhum post. ❤️' :
        tabType === 'midia' ? 'Você ainda não tem posts com mídia. 📷' :
          'Nenhum post encontrado. 🚀';
      contentEl.innerHTML = `<p style="padding:40px;text-align:center;color:var(--text-secondary)">${msg}</p>`;
      return;
    }

    renderPosts(postsToRender, contentEl);
  } catch (err) {
    console.error(err);
    contentEl.innerHTML = '<p style="color:var(--danger); text-align:center;">Erro ao carregar conteúdo.</p>';
  }
}

async function loadProfilePage() {
  const editBtn = document.getElementById('editProfileBtn');

  // 🔥 define qual perfil mostrar
  const profile = viewingProfile || currentProfile;

  // =========================
  // 🚫 USUÁRIO NÃO LOGADO
  // =========================
  if (!profile) {
    document.getElementById('profileName').textContent = "Visitante";
    document.getElementById('profileHandle').textContent = "@anonimo";
    document.getElementById('profileBio').textContent =
      "Faça login para ter seu próprio perfil, fazer posts e interagir com a galera da PUC!";

    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileAvatar) {
      profileAvatar.src = "https://api.dicebear.com/7.x/avataaars/svg?seed=visitante";
    }

    const statValues = document.querySelectorAll('.stat-value');
    if (statValues.length >= 2) {
      statValues[0].textContent = "0";
      statValues[1].textContent = "0";
    }

    if (editBtn) {
      editBtn.textContent = "Fazer Login";
      editBtn.style.display = 'block';
      editBtn.classList.add('btn-login-animado');
    }

    const contentEl = document.getElementById('profileContent');
    contentEl.innerHTML =
      '<p style="padding:40px 20px; text-align:center; color:var(--text-secondary);">Faça login para visualizar e gerenciar seus posts. 🚀</p>';
    return;
  }

  // =========================
  // 👤 PERFIL (SEU OU DE OUTRO)
  // =========================
  document.getElementById('profileName').textContent = profile.name;
  document.getElementById('profileHandle').textContent = `@${profile.handle}`;
  document.getElementById('profileBio').textContent = profile.bio || 'Sem bio.';

  const profileAvatar = document.querySelector('.profile-avatar');

  const avatar =
    profile.avatar_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.handle}`;

  if (profileAvatar) profileAvatar.src = avatar;

  // =========================
  // 📊 STATS
  // =========================
  const statValues = document.querySelectorAll('.stat-value');
  if (statValues.length >= 2) {
    statValues[0].textContent = profile.following_count || 0;
    statValues[1].textContent = profile.followers_count || 0;
  }

  // =========================
  // ✏️ BOTÃO EDITAR
  // =========================
  if (editBtn) {
    if (currentProfile && profile.id === currentProfile.id) {
      editBtn.textContent = "Editar Perfil";
      editBtn.style.display = 'block';
      editBtn.classList.remove('btn-login-animado');
    } else {
      editBtn.style.display = 'none'; // 🔥 esconde se não for você
    }
  }

  // =========================
  // 📂 TABS
  // =========================
  const tabs = document.querySelectorAll('.profile-tab-btn');
  tabs.forEach(t => t.classList.remove('active'));

  const postsTab = document.querySelector('.profile-tab-btn[data-tab="posts"]');
  if (postsTab) postsTab.classList.add('active');

  loadProfileTabContent('posts');
}

// ============================================================
// MODAL DE PERFIL E BOTÃO "FAZER LOGIN" DA ABA PERFIL
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
      console.log("Redirecionando para Login pela aba de Perfil...");
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

    // 🔥 NOVO: upload da imagem
    if (fileInput && fileInput.files.length > 0) {
      avatarUrl = await uploadAvatar(fileInput.files[0]);
    }

    const updates = {
      name: document.getElementById('editName').value.trim(),
      handle: document.getElementById('editHandle').value.trim(),
      bio: document.getElementById('editBio').value.trim(),
      avatar_url: avatarUrl // 🔥 IMPORTANTE
    };

    const updated = await updateProfile(updates);
    currentProfile = updated;

    updateUserUI();
    loadProfilePage();

    showNotification('Perfil atualizado com sucesso! ✅');
    closeModal();

  } catch (err) {
  console.error('ERRO REAL:', err);
  alert(err.message);
}finally {
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
      const avatar = c.otherUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.otherUser?.handle}`;
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
    <div style="padding: 16px; border-bottom: 1px solid var(--border); background: var(--dark-bg-secondary);">
      <strong style="font-size: 16px;">${escapeHtml(otherUser.name)}</strong> 
      <span style="color:var(--text-secondary); font-size:13px; margin-left: 8px;">@${escapeHtml(otherUser.handle)}</span>
    </div>
    <div id="chatMessages" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; background: var(--dark-bg);">
      <p style="text-align:center; color:var(--text-secondary);">Carregando histórico...</p>
    </div>
    <div style="padding:16px; border-top: 1px solid var(--border); display:flex; gap:10px; background: var(--dark-bg-secondary);">
      <input type="text" id="msgInput" placeholder="Envie uma mensagem..." style="flex:1; padding:12px 16px; border-radius:20px; border:1px solid var(--border); background:var(--dark-bg); color:var(--text-primary); outline: none;">
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
  unsubscribeCurrentChat = subscribeToMessages(convId, (newMsg) => {
    appendMessageToUI(newMsg);
  });
}

function renderMessagesList(msgs) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = msgs.length === 0 ? '<p style="text-align:center;color:var(--text-secondary);">Diga olá! 👋</p>' : '';
  msgs.forEach(appendMessageToUI);
}

function appendMessageToUI(msg) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const emptyText = container.querySelector('p');
  if (emptyText && emptyText.textContent.includes('Diga olá')) emptyText.remove();

  const isMe = msg.sender_id === currentProfile.id;
  const bubble = document.createElement('div');

  bubble.style.cssText = `
    max-width: 75%;
    padding: 10px 14px;
    border-radius: 18px;
    font-size: 15px;
    line-height: 1.4;
    word-break: break-word;
    ${isMe ?
      'background: var(--primary); color: white; align-self: flex-end; border-bottom-right-radius: 4px;' :
      'background: var(--dark-bg-tertiary); color: var(--text-primary); align-self: flex-start; border-bottom-left-radius: 4px;'
    }
  `;
  bubble.textContent = msg.content;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================================
// SISTEMA DE EMOJIS
// ============================================================
function setupEmojis() {
  const emojis = ['😀', '😂', '🥰', '😎', '😭', '😡', '👍', '👎', '❤️', '🔥', '✨', '🎉', '🤔', '👀', '🙌', '🙏', '💀', '🤡', '💩', '💯', '✅', '❌', '⚠️', '💡', '🗣️', '🧊', '🍺', '🍕', '🎓', '📚'];

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
        const text = input.value;

        input.value = text.substring(0, start) + item.textContent + text.substring(end);

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
  if (toggleFeed && pickerFeed) {
    toggleFeed.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      pickerFeed.classList.toggle('active');
      document.getElementById('pickerEmojiModal')?.classList.remove('active');
    });
  }

  const toggleModal = document.getElementById('btnEmojiModal');
  const pickerModal = document.getElementById('pickerEmojiModal');
  if (toggleModal && pickerModal) {
    toggleModal.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      pickerModal.classList.toggle('active');
      document.getElementById('pickerEmojiFeed')?.classList.remove('active');
    });
  }

  document.addEventListener('click', () => {
    if (pickerFeed) pickerFeed.classList.remove('active');
    if (pickerModal) pickerModal.classList.remove('active');
  });

  if (pickerFeed) pickerFeed.addEventListener('click', e => e.stopPropagation());
  if (pickerModal) pickerModal.addEventListener('click', e => e.stopPropagation());
}

// ============================================================
// ABA EXPLORAR (ALGORITMO DE RECOMENDAÇÃO SIMULADO)
// ============================================================
async function loadExplorePage() {
  const exploreContent = document.getElementById('exploreContent');
  if (!exploreContent) return;

  exploreContent.innerHTML = '<p style="text-align:center; padding: 40px; color: var(--text-secondary);">Analisando o algoritmo e carregando recomendações... 🔄</p>';

  try {
    const posts = await getPosts(30);

    const topPosts = [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 4);
    const recentPosts = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    const friendsLiked = [...posts].sort(() => 0.5 - Math.random()).slice(0, 4);

    const suggestedUsers = [
      { name: "Diretório Central", handle: "dce_puc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=dce" },
      { name: "Atlética de Exatas", handle: "atletica_exatas", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=exatas" },
      { name: "Bateria Fúria", handle: "bateria_furia", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=furia" },
      { name: "Lucas Mendes", handle: "lucas_mendes", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=lucas" },
      { name: "Mariana Souza", handle: "mari_sz", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=mari" }
    ];

    const renderMiniPost = (post, contextLabel, contextIcon) => {
      const avatar = post.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;
      return `
        <div class="explore-post-card" onclick="alert('Funcionalidade de abrir post detalhado em breve!')">
          ${contextLabel ? `<div class="explore-context"><span class="explore-context-icon">${contextIcon}</span> ${contextLabel}</div>` : ''}
          <div style="display: flex; gap: 8px; align-items: center;">
            <img src="${avatar}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${escapeHtml(post.author?.name)}</div>
              <div style="color: var(--text-secondary); font-size: 12px;">@${escapeHtml(post.author?.handle)}</div>
            </div>
          </div>
          <div style="font-size: 14px; color: var(--text-primary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(post.content)}
          </div>
          <div style="color: var(--text-secondary); font-size: 12px; display: flex; justify-content: space-between; margin-top: auto; padding-top: 8px;">
            <span style="display: flex; gap: 12px;">
              <span>❤️ ${post.likes_count || 0}</span>
              <span>💬 ${post.replies_count || 0}</span>
            </span>
            <span>📍 PUC</span>
          </div>
        </div>
      `;
    };

    exploreContent.innerHTML = `
      <div class="explore-sections">
        
        <section>
          <h3 class="explore-section-title">✨ Sugestões para você</h3>
          <div class="suggested-users-row">
            ${suggestedUsers.map(u => `
              <div class="suggested-user-card">
                <img src="${u.avatar}" alt="${u.name}">
                <div>
                  <h4>${u.name}</h4>
                  <p>@${u.handle}</p>
                </div>
                <button class="btn-follow-small">Seguir</button>
              </div>
            `).join('')}
          </div>
        </section>

        <section>
          <h3 class="explore-section-title">🔥 Em Alta no VazaPUC</h3>
          <div class="explore-grid">
            ${topPosts.map(p => renderMiniPost(p, 'Baseado nos seus gostos', '⭐')).join('')}
          </div>
        </section>

        <section>
          <h3 class="explore-section-title">👀 O que a galera tá vendo</h3>
          <div class="explore-grid">
            ${friendsLiked.map(p => renderMiniPost(p, 'Amigos também interagiram', '👥')).join('')}
          </div>
        </section>

        <section>
          <h3 class="explore-section-title">🕒 Acabou de vazar</h3>
          <div class="explore-grid">
            ${recentPosts.map(p => renderMiniPost(p, 'Postado recentemente', '✨')).join('')}
          </div>
        </section>

      </div>
    `;

  } catch (err) {
    console.error('Erro ao carregar explorar:', err);
    exploreContent.innerHTML = '<p style="color:var(--danger); text-align:center; padding: 20px;">Ocorreu um erro ao carregar o algoritmo. Tente novamente!</p>';
  }
}

// ============================================================
// WIDGET EXPANSÍVEL DOS BLOCOS (SIDEBAR DIREITA)
// ============================================================
function setupTrendingWidget() {
  const widget = document.getElementById('trendingWidget');
  const btn = document.getElementById('toggleBlocksBtn');

  if (widget && btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.toggle('expanded'); // Alterna entre o estado grande e pequeno
    });
  }
}
async function initNotifications() {
  if (!currentProfile) return;
 
  // Atualiza o badge com a contagem atual
  await refreshNotifBadge();
 
  // Inscreve em notificações em tempo real
  if (unsubscribeNotifs) unsubscribeNotifs();
 
  unsubscribeNotifs = subscribeToNotifications(currentProfile.id, (newNotif) => {
    // Atualiza o badge
    refreshNotifBadge();
 
    // Mostra o toast de nova notificação
    showNotifToast(newNotif);
  });
}
 
// --- Atualiza o número no badge ---
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
 
// --- Configura o botão do sino e o painel ---
function setupNotifications() {
  const bellBtn   = document.getElementById('notifBellBtn');
  const panel     = document.getElementById('notifPanel');
  const backdrop  = document.getElementById('notifBackdrop');
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
 
    // Carrega a lista sempre que abre
    if (panel.classList.contains('active')) {
      await renderNotifList();
    }
  });
 
  backdrop?.addEventListener('click', () => {
    panel.classList.remove('active');
  });
 
  markAllBtn?.addEventListener('click', async () => {
    await markAllAsRead();
    await refreshNotifBadge();
    await renderNotifList();
    showNotification('Todas as notificações foram lidas! ✅');
  });
}
 
// --- Renderiza a lista dentro do painel ---
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
      </div>
    `;
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
      </div>
    `;
  }).join('');
 
  // Marca como lida ao clicar
  listEl.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const notifId = item.dataset.notifId;
      item.classList.remove('unread');
      await markAsRead(notifId);
      await refreshNotifBadge();
    });
  });
 
  // Marca todas como lidas após 3s com o painel aberto
  setTimeout(async () => {
    const panel = document.getElementById('notifPanel');
    if (panel?.classList.contains('active')) {
      await markAllAsRead();
      await refreshNotifBadge();
    }
  }, 3000);
}
 
// --- Toast de nova notificação (aparece no canto inferior) ---
function showNotifToast(notif) {
  const existing = document.querySelector('.notif-toast');
  if (existing) existing.remove();
 
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.innerHTML = `
    <span class="notif-toast-icon">${getNotifIcon(notif.type)}</span>
    <p class="notif-toast-text">${escapeHtml(getNotifText(notif))}</p>
  `;
 
  toast.addEventListener('click', async () => {
    removeToast(toast);
    // Abre o painel de notificações
    document.getElementById('notifPanel')?.classList.add('active');
    await renderNotifList();
  });
 
  document.body.appendChild(toast);
 
  // Remove automaticamente após 5s
  setTimeout(() => removeToast(toast), 5000);
}
 
function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}