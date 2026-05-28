// ============================================================
// js/midia.js — Sistema de Mídia (upload de fotos nos posts)
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// CONFIGURAÇÕES
// ============================================================
const MAX_FILES = 4;           // máximo de fotos por post
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB por arquivo
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const BUCKET_NAME = 'posts-media';

// ============================================================
// UPLOAD DE UMA OU MAIS FOTOS
// Retorna array de URLs públicas
// ============================================================
export async function uploadPostMedia(files) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  const urls = [];

  for (const file of Array.from(files).slice(0, MAX_FILES)) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Arquivo muito grande: ${file.name} (máx 5MB)`);
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    urls.push(data.publicUrl);
  }

  return urls;
}

// ============================================================
// CRIA POST COM MÍDIA
// ============================================================
export async function createPostWithMedia(content, mediaUrls = []) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
      content: content?.trim() || '',
      media_urls: mediaUrls,
      has_media: mediaUrls.length > 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// BUSCA POSTS COM MÍDIA DE UM USUÁRIO (aba Mídia no perfil)
// ============================================================
export async function getMediaPostsByUser(userId, limit = 30) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, content, created_at, media_urls, likes_count, replies_count, reposts_count,
      author:profiles(id, name, handle, avatar_url)
    `)
    .eq('author_id', userId)
    .eq('has_media', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ============================================================
// COMPONENTE: MEDIA COMPOSER
// Injeta o botão de upload e preview de fotos no composer de posts
// ============================================================
export function setupMediaComposer({
  composerContainerId,
  onMediaChange,
}) {
  const state = { files: [], previews: [] };

  // Cria elementos invisíveis reutilizáveis
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = ALLOWED_TYPES.join(',');
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', () => {
    const newFiles = Array.from(fileInput.files || []);
    const combined = [...state.files, ...newFiles].slice(0, MAX_FILES);
    state.files = combined;
    renderPreviews();
    onMediaChange?.(state.files);
    fileInput.value = ''; // reset para permitir re-seleção
  });

  function renderPreviews() {
    const container = document.getElementById(composerContainerId);
    if (!container) return;

    let previewArea = container.querySelector('.media-preview-area');
    if (!previewArea) {
      previewArea = document.createElement('div');
      previewArea.className = 'media-preview-area';
      previewArea.style.cssText = `
        display:flex;gap:8px;flex-wrap:wrap;
        margin-top:10px;padding-top:10px;
        border-top:1px solid var(--border);
      `;
      container.appendChild(previewArea);
    }

    if (state.files.length === 0) {
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
      return;
    }

    previewArea.style.display = 'flex';
    previewArea.innerHTML = '';

    state.files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position:relative;width:80px;height:80px;
        border-radius:10px;overflow:hidden;
        border:1px solid var(--border);flex-shrink:0;
      `;

      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.onload = () => URL.revokeObjectURL(url);

      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '✕';
      removeBtn.style.cssText = `
        position:absolute;top:3px;right:3px;
        width:20px;height:20px;border-radius:50%;
        background:rgba(0,0,0,0.6);color:white;
        border:none;cursor:pointer;font-size:11px;
        display:flex;align-items:center;justify-content:center;
        line-height:1;padding:0;
      `;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.files.splice(index, 1);
        renderPreviews();
        onMediaChange?.(state.files);
      });

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      previewArea.appendChild(wrapper);
    });

    // Botão de adicionar mais (se ainda há espaço)
    if (state.files.length < MAX_FILES) {
      const addMore = document.createElement('button');
      addMore.style.cssText = `
        width:80px;height:80px;
        border-radius:10px;
        border:2px dashed var(--border);
        background:none;cursor:pointer;
        color:var(--text-secondary);
        font-size:22px;
        display:flex;align-items:center;justify-content:center;
        flex-shrink:0;transition:border-color 0.2s,color 0.2s;
      `;
      addMore.textContent = '+';
      addMore.addEventListener('mouseenter', () => {
        addMore.style.borderColor = 'var(--primary)';
        addMore.style.color = 'var(--primary)';
      });
      addMore.addEventListener('mouseleave', () => {
        addMore.style.borderColor = 'var(--border)';
        addMore.style.color = 'var(--text-secondary)';
      });
      addMore.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
      previewArea.appendChild(addMore);
    }
  }

  return {
    openFilePicker: () => fileInput.click(),
    getFiles: () => state.files,
    clearFiles: () => {
      state.files = [];
      renderPreviews();
      onMediaChange?.([]);
    },
    hasFiles: () => state.files.length > 0,
    destroy: () => fileInput.remove(),
  };
}

// ============================================================
// HTML DE GRADE DE MÍDIA num post
// ============================================================
export function createMediaGridHTML(mediaUrls, postId) {
  if (!mediaUrls?.length) return '';

  const count = Math.min(mediaUrls.length, 4);
  const urls = mediaUrls.slice(0, 4);

  // ── Layout responsivo por quantidade de imagens ──
  const gridConfig = {
    1: { cols: '1fr',        rows: 'auto',             maxH: '510px' },
    2: { cols: '1fr 1fr',    rows: '280px',            maxH: '280px' },
    3: { cols: '1fr 1fr',    rows: '200px 200px',      maxH: '404px' },
    4: { cols: '1fr 1fr',    rows: '200px 200px',      maxH: '404px' },
  };

  const cfg = gridConfig[count];

  let innerHTML = '';
  urls.forEach((url, i) => {
    const isFirstOf3 = i === 0 && count === 3;
    const isLast     = i === count - 1 && mediaUrls.length > 4;

    // A primeira imagem de um layout de 3 ocupa toda a coluna esquerda
    const spanStyle  = isFirstOf3 ? 'grid-row: span 2;' : '';

    // Altura da célula
    const cellHeight = count === 1
      ? 'auto'
      : isFirstOf3 ? '100%' : '100%';

    innerHTML += `
      <div style="
        position:relative;overflow:hidden;
        ${spanStyle}
        height:${cellHeight};
        background:var(--dark-bg-tertiary);
      " data-media-index="${i}" data-post-id="${postId}">

        <img
          src="${url}"
          loading="lazy"
          class="media-photo"
          data-media-urls="${encodeURIComponent(JSON.stringify(mediaUrls))}"
          data-index="${i}"
          style="
            width:100%;
            height:100%;
            ${count === 1 ? 'max-height:510px;' : ''}
            object-fit:${count === 1 ? 'contain' : 'cover'};
            display:block;
            cursor:pointer;
            background:#000;
            transition:opacity 0.2s;
          "
          onmouseover="this.style.opacity='0.88'"
          onmouseout="this.style.opacity='1'"
        >

        ${isLast ? `
          <div style="
            position:absolute;inset:0;
            background:rgba(0,0,0,0.55);
            display:flex;align-items:center;justify-content:center;
            font-size:26px;font-weight:800;color:white;
            cursor:pointer;pointer-events:none;
            letter-spacing:-0.5px;
          ">+${mediaUrls.length - 4}</div>
        ` : ''}
      </div>
    `;
  });

  return `
    <div class="media-grid" style="
      display:grid;
      grid-template-columns:${cfg.cols};
      grid-template-rows:${cfg.rows};
      gap:2px;
      margin-top:12px;
      border-radius:16px;
      overflow:hidden;
      max-height:${cfg.maxH};
      background:#000;
    ">
      ${innerHTML}
    </div>
  `;
}

// ============================================================
// LIGHTBOX — visualizador de foto em tela cheia
// ============================================================
// ============================================================
// LIGHTBOX — visualizador de foto em tela cheia
// ============================================================
export function openMediaLightbox(mediaUrls, startIndex = 0, postId = null) {
  document.getElementById('mediaLightbox')?.remove();

  let currentIndex = startIndex;

  const lb = document.createElement('div');
  lb.id = 'mediaLightbox';
  lb.style.cssText = `
    position:fixed;inset:0;z-index:5000;
    background:rgba(0,0,0,0.95);
    display:flex;align-items:stretch;justify-content:center;
    backdrop-filter:blur(8px);
  `;

  lb.innerHTML = `
    <button id="lbClose" style="
      position:fixed;top:16px;right:20px;
      background:rgba(255,255,255,0.12);color:white;
      border:none;border-radius:50%;
      width:36px;height:36px;font-size:18px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      z-index:10;
    ">✕</button>

    <div style="
      flex:1;
      display:flex;align-items:center;justify-content:center;
      position:relative;
      min-width:0;
      background:#000;
    ">
      ${mediaUrls.length > 1 ? `
        <button id="lbPrev" style="
          position:absolute;left:16px;top:50%;transform:translateY(-50%);
          background:rgba(255,255,255,0.15);color:white;
          border:none;border-radius:50%;
          width:40px;height:40px;font-size:22px;
          cursor:pointer;display:flex;align-items:center;justify-content:center;
          z-index:2;transition:background 0.2s;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.3)'"
        onmouseout="this.style.background='rgba(255,255,255,0.15)'">‹</button>
        <button id="lbNext" style="
          position:absolute;right:16px;top:50%;transform:translateY(-50%);
          background:rgba(255,255,255,0.15);color:white;
          border:none;border-radius:50%;
          width:40px;height:40px;font-size:22px;
          cursor:pointer;display:flex;align-items:center;justify-content:center;
          z-index:2;transition:background 0.2s;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.3)'"
        onmouseout="this.style.background='rgba(255,255,255,0.15)'">›</button>
      ` : ''}

      <img id="lbImage" src="${mediaUrls[currentIndex]}" style="
        max-width:100%;max-height:100vh;
        object-fit:contain;
        transition:opacity 0.18s;
        display:block;
      ">

      ${mediaUrls.length > 1 ? `
        <div id="lbDots" style="
          position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
          display:flex;gap:6px;
        ">
          ${mediaUrls.map((_, i) => `
            <div class="lb-dot" data-index="${i}" style="
              width:${i === currentIndex ? '18px' : '7px'};height:7px;
              border-radius:4px;
              background:${i === currentIndex ? 'white' : 'rgba(255,255,255,0.4)'};
              cursor:pointer;transition:all 0.2s;
            "></div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    ${postId ? `
    <div id="lbComments" style="
      width:380px;
      flex-shrink:0;
      background:var(--dark-bg-secondary);
      border-left:1px solid var(--border);
      display:flex;flex-direction:column;
      overflow:hidden;
    ">
      <div style="
        padding:16px 20px;
        border-bottom:1px solid var(--border);
        display:flex;align-items:center;gap:10px;
        flex-shrink:0;
      ">
        <div id="lbPostAuthor" style="font-weight:700;font-size:15px;color:var(--text-primary);">Carregando...</div>
      </div>

      <div id="lbCommentsList" style="
        flex:1;overflow-y:auto;padding:12px 0;
      ">
        <p style="text-align:center;padding:30px;color:var(--text-secondary);font-size:14px;">
          Carregando comentários...
        </p>
      </div>
    </div>
    ` : ''}
  `;

  document.body.appendChild(lb);
  document.body.style.overflow = 'hidden';

  const img = document.getElementById('lbImage');

  function goTo(index) {
    currentIndex = (index + mediaUrls.length) % mediaUrls.length;
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = mediaUrls[currentIndex];
      img.style.opacity = '1';
    }, 120);

    document.querySelectorAll('.lb-dot').forEach((dot, i) => {
      dot.style.width = i === currentIndex ? '18px' : '7px';
      dot.style.background = i === currentIndex ? 'white' : 'rgba(255,255,255,0.4)';
    });
  }

  const closeLb = () => {
    lb.remove();
    document.body.style.overflow = '';
  };

  document.getElementById('lbClose')?.addEventListener('click', closeLb);
  document.getElementById('lbPrev')?.addEventListener('click', () => goTo(currentIndex - 1));
  document.getElementById('lbNext')?.addEventListener('click', () => goTo(currentIndex + 1));

  lb.addEventListener('click', (e) => {
    if (e.target === lb) closeLb();
  });

  document.querySelectorAll('.lb-dot').forEach(dot => {
    dot.addEventListener('click', () => goTo(parseInt(dot.dataset.index)));
  });

  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { closeLb(); document.removeEventListener('keydown', handler); }
    if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
    if (e.key === 'ArrowRight') goTo(currentIndex + 1);
  });

  let touchStartX = 0;
  lb.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
  lb.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(diff > 0 ? currentIndex + 1 : currentIndex - 1);
  });

  if (postId) {
    loadLightboxComments(postId);
  }
}

async function loadLightboxComments(postId) {
  const authorEl = document.getElementById('lbPostAuthor');
  const listEl = document.getElementById('lbCommentsList');

  if (authorEl) {
    authorEl.parentElement.remove();
  }

  if (!listEl) return;

  try {
    const { supabase } = await import('./supabase.js');
    const { getCurrentUser } = await import('./supabase.js');
    const currentUser = await getCurrentUser();

    // ── Busca perfil do usuário logado ──
    let currentProfile = null;
    if (currentUser) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, handle, avatar_url')
        .eq('id', currentUser.id)
        .single();
      currentProfile = profileData;
    }

    // ── Busca post + autor ──
    const { data: post } = await supabase
      .from('posts')
      .select(`content, created_at, author_id, author:profiles(id, name, handle, avatar_url)`)
      .eq('id', postId)
      .single();

    if (!post) {
      listEl.innerHTML = '<p style="text-align:center;padding:20px;color:var(--danger)">Post não encontrado.</p>';
      return;
    }

    const postAuthorId = post.author_id ?? post.author?.id ?? '';

    // ── Busca TODOS os comentários ──
    const { data: allReplies } = await supabase
      .from('replies')
      .select(`*, author:profiles(id, name, handle, avatar_url, is_premium)`)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    // ── Carrega likes de replies do usuário atual ──
    if (!window._lbReplyLikes) window._lbReplyLikes = new Set();
    if (currentProfile && allReplies?.length) {
      const { data: likedReplies } = await supabase
        .from('reply_likes')
        .select('reply_id')
        .eq('user_id', currentProfile.id)
        .in('reply_id', allReplies.map(r => r.id));
      window._lbReplyLikes = new Set((likedReplies || []).map(l => l.reply_id));
    }

    // ── Filtra por visibilidade ──
    const replies = (allReplies || []).filter(r => {
      if (!r.is_private) return true;
      if (!currentProfile) return false;
      return currentProfile.id === postAuthorId || currentProfile.id === r.author?.id;
    });

    // ── Helpers ──
    const getTime = (date) => {
      const diffMin = Math.floor((Date.now() - new Date(date)) / 60000);
      if (diffMin < 1) return 'agora';
      if (diffMin < 60) return `${diffMin}min`;
      if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
      return `${Math.floor(diffMin / 1440)}d`;
    };

    const escLb = (text) => {
      if (!text) return '';
      const d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    };

    const postAvatar = post.author?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;

    // ── HTML do post original no topo ──
    let html = `
      <div style="
        display:flex;gap:12px;padding:18px 16px;
        border-bottom:1px solid var(--border);
      ">
        <img src="${postAvatar}" style="
          width:44px;height:44px;border-radius:50%;
          object-fit:cover;flex-shrink:0;cursor:pointer;
        " class="lb-avatar-click" data-handle="${escLb(post.author?.handle ?? '')}">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="lb-avatar-click" data-handle="${escLb(post.author?.handle ?? '')}" style="
              font-weight:700;font-size:14px;color:var(--text-primary);cursor:pointer;
            ">${escLb(post.author?.name ?? 'Usuário')}</span>
            <span style="font-size:12px;color:var(--text-secondary);">@${escLb(post.author?.handle ?? '')}</span>
            <span style="font-size:11px;color:var(--text-secondary);">· ${getTime(post.created_at)}</span>
          </div>
          ${post.content
            ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.55;color:var(--text-primary);word-break:break-word;">${escLb(post.content)}</p>`
            : `<p style="margin:6px 0 0;font-size:12px;color:var(--text-secondary);font-style:italic;">Sem descrição.</p>`
          }
        </div>
      </div>
    `;

    // ── Composer de novo comentário ──
    const userAvatar = currentProfile?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=anon`;

    html += `
      <div id="lbMainComposer" style="
        display:flex;gap:10px;padding:12px 16px;
        border-bottom:1px solid var(--border);
        background:var(--dark-bg-secondary);
      ">
        <img src="${userAvatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">
        <div style="flex:1;">
          <textarea id="lbMainReplyInput" placeholder="${currentProfile ? 'Adicionar comentário...' : 'Faça login para comentar'}"
            ${!currentProfile ? 'disabled' : ''}
            rows="1" style="
              width:100%;resize:none;background:var(--dark-bg);
              border:1px solid var(--border);border-radius:12px;
              padding:8px 12px;color:var(--text-primary);font-size:13px;
              outline:none;font-family:inherit;box-sizing:border-box;
              transition:border-color 0.2s;
            "
            onfocus="this.style.borderColor='var(--primary)'"
            onblur="this.style.borderColor='var(--border)'"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
           <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);cursor:pointer;">
              <input type="checkbox" class="lb-main-private" style="accent-color:var(--primary);width:14px;height:14px;cursor:pointer;flex-shrink:0;">
              🔒 Só o autor vê
            </label>
            <button id="lbMainSubmit" style="
              background:var(--primary);color:white;border:none;border-radius:16px;
              padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;
              opacity:${currentProfile ? '1' : '0.5'};
            " ${!currentProfile ? 'disabled' : ''}>Comentar</button>
          </div>
        </div>
      </div>
    `;

    // ── Separa raiz e filhos ──
    const raiz = replies.filter(r => !r.parent_reply_id);

    if (raiz.length === 0) {
      html += `
        <div style="text-align:center;padding:40px 20px;">
          <div style="font-size:34px;margin-bottom:10px;opacity:0.4;">💬</div>
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">Nenhum comentário ainda.</p>
        </div>
      `;
    } else {
      // ── Render de cada comentário raiz + seus filhos ──
      const renderReplyItem = (r, isChild = false) => {
        const avatar = r.author?.avatar_url
          || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author?.handle}`;
        const isMe = currentProfile && currentProfile.id === r.author?.id;
        const isLikedR = window._lbReplyLikes?.has(r.id) ?? false;
        const likeCount = r.likes_count ?? 0;

        return `
          <div class="lb-reply-item" data-reply-id="${r.id}" style="
            display:flex;gap:10px;
            padding:${isChild ? '8px 16px 8px 48px' : '12px 16px'};
            border-bottom:1px solid var(--border);
            position:relative;
          ">
            <img src="${avatar}" class="lb-avatar-click" data-handle="${escLb(r.author?.handle ?? '')}"
              style="
                width:${isChild ? '28px' : '34px'};height:${isChild ? '28px' : '34px'};
                border-radius:50%;object-fit:cover;flex-shrink:0;cursor:pointer;
              " loading="lazy">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px;">
                <span class="lb-avatar-click" data-handle="${escLb(r.author?.handle ?? '')}" style="
                  font-weight:700;font-size:${isChild ? '12px' : '13px'};
                  color:var(--text-primary);cursor:pointer;
                ">${escLb(r.author?.name ?? 'Usuário')}</span>
                <span style="font-size:11px;color:var(--text-secondary);">@${escLb(r.author?.handle ?? '')}</span>
                <span style="font-size:10px;color:var(--text-secondary);">· ${getTime(r.created_at)}</span>
                ${r.is_private ? '<span style="font-size:9px;background:var(--primary)22;color:var(--primary);padding:1px 5px;border-radius:6px;font-weight:700;">🔒</span>' : ''}
                ${isMe ? `
                  <button class="lb-delete-reply" data-reply-id="${r.id}" data-is-root="${!r.parent_reply_id}"
                    style="margin-left:auto;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:11px;padding:1px 5px;border-radius:5px;transition:color 0.2s;"
                    onmouseover="this.style.color='var(--danger,#e0245e)'" onmouseout="this.style.color='var(--text-secondary)'">🗑️</button>
                ` : ''}
              </div>
              <p style="
                font-size:${isChild ? '12.5px' : '13px'};color:var(--text-primary);
                line-height:1.5;word-break:break-word;margin:0 0 8px;
              ">${escLb(r.content)}</p>
              <div style="display:flex;gap:2px;align-items:center;">
                <!-- Like -->
                <button class="lb-like-reply" data-reply-id="${r.id}" data-author-id="${r.author?.id ?? ''}" data-liked="${isLikedR}" style="
                  background:none;border:none;cursor:pointer;
                  color:${isLikedR ? 'var(--danger,#e0245e)' : 'var(--text-secondary)'};
                  font-size:12px;display:flex;align-items:center;gap:3px;
                  padding:3px 7px;border-radius:8px;transition:background 0.15s,color 0.15s;
                "
                onmouseover="if(this.dataset.liked!=='true'){this.style.background='rgba(224,36,94,0.12)';this.style.color='var(--danger,#e0245e)';}"
                onmouseout="if(this.dataset.liked!=='true'){this.style.background='none';this.style.color='var(--text-secondary)';}">
                  <span class="lb-like-emoji">${isLikedR ? '❤️' : '🤍'}</span>
                  <span class="lb-like-count" style="font-size:11px;">${likeCount > 0 ? likeCount : ''}</span>
                </button>
                <!-- Responder -->
                <button class="lb-reply-btn" data-reply-id="${r.id}" data-author-handle="${escLb(r.author?.handle ?? '')}" data-author-id="${r.author?.id ?? ''}" style="
                  background:none;border:none;cursor:pointer;
                  color:var(--text-secondary);font-size:12px;
                  display:flex;align-items:center;gap:4px;
                  padding:3px 7px;border-radius:8px;transition:background 0.15s,color 0.15s;
                "
                onmouseover="this.style.background='var(--primary)18';this.style.color='var(--primary)'"
                onmouseout="this.style.background='none';this.style.color='var(--text-secondary)'">
                  💬 <span style="font-size:11px;">Responder</span>
                </button>
              </div>
              <!-- Composer inline para responder este reply (oculto) -->
              <div class="lb-inline-composer" data-for="${r.id}" style="display:none;margin-top:10px;">
                <div style="display:flex;gap:8px;">
                  <img src="${userAvatar}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;flex-shrink:0;">
                  <div style="flex:1;">
                    <textarea class="lb-inline-input" data-parent-id="${r.id}"
                      placeholder="Responder @${escLb(r.author?.handle ?? '')}..."
                      rows="2" style="
                        width:100%;resize:none;background:var(--dark-bg);
                        border:1px solid var(--border);border-radius:10px;
                        padding:7px 10px;color:var(--text-primary);font-size:12px;
                        outline:none;font-family:inherit;box-sizing:border-box;
                        transition:border-color 0.2s;
                      "
                      onfocus="this.style.borderColor='var(--primary)'"
                      onblur="this.style.borderColor='var(--border)'"></textarea>
                    <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:5px;">
                      <button class="lb-inline-cancel" data-for="${r.id}" style="
                        background:none;border:1px solid var(--border);color:var(--text-secondary);
                        border-radius:14px;padding:4px 10px;font-size:11px;cursor:pointer;
                      ">Cancelar</button>
                      <button class="lb-inline-submit" data-parent-id="${r.id}" data-author-id="${r.author?.id ?? ''}" style="
                        background:var(--primary);color:white;border:none;
                        border-radius:14px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;
                      ">Responder</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      };

      // ── Monta HTML: raiz + "mostrar mais" + filhos ──
      raiz.forEach(r => {
        html += `<div class="lb-reply-block" data-root-id="${r.id}">`;
        html += renderReplyItem(r, false);

        const filhos = replies.filter(f => f.parent_reply_id === r.id);
        // busca recursiva de descendentes
        const allDescendants = [];
        const gather = (parentId) => {
          replies.filter(f => f.parent_reply_id === parentId).forEach(c => {
            allDescendants.push(c);
            gather(c.id);
          });
        };
        gather(r.id);

        if (allDescendants.length > 0) {
          html += `
            <button class="lb-toggle-children" data-root-id="${r.id}" style="
              background:none;border:none;cursor:pointer;color:var(--primary);
              font-size:12px;font-weight:700;padding:5px 16px 5px 48px;
              display:flex;align-items:center;gap:4px;
            ">↳ Ver ${allDescendants.length} resposta${allDescendants.length !== 1 ? 's' : ''}</button>
            <div class="lb-children-container" id="lb-children-${r.id}" style="display:none;">
          `;
          allDescendants.forEach(child => {
            html += renderReplyItem(child, true);
          });
          html += `</div>`;
        }

        html += `</div>`;
      });
    }

    listEl.innerHTML = html;

    // ═══════════════════════════════════════════
    // ATTACH EVENT LISTENERS
    // ═══════════════════════════════════════════

    // ── Navegar para perfil ao clicar avatar/nome ──
    listEl.querySelectorAll('.lb-avatar-click').forEach(el => {
      el.addEventListener('click', () => {
        const handle = el.dataset.handle;
        if (!handle) return;
        document.getElementById('mediaLightbox')?.remove();
        document.body.style.overflow = '';
        // Tenta usar a função global do home.js
        if (window.loadProfileByHandle) {
          window.loadProfileByHandle(handle);
        } else {
          // fallback: navega para a página de perfil
          document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
          document.getElementById('profile-page')?.classList.add('active');
          document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
          document.querySelector('.nav-item[data-page="profile"]')?.classList.add('active');
        }
      });
    });

    // ── Toggle mostrar/ocultar filhos ──
    listEl.querySelectorAll('.lb-toggle-children').forEach(btn => {
      btn.addEventListener('click', () => {
        const rootId = btn.dataset.rootId;
        const container = document.getElementById(`lb-children-${rootId}`);
        if (!container) return;
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        const count = container.querySelectorAll('.lb-reply-item').length;
        btn.innerHTML = isHidden
          ? `↑ Ocultar respostas`
          : `↳ Ver ${count} resposta${count !== 1 ? 's' : ''}`;
      });
    });

    // ── Botão responder: abre composer inline ──
    listEl.querySelectorAll('.lb-reply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!currentProfile) {
          showLbNotif('Faça login para comentar! 🔐');
          return;
        }
        const replyId = btn.dataset.replyId;
        // Fecha todos os outros composers abertos
        listEl.querySelectorAll('.lb-inline-composer').forEach(c => {
          c.style.display = 'none';
        });
        const composer = listEl.querySelector(`.lb-inline-composer[data-for="${replyId}"]`);
        if (composer) {
          composer.style.display = 'block';
          composer.querySelector('textarea')?.focus();
        }
      });
    });

    // ── Cancelar resposta inline ──
    listEl.querySelectorAll('.lb-inline-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        const forId = btn.dataset.for;
        const composer = listEl.querySelector(`.lb-inline-composer[data-for="${forId}"]`);
        if (composer) {
          composer.style.display = 'none';
          if (composer.querySelector('textarea')) composer.querySelector('textarea').value = '';
        }
      });
    });

    // ── Enviar resposta inline ──
    listEl.querySelectorAll('.lb-inline-submit').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!currentProfile) { showLbNotif('Faça login para comentar! 🔐'); return; }
        const parentId = btn.dataset.parentId;
        const authorId = btn.dataset.authorId;
        const composer = listEl.querySelector(`.lb-inline-composer[data-for="${parentId}"]`);
        const textarea = composer?.querySelector('textarea');
        const content = textarea?.value?.trim();
        if (!content) return;

        btn.disabled = true;
        btn.textContent = '...';

        try {
          const { addReply } = await import('./posts.js');
          await addReply(postId, content, false, parentId);

          // Notifica autor se diferente do atual
          if (authorId && authorId !== currentProfile.id) {
            try {
              const { createNotification, NOTIF_TYPES } = await import('./notifications.js');
              await createNotification({
                toUserId: authorId,
                actorId: currentProfile.id,
                type: NOTIF_TYPES.REPLY,
                postId,
              });
            } catch (_) {}
          }

          showLbNotif('Resposta enviada! 💬');
          // Recarrega os comentários
          await loadLightboxComments(postId);
        } catch (err) {
          console.error('[lb inline reply]', err);
          showLbNotif('Erro ao enviar resposta.');
          btn.disabled = false;
          btn.textContent = 'Responder';
        }
      });
    });

    // ── Enviar comentário principal ──
    const mainSubmit = document.getElementById('lbMainSubmit');
    const mainInput = document.getElementById('lbMainReplyInput');
   const mainPrivate = listEl.querySelector('.lb-main-private');

    mainSubmit?.addEventListener('click', async () => {
      if (!currentProfile) { showLbNotif('Faça login para comentar! 🔐'); return; }
      const content = mainInput?.value?.trim();
      if (!content) return;

      mainSubmit.disabled = true;
      mainSubmit.textContent = '...';

      try {
        const { addReply } = await import('./posts.js');
        const isPrivate = mainPrivate?.checked ?? false;
        await addReply(postId, content, isPrivate, null);

        // Notifica autor do post
        if (postAuthorId && postAuthorId !== currentProfile.id) {
          try {
            const { createNotification, NOTIF_TYPES } = await import('./notifications.js');
            await createNotification({
              toUserId: postAuthorId,
              actorId: currentProfile.id,
              type: NOTIF_TYPES.REPLY,
              postId,
            });
          } catch (_) {}
        }

        showLbNotif('Comentário enviado! 💬');
        await loadLightboxComments(postId);
      } catch (err) {
        console.error('[lb main reply]', err);
        showLbNotif('Erro ao comentar.');
        mainSubmit.disabled = false;
        mainSubmit.textContent = 'Comentar';
      }
    });

    // Enter no textarea principal
    mainInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        mainSubmit?.click();
      }
    });

    // ── Curtir comentário ──
    listEl.querySelectorAll('.lb-like-reply').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentProfile) { showLbNotif('Faça login para curtir! 🔐'); return; }

        const replyId = btn.dataset.replyId;
        const authorId = btn.dataset.authorId;
        const wasLiked = btn.dataset.liked === 'true';
        const emojiEl = btn.querySelector('.lb-like-emoji');
        const countEl = btn.querySelector('.lb-like-count');
        const currentCount = parseInt(countEl?.textContent || '0') || 0;
        const newLiked = !wasLiked;
        const newCount = Math.max(0, currentCount + (newLiked ? 1 : -1));

        // UI imediata
        btn.dataset.liked = String(newLiked);
        if (emojiEl) emojiEl.textContent = newLiked ? '❤️' : '🤍';
        if (countEl) countEl.textContent = newCount > 0 ? newCount : '';
        btn.style.color = newLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)';
        btn.style.pointerEvents = 'none';

        if (newLiked) window._lbReplyLikes.add(replyId);
        else window._lbReplyLikes.delete(replyId);

        try {
          if (newLiked) {
            const { error } = await supabase
              .from('reply_likes')
              .insert({ reply_id: replyId, user_id: currentProfile.id });
            if (error && error.code !== '23505') throw error;
            await supabase.rpc('increment_reply_likes', { reply_id: replyId });

            if (authorId && authorId !== currentProfile.id) {
              try {
                const { createNotification, NOTIF_TYPES } = await import('./notifications.js');
                await createNotification({
                  toUserId: authorId,
                  actorId: currentProfile.id,
                  type: NOTIF_TYPES.REPLY_LIKE ?? 'reply_like',
                  postId,
                  replyId,
                });
              } catch (_) {}
            }
          } else {
            const { error } = await supabase
              .from('reply_likes')
              .delete()
              .eq('reply_id', replyId)
              .eq('user_id', currentProfile.id);
            if (error) throw error;
            await supabase.rpc('decrement_reply_likes', { reply_id: replyId });
          }
        } catch (err) {
          // Reverte
          btn.dataset.liked = String(wasLiked);
          if (emojiEl) emojiEl.textContent = wasLiked ? '❤️' : '🤍';
          if (countEl) countEl.textContent = currentCount > 0 ? currentCount : '';
          btn.style.color = wasLiked ? 'var(--danger,#e0245e)' : 'var(--text-secondary)';
          if (wasLiked) window._lbReplyLikes.add(replyId);
          else window._lbReplyLikes.delete(replyId);
          console.error('[lb reply like]', err);
        } finally {
          btn.style.pointerEvents = '';
        }
      });
    });

    // ── Deletar comentário ──
    listEl.querySelectorAll('.lb-delete-reply').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Apagar este comentário?')) return;

        const replyId = btn.dataset.replyId;
        const isRoot = btn.dataset.isRoot === 'true';
        btn.disabled = true;

        try {
          const { error } = await supabase.from('replies').delete().eq('id', replyId);
          if (error) throw error;

          if (isRoot) {
            await supabase.rpc('decrement_replies', { post_id: postId });
            // Atualiza contadores no feed se existir
            document.querySelectorAll(`.reply-action[data-post-id="${postId}"] .reply-count`).forEach(el => {
              el.textContent = Math.max(0, parseInt(el.textContent || '0') - 1);
            });
          }

          showLbNotif('Comentário apagado 🗑️');
          await loadLightboxComments(postId);
        } catch (err) {
          console.error('[lb delete reply]', err);
          showLbNotif('Erro ao apagar.');
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error('[lbComments]', err);
    if (listEl) {
      listEl.innerHTML = `<p style="text-align:center;padding:20px;color:var(--danger);">Erro ao carregar.</p>`;
    }
  }
}

// ── Mini notificação dentro do lightbox ──
function showLbNotif(msg) {
  document.querySelector('.lb-notif')?.remove();
  const n = document.createElement('div');
  n.className = 'lb-notif';
  n.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--primary);color:white;padding:9px 18px;
    border-radius:20px;font-size:13px;font-weight:600;
    z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);
    animation:slideDown 0.25s ease;white-space:nowrap;
  `;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.opacity = '0';
    n.style.transition = 'opacity 0.3s';
    setTimeout(() => n.remove(), 300);
  }, 2800);
}
function escapeHtmlLocal(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// ATTACHES LISTENERS para fotos clicáveis nos posts
// ============================================================
export function attachMediaListeners(container, signal) {
  container.querySelectorAll('.media-photo').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const urls = JSON.parse(decodeURIComponent(img.dataset.mediaUrls || '[]'));
        const index = parseInt(img.dataset.index || '0');
        // Pega o postId do card pai
        const postCard = img.closest('[data-post-id]');
        const postId = postCard?.dataset?.postId ?? null;
        if (urls.length) openMediaLightbox(urls, index, postId);
      } catch (_) {}
    }, { signal });
  });
}

// ============================================================
// GRID DE MÍDIA DO PERFIL (aba "Mídia")
// ============================================================
export function renderProfileMediaGrid(posts, containerElement) {
  if (!posts?.length) {
    containerElement.innerHTML = `
      <p style="padding:40px;text-align:center;color:var(--text-secondary);">
        Nenhuma foto publicada ainda. 📷
      </p>`;
    return;
  }

  if (!posts.some(p => p.media_urls?.length)) {
    containerElement.innerHTML = `
      <p style="padding:40px;text-align:center;color:var(--text-secondary);">
        Nenhuma foto encontrada. 📷
      </p>`;
    return;
  }

  containerElement.innerHTML = posts.map(post => {
    if (!post.media_urls?.length) return '';

    const avatar = post.author?.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;

    const diffMin = Math.floor((Date.now() - new Date(post.created_at)) / 60000);
    const timeStr = diffMin < 1 ? 'agora' : diffMin < 60 ? `${diffMin}min atrás`
      : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h atrás` : `${Math.floor(diffMin / 1440)}d atrás`;

    const imagens = post.media_urls.slice(0, 4);
    const count = imagens.length;
    const gridConfig = {
      1: { cols: '1fr',     rows: 'auto' },
      2: { cols: '1fr 1fr', rows: '180px' },
      3: { cols: '1fr 1fr', rows: '140px 140px' },
      4: { cols: '1fr 1fr', rows: '140px 140px' },
    };
    const cfg = gridConfig[count];

    const fotosHTML = imagens.map((url, i) => {
      const isFirstOf3 = i === 0 && count === 3;
      return `
        <div style="
          position:relative;overflow:hidden;
          ${isFirstOf3 ? 'grid-row: span 2;' : ''}
          background:#000;
        ">
          <img
            src="${url}"
            loading="lazy"
            class="media-photo"
            data-media-urls="${encodeURIComponent(JSON.stringify(post.media_urls))}"
            data-index="${i}"
            data-post-id="${post.id}"
            style="width:100%;height:100%;object-fit:cover;cursor:pointer;display:block;transition:opacity 0.2s;"
            onmouseover="this.style.opacity='0.85'"
            onmouseout="this.style.opacity='1'"
          >
          ${i === count - 1 && post.media_urls.length > 4 ? `
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);
              display:flex;align-items:center;justify-content:center;
              font-size:22px;font-weight:800;color:white;pointer-events:none;">
              +${post.media_urls.length - 4}
            </div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="media-post-card" data-post-id="${post.id}" style="
        background:var(--dark-bg-secondary);
        border:1px solid var(--border);
        border-radius:16px;
        overflow:hidden;
        margin-bottom:16px;
        cursor:pointer;
        transition:border-color 0.2s;
      "
      onmouseover="this.style.borderColor='var(--primary)'"
      onmouseout="this.style.borderColor='var(--border)'">

        <!-- Cabeçalho do post -->
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;">
          <img src="${avatar}"
            style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${post.author?.name ?? 'Usuário'}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);">
              @${post.author?.handle ?? ''} · ${timeStr}
            </div>
          </div>
        </div>

        <!-- Texto do post (se houver) -->
        ${post.content ? `
          <div style="padding:0 16px 12px;font-size:14px;color:var(--text-primary);
            line-height:1.5;word-break:break-word;
            display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
            ${post.content}
          </div>` : ''}

        <!-- Grade de fotos -->
        <div style="
          display:grid;
          grid-template-columns:${cfg.cols};
          grid-template-rows:${cfg.rows};
          gap:2px;
          max-height:320px;
        ">
          ${fotosHTML}
        </div>

        <!-- Rodapé com contagens -->
        <div style="display:flex;gap:16px;padding:10px 16px;
          border-top:1px solid var(--border);color:var(--text-secondary);font-size:13px;">
          <span>❤️ ${post.likes_count || 0}</span>
          <span>💬 ${post.replies_count || 0}</span>
          <span>🔁 ${post.reposts_count || 0}</span>
        </div>

      </div>`;
  }).join('');

  // Clique no card abre o modal do post
  containerElement.querySelectorAll('.media-post-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.media-photo')) return;
      const postId = card.dataset.postId;
      if (postId && window.renderPostPage) window.renderPostPage(postId);
    });
  });

  // Clique na foto abre o lightbox
  containerElement.querySelectorAll('.media-photo').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        const urls = JSON.parse(decodeURIComponent(img.dataset.mediaUrls || '[]'));
        const index = parseInt(img.dataset.index || '0');
        const postId = img.dataset.postId ?? null;
        if (urls.length) openMediaLightbox(urls, index, postId);
      } catch (_) {}
    });
  });
}

// ============================================================
// BOTÃO DE UPLOAD para a toolbar do composer (retorna HTML)
// ============================================================
export function createMediaUploadBtnHTML() {
  return `<button class="toolbar-btn media-upload-btn" title="Adicionar foto" type="button">🖼</button>`;
}
