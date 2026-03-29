// ===== DADOS SIMULADOS =====
const appState = {
    user: {
        id: 1,
        name: 'Seu Nome',
        handle: '@seu_handle',
        bio: 'Desenvolvedor apaixonado por tecnologia 💻',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=currentuser',
        followers: 1240,
        following: 586,
        posts: []
    },
    posts: [
        {
            id: 1,
            author: 'João Silva',
            handle: '@joaosilva',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=joao',
            content: 'Acabei de lançar um novo projeto em React! Muito feliz com o resultado 🚀',
            timestamp: '2h atrás',
            likes: 234,
            replies: 12,
            retweets: 45,
            liked: false
        },
        {
            id: 2,
            author: 'Maria Santos',
            handle: '@mariasantos',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',
            content: 'JavaScript é realmente incrível quando você entende bem os conceitos de closure e hoisting',
            timestamp: '4h atrás',
            likes: 1205,
            replies: 89,
            retweets: 340,
            liked: false
        },
        {
            id: 3,
            author: 'Carlos Dev',
            handle: '@carlosdev',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carlos',
            content: 'Dica: sempre escreva testes para seu código. Isso vai economizar tempo no futuro! ✨',
            timestamp: '6h atrás',
            likes: 567,
            replies: 34,
            retweets: 123,
            liked: false
        }
    ],
    conversations: [
        {
            id: 1,
            user: 'João Silva',
            handle: '@joaosilva',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=joao',
            lastMessage: 'Boa! Vamos combinar depois?',
            messages: []
        },
        {
            id: 2,
            user: 'Maria Santos',
            handle: '@mariasantos',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',
            lastMessage: 'Muito obrigada! Você é incrível',
            messages: []
        }
    ],
    suggestions: [
        {
            id: 101,
            name: 'Ana Costa',
            handle: '@anacosta',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ana'
        },
        {
            id: 102,
            name: 'Pedro Oliveira',
            handle: '@pedrooliveira',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=pedro'
        },
        {
            id: 103,
            name: 'Lucas Martins',
            handle: '@lucasmartins',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lucas'
        }
    ]
};

// ===== SELEÇÃO DE ELEMENTOS =====
const navItems = document.querySelectorAll('.nav-item');
const pageContainers = document.querySelectorAll('.page-container');
const postInput = document.getElementById('postInput');
const postSubmitBtn = document.getElementById('postSubmitBtn');
const postsContainer = document.getElementById('postsContainer');
const postBtnSidebar = document.getElementById('postBtnSidebar');
const postModal = document.getElementById('postModal');
const closePostModalBtn = document.getElementById('closePostModal');
const cancelPostBtn = document.getElementById('cancelPostBtn');
const submitPostBtn = document.getElementById('submitPostBtn');
const modalPostInput = document.getElementById('modalPostInput');
const editProfileBtn = document.getElementById('editProfileBtn');
const editProfileModal = document.getElementById('editProfileModal');
const closeEditModal = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const saveEditBtn = document.getElementById('saveEditBtn');
const conversationsList = document.getElementById('conversationsList');
const chatArea = document.getElementById('chatArea');
const suggestionsList = document.getElementById('suggestionsList');
const profileName = document.getElementById('profileName');
const profileHandle = document.getElementById('profileHandle');
const profileBio = document.getElementById('profileBio');
const tabBtns = document.querySelectorAll('.tab-btn');
const searchInput = document.getElementById('searchInput');

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initPosts();
    initPostComposer();
    initModals();
    initProfilePage();
    initConversations();
    initSuggestions();
});

// ===== NAVEGAÇÃO =====
function initNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageName = item.dataset.page;
            
            // Remove active de todos
            navItems.forEach(nav => nav.classList.remove('active'));
            pageContainers.forEach(page => page.classList.remove('active'));
            
            // Adiciona active ao clicado
            item.classList.add('active');
            document.getElementById(`${pageName}-page`).classList.add('active');
        });
    });
}

// ===== FUNCIONALIDADES DE POST =====
function initPostComposer() {
    // Post rápido na timeline
    postSubmitBtn.addEventListener('click', submitPost);
    postInput.addEventListener('keypress', (e) => {
        if (e.ctrlKey && e.key === 'Enter') submitPost();
    });

    // Abrir modal pelo botão da sidebar
    if (postBtnSidebar) {
    postBtnSidebar.addEventListener('click', openPostModal);
}
console.log(postBtnSidebar);

if (closePostModalBtn) {
    closePostModalBtn.addEventListener('click', closePostModal);
}
    cancelPostBtn.addEventListener('click', closePostModal);
    postModal.addEventListener('click', (e) => {
        if (e.target === postModal) closePostModal();
    });

    // Submit do modal
    submitPostBtn.addEventListener('click', () => {
        const content = modalPostInput.value.trim();
        if (content) {
            addPost(content);
            modalPostInput.value = '';
            postModal.classList.remove('active');
        }
    });
}

function openPostModal() {
    postModal.classList.add('active');
    modalPostInput.focus();
}

function closePostModal() {
    postModal.classList.remove('active');
    modalPostInput.value = '';
}

function submitPost() {
    const content = postInput.value.trim();
    if (content) {
        addPost(content);
        postInput.value = '';
        postInput.style.height = 'auto';
    }
}

function addPost(content) {
    const newPost = {
        id: appState.posts.length + 1,
        author: appState.user.name,
        handle: appState.user.handle,
        avatar: appState.user.avatar,
        content: content,
        timestamp: 'agora',
        likes: 0,
        replies: 0,
        retweets: 0,
        liked: false
    };

    appState.posts.unshift(newPost);
    appState.user.posts.push(newPost.id);
    renderPosts();

    // Toast notification
    showNotification('Post criado com sucesso! ✨');
}

// ===== RENDERIZAÇÃO DE POSTS =====
function initPosts() {
    renderPosts();
}

function renderPosts() {
    postsContainer.innerHTML = appState.posts.map(post => createPostElement(post)).join('');
    attachPostListeners();
}

function createPostElement(post) {
    return `
        <div class="post-card" data-post-id="${post.id}">
            <img src="${post.avatar}" alt="${post.author}" class="post-avatar">
            <div class="post-content">
                <div class="post-header">
                    <span class="post-author">${post.author}</span>
                    <span class="post-handle">${post.handle}</span>
                    <span class="post-time">${post.timestamp}</span>
                </div>
                <p class="post-text">${escapeHtml(post.content)}</p>
                <div class="post-actions">
                    <div class="post-action reply-action" title="Responder">
                        💬 <span>${post.replies}</span>
                    </div>
                    <div class="post-action retweet-action" title="Retweet">
                        🔄 <span>${post.retweets}</span>
                    </div>
                    <div class="post-action like-action ${post.liked ? 'liked' : ''}" title="Curtir">
                        ❤️ <span>${post.likes}</span>
                    </div>
                    <div class="post-action share-action" title="Compartilhar">
                        📤
                    </div>
                </div>
            </div>
        </div>
    `;
}

function attachPostListeners() {
    const postCards = document.querySelectorAll('.post-card');
    
    postCards.forEach(card => {
        const postId = parseInt(card.dataset.postId);
        const post = appState.posts.find(p => p.id === postId);
        
        const likeBtn = card.querySelector('.like-action');
        const replyBtn = card.querySelector('.reply-action');
        const retweetBtn = card.querySelector('.retweet-action');

        if (likeBtn) {
            likeBtn.addEventListener('click', () => toggleLike(postId));
        }

        if (replyBtn) {
            replyBtn.addEventListener('click', () => {
                showNotification(`Respondendo para ${post.author}...`);
            });
        }

        if (retweetBtn) {
            retweetBtn.addEventListener('click', () => {
                showNotification(`Retweetado! ✨`);
            });
        }
    });
}

function toggleLike(postId) {
    const post = appState.posts.find(p => p.id === postId);
    if (post) {
        post.liked = !post.liked;
        post.likes += post.liked ? 1 : -1;
        renderPosts();
    }
}
closePostModalBtn.addEventListener('click', closePostModal);
// ===== PROFILE PAGE =====
function initProfilePage() {
    updateProfileDisplay();

    editProfileBtn.addEventListener('click', () => {
        document.getElementById('editName').value = appState.user.name;
        document.getElementById('editHandle').value = appState.user.handle;
        document.getElementById('editBio').value = appState.user.bio;
        editProfileModal.classList.add('active');
    });

    closeEditModal.addEventListener('click', () => {
        editProfileModal.classList.remove('active');
    });

    cancelEditBtn.addEventListener('click', () => {
        editProfileModal.classList.remove('active');
    });

    saveEditBtn.addEventListener('click', () => {
        appState.user.name = document.getElementById('editName').value;
        appState.user.handle = document.getElementById('editHandle').value;
        appState.user.bio = document.getElementById('editBio').value;
        editProfileModal.classList.remove('active');
        updateProfileDisplay();
        showNotification('Perfil atualizado! ✨');
    });

    // Profile tabs
    const profileTabBtns = document.querySelectorAll('.profile-tab-btn');
    profileTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            profileTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProfileContent(btn.dataset.tab);
        });
    });

    editProfileModal.addEventListener('click', (e) => {
        if (e.target === editProfileModal) editProfileModal.classList.remove('active');
    });
}

function updateProfileDisplay() {
    profileName.textContent = appState.user.name;
    profileHandle.textContent = appState.user.handle;
    profileBio.textContent = appState.user.bio;
    document.querySelectorAll('.stat-value')[0].textContent = appState.user.following;
    document.querySelectorAll('.stat-value')[1].textContent = appState.user.followers;
}

function renderProfileContent(tab) {
    const profileContent = document.getElementById('profileContent');
    
    if (tab === 'posts') {
        const userPosts = appState.posts.filter(p => p.handle === appState.user.handle);
        profileContent.innerHTML = userPosts.map(post => createPostElement(post)).join('');
        attachPostListeners();
    } else if (tab === 'curtidos') {
        const likedPosts = appState.posts.filter(p => p.liked);
        profileContent.innerHTML = likedPosts.length > 0 
            ? likedPosts.map(post => createPostElement(post)).join('')
            : '<div style="padding: 40px; text-align: center; color: var(--text-secondary);">Nenhum post curtido ainda</div>';
        attachPostListeners();
    } else if (tab === 'midia') {
        profileContent.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-secondary);">Nenhuma mídia compartilhada ainda</div>';
    }
}

// ===== MENSAGENS =====
function initConversations() {
    renderConversations();
}

function renderConversations() {
    conversationsList.innerHTML = appState.conversations.map(conv => `
        <div class="conversation-item" data-conversation-id="${conv.id}">
            <img src="${conv.avatar}" alt="${conv.user}" class="conversation-avatar">
            <div class="conversation-info">
                <div class="conversation-name">${conv.user}</div>
                <div class="conversation-preview">${conv.lastMessage}</div>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            const convId = parseInt(item.dataset.conversationId);
            openConversation(convId);
        });
    });
}

function openConversation(convId) {
    const conversation = appState.conversations.find(c => c.id === convId);
    
    // Desenhando a interface do chat com efeito de Vidro Translúcido (Glassmorphism)
    chatArea.innerHTML = `
        <div style="flex: 1; overflow-y: auto; padding: 24px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <img src="${conversation.avatar}" alt="${conversation.user}" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 12px; border: 2px solid var(--primary); box-shadow: 0 4px 15px rgba(163, 31, 75, 0.3);">
                <h3 style="margin: 0 0 4px 0; color: var(--text-primary); font-size: 1.3rem;">${conversation.user}</h3>
                <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">${conversation.handle}</p>
            </div>
            <div id="messagesDisplay" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>
        
        <div style="padding: 20px; border-top: 1px solid rgba(163, 31, 75, 0.2); background-color: rgba(38, 14, 23, 0.4); backdrop-filter: blur(10px); display: flex; gap: 12px;">
            <input type="text" id="messageInput" placeholder="Escreva uma mensagem..." 
                   style="flex: 1; padding: 14px 20px; background: rgba(56, 21, 34, 0.5); border: 1px solid rgba(163, 31, 75, 0.2); border-radius: 25px; color: var(--text-primary); outline: none; transition: all 0.3s ease;">
            <button id="sendMessageBtn" style="padding: 12px 25px; background: rgba(163, 31, 75, 0.3); color: white; border: 1px solid rgba(163, 31, 75, 0.6); border-radius: 25px; cursor: pointer; font-weight: bold; backdrop-filter: blur(5px); transition: all 0.3s ease;">
                Enviar
            </button>
        </div>
    `;

    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessageBtn');

    // não sei se vai funcionar mas tentei um efeito dhr q eu vi no tiktok 
    messageInput.addEventListener('focus', () => {
        messageInput.style.borderColor = 'rgba(163, 31, 75, 0.7)';
        messageInput.style.backgroundColor = 'rgba(56, 21, 34, 0.8)';
    });
    messageInput.addEventListener('blur', () => {
        messageInput.style.borderColor = 'rgba(163, 31, 75, 0.2)';
        messageInput.style.backgroundColor = 'rgba(56, 21, 34, 0.5)';
    });

    sendBtn.addEventListener('click', () => {
        if (messageInput.value.trim()) {
            messageInput.value = '';
            showNotification('Mensagem enviada! ✨');
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && messageInput.value.trim()) {
            messageInput.value = '';
            showNotification('Mensagem enviada! ✨');
        }
    });
}
// ===== SUGESTÕES =====
function initSuggestions() {
    renderSuggestions();
}

function renderSuggestions() {
    suggestionsList.innerHTML = appState.suggestions.map(user => `
        <div class="suggestion-card">
            <img src="${user.avatar}" alt="${user.name}" class="suggestion-avatar">
            <div class="suggestion-info">
                <div class="suggestion-name">${user.name}</div>
                <div class="suggestion-handle">${user.handle}</div>
            </div>
            <button class="suggestion-follow-btn" onclick="followUser(${user.id})">Seguir</button>
        </div>
    `).join('');
}

function followUser(userId) {
    const user = appState.suggestions.find(u => u.id === userId);
    if (user) {
        showNotification(`Você seguiu ${user.name}! ✨`);
        appState.user.following += 1;
        updateProfileDisplay();
    }
}

// ===== UTILIDADES =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--primary);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 2000;
        animation: slideUp 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Auto-expand textarea
if (postInput) {
    postInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

// ===== EXPLORAR (SEARCH) =====
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length > 0) {
            showNotification(`Procurando por "${query}"...`);
        }
    });
}

// ===== ADICIONAR FUNÇÕES GLOBAIS PARA MODAIS =====
function initModals() {
    // Prevenir clicks dentro do modal de fechar ele
    [postModal, editProfileModal].forEach(modal => {
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.addEventListener('click', (e) => e.stopPropagation());
        }
    });
}

// Log para debugging
console.log('🚀 SocialHub Carregado!');
console.log('Estado da app:', appState);