// ============================================================
// js/home.js — Código completo da Home (Feed, Perfil, Chat)
// ============================================================

import { getCurrentProfile, onAuthChange, signOut } from './supabase.js';
import {
  getPosts,
  createPost,
  likePost,
  unlikePost,
  getLikedPostIds,
  subscribeToNewPosts,
  getPostsByUser
} from './posts.js';

import { updateProfile } from './profile.js';
import { getConversations, getMessages, sendMessage, subscribeToMessages } from './messages.js';

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
  setupNavigation();
  setupPostComposer();
  setupPostModal();
  setupProfileModal(); // <--- Controla o botão do Perfil
  setupEmojis(); 
  setupUserMini();     // <--- Controla a caixa "Seu Usuário"
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
      e.stopPropagation(); // Evita que o clique feche a janelinha imediatamente
      
      if (!currentProfile) {
        // Se NÃO estiver logado -> Mostra ou esconde a janelinha suavemente
        if(loginPopup) loginPopup.classList.toggle('active');
      } else {
        // Se ESTIVER logado -> Pergunta se quer sair normalmente
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

  // Quando clicar no botão vermelho DENTRO da janelinha, aí sim leva pro login!
  if (btnPopupLogin) {
    btnPopupLogin.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.assign('../inicial/login.html');
    });
  }

  // Mágica: Fecha a janelinha se o usuário clicar em qualquer outro lugar da tela
  document.addEventListener('click', () => {
    if (loginPopup && loginPopup.classList.contains('active')) {
      loginPopup.classList.remove('active');
    }
  });

  // Impedir que clicar dentro da própria janelinha a faça fechar sem querer
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
    if(nameEl) nameEl.textContent = "Fazer Login";
    if(handleEl) handleEl.textContent = "Clique para entrar 🚀";
    return;
  }

  if(nameEl) nameEl.textContent = currentProfile.name;
  if(handleEl) handleEl.textContent = `@${currentProfile.handle}`;

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
    });
  });
}

// ============================================================
// FEED DE POSTS E RESTANTE DAS FUNÇÕES
// ============================================================
async function loadFeed() {
  const container = document.getElementById('postsContainer');
  if(!container) return;
  
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

function attachPostEventListeners() {
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

      const newLiked = !wasLiked;
      newBtn.dataset.liked = newLiked;
      newBtn.classList.toggle('liked', newLiked);
      countEl.textContent = parseInt(countEl.textContent) + (newLiked ? 1 : -1);

      if (newLiked) likedPostIds.add(postId);
      else likedPostIds.delete(postId);

      try {
        if (newLiked) await likePost(postId);
        else await unlikePost(postId);
      } catch (err) {
        newBtn.dataset.liked = wasLiked;
        newBtn.classList.toggle('liked', wasLiked);
        countEl.textContent = parseInt(countEl.textContent) + (wasLiked ? 1 : -1);
        showNotification('Erro ao curtir. Tente novamente.');
      }
    });
  });
}

function prependPost(post) {
  const container = document.getElementById('postsContainer');
  if(!container) return;
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
// PERFIL (PÁGINA)
// ============================================================
async function loadProfilePage() {
  const editBtn = document.getElementById('editProfileBtn');

  // 1. SE O USUÁRIO NÃO ESTIVER LOGADO (Visitante)
  if (!currentProfile) {
    document.getElementById('profileName').textContent = "Visitante";
    document.getElementById('profileHandle').textContent = "@anonimo";
    document.getElementById('profileBio').textContent = "Faça login para ter seu próprio perfil, fazer posts e interagir com a galera da PUC!";
    
    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileAvatar) profileAvatar.src = "https://api.dicebear.com/7.x/avataaars/svg?seed=visitante";

    const statValues = document.querySelectorAll('.stat-value');
    if(statValues.length >= 2) {
      statValues[0].textContent = "0";
      statValues[1].textContent = "0";
    }

    if (editBtn) {
      editBtn.textContent = "Fazer Login";
      editBtn.style.borderColor = "";
      editBtn.style.color = "";
      editBtn.classList.add('btn-login-animado');
    }

    const contentEl = document.getElementById('profileContent');
    contentEl.innerHTML = '<p style="padding:40px 20px; text-align:center; color:var(--text-secondary);">Faça login para visualizar e gerenciar seus posts. 🚀</p>';
    return; 
  }

  // 2. SE O USUÁRIO ESTIVER LOGADO
  document.getElementById('profileName').textContent = currentProfile.name;
  document.getElementById('profileHandle').textContent = `@${currentProfile.handle}`;
  document.getElementById('profileBio').textContent = currentProfile.bio || 'Sem bio.';
  
  const profileAvatar = document.querySelector('.profile-avatar');
  if (currentProfile.avatar_url) profileAvatar.src = currentProfile.avatar_url;

  const statValues = document.querySelectorAll('.stat-value');
  if(statValues.length >= 2) {
    statValues[0].textContent = currentProfile.following_count || 0;
    statValues[1].textContent = currentProfile.followers_count || 0;
  }

  if (editBtn) {
    editBtn.textContent = "Editar Perfil";
    editBtn.classList.remove('btn-login-animado');
  }

  const contentEl = document.getElementById('profileContent');
  contentEl.innerHTML = '<p style="padding:20px;text-align:center;">Carregando posts...</p>';
  try {
    const userPosts = await getPostsByUser(currentProfile.id);
    renderPosts(userPosts, contentEl);
  } catch(err) {
    contentEl.innerHTML = '<p style="color:var(--danger); text-align:center;">Erro ao carregar posts.</p>';
  }
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

    // Se NÃO tiver perfil logado, leva pra tela de Login
    if (!currentProfile) {
      console.log("Redirecionando para Login pela aba de Perfil...");
      window.location.assign('../inicial/login.html');
      return;
    }
    
    // Se TEM perfil logado, abre a edição
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
      const updates = {
        name: document.getElementById('editName').value.trim(),
        handle: document.getElementById('editHandle').value.trim(),
        bio: document.getElementById('editBio').value.trim()
      };
      const updated = await updateProfile(updates);
      currentProfile = updated; 
      
      updateUserUI(); 
      loadProfilePage(); 
      showNotification('Perfil atualizado com sucesso! ✅');
      closeModal();
    } catch (err) {
      console.error(err);
      showNotification('Erro ao atualizar. Handle já em uso? ❌');
    } finally {
      saveBtn.textContent = 'Salvar';
      saveBtn.disabled = false;
    }
  });
}

async function loadMessagesPage() {
  const listEl = document.getElementById('conversationsList');
  if(!listEl) return;
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
    if(pickerFeed) pickerFeed.classList.remove('active');
    if(pickerModal) pickerModal.classList.remove('active');
  });
  
  if(pickerFeed) pickerFeed.addEventListener('click', e => e.stopPropagation());
  if(pickerModal) pickerModal.addEventListener('click', e => e.stopPropagation());
}