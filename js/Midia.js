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
      author:profiles!posts_user_id_fkey(id, name, handle, avatar_url)
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

    <!-- Lado esquerdo: imagem -->
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

    <!-- Lado direito: comentários -->
    ${postId ? `
    <div id="lbComments" style="
      width:380px;
      flex-shrink:0;
      background:var(--dark-bg-secondary, #1a1a2e);
      border-left:1px solid rgba(255,255,255,0.08);
      display:flex;flex-direction:column;
      overflow:hidden;
    ">
      <div style="
        padding:16px 20px;
        border-bottom:1px solid rgba(255,255,255,0.08);
        display:flex;align-items:center;gap:10px;
        flex-shrink:0;
      ">
        <div id="lbPostAuthor" style="font-weight:700;font-size:15px;color:white;">Carregando...</div>
      </div>

      <div id="lbCommentsList" style="
        flex:1;overflow-y:auto;padding:12px 0;
      ">
        <p style="text-align:center;padding:30px;color:rgba(255,255,255,0.4);font-size:14px;">
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

  // Carrega autor e comentários se tiver postId
  if (postId) {
    loadLightboxComments(postId);
  }
}

async function loadLightboxComments(postId) {
  const authorEl = document.getElementById('lbPostAuthor');
  const listEl = document.getElementById('lbCommentsList');

  // REMOVE HEADER ANTIGO
  if (authorEl) {
    authorEl.parentElement.remove();
  }

  if (!listEl) return;

  try {
    const { supabase } = await import('./supabase.js');

    // Busca post + autor
    const { data: post } = await supabase
      .from('posts')
      .select(`
        content,
        created_at,
        author:profiles(name, handle, avatar_url)
      `)
      .eq('id', postId)
      .single();

    // Busca comentários
    const { data: replies } = await supabase
      .from('replies')
      .select(`
        content,
        created_at,
        is_private,
        author:profiles(name, handle, avatar_url)
      `)
      .eq('post_id', postId)
      .eq('is_private', false)
      .order('created_at', { ascending: true })
      .limit(50);

    const postAvatar =
      post?.author?.avatar_url ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.handle}`;

    const getTime = (date) => {
      const diffMin = Math.floor(
        (Date.now() - new Date(date)) / 60000
      );

      if (diffMin < 1) return 'agora';
      if (diffMin < 60) return `${diffMin}min`;
      if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;

      return `${Math.floor(diffMin / 1440)}d`;
    };

    let html = '';

    // POST ORIGINAL COMO PRIMEIRO "COMENTÁRIO"
    html += `
      <div style="
        display:flex;
        gap:12px;
        padding:18px 16px;
        border-bottom:1px solid rgba(255,255,255,0.06);
      ">

        <img src="${postAvatar}" style="
          width:48px;
          height:48px;
          border-radius:50%;
          object-fit:cover;
          flex-shrink:0;
        ">

        <div style="
          flex:1;
          min-width:0;
        ">

          <div style="
            display:flex;
            align-items:center;
            gap:6px;
            flex-wrap:wrap;
          ">

            <span style="
              font-weight:700;
              font-size:24px;
              color:white;
            ">
              ${escapeHtmlLocal(post.author?.name ?? 'Usuário')}
            </span>

            <span style="
              font-size:20px;
              color:rgba(255,255,255,0.45);
            ">
              @${escapeHtmlLocal(post.author?.handle ?? '')}
            </span>

            <span style="
              font-size:16px;
              color:rgba(255,255,255,0.25);
            ">
              • ${getTime(post.created_at)}
            </span>

          </div>

          ${
            post?.content
              ? `
                <p style="
                  margin:6px 0 0;
                  font-size:18px;
                  line-height:1.6;
                  color:rgba(255,255,255,0.92);
                  word-break:break-word;
                ">
                  ${escapeHtmlLocal(post.content)}
                </p>
              `
              : `
                <p style="
                  margin:6px 0 0;
                  font-size:13px;
                  color:rgba(255,255,255,0.35);
                  font-style:italic;
                ">
                  Sem descrição.
                </p>
              `
          }

        </div>

      </div>
    `;

    // SEM COMENTÁRIOS
    if (!replies || replies.length === 0) {
      html += `
        <div style="
          text-align:center;
          padding:45px 20px;
        ">
          <div style="
            font-size:38px;
            margin-bottom:12px;
            opacity:0.4;
          ">
            💬
          </div>

          <p style="
            font-size:14px;
            color:rgba(255,255,255,0.4);
            margin:0;
          ">
            Nenhum comentário ainda.
          </p>
        </div>
      `;

      listEl.innerHTML = html;
      return;
    }

    // COMENTÁRIOS
    html += replies.map(r => {

      const avatar =
        r.author?.avatar_url ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author?.handle}`;

      return `
        <div style="
          display:flex;
          gap:12px;
          padding:14px 16px;
        ">

          <img src="${avatar}" style="
            width:34px;
            height:34px;
            border-radius:50%;
            object-fit:cover;
            flex-shrink:0;
            margin-top:2px;
          " loading="lazy">

          <div style="
            flex:1;
            min-width:0;
          ">

            <div style="
              display:flex;
              align-items:center;
              gap:6px;
              flex-wrap:wrap;
            ">

              <span style="
                font-weight:700;
                font-size:13px;
                color:white;
              ">
                ${escapeHtmlLocal(r.author?.name ?? 'Usuário')}
              </span>

              <span style="
                font-size:11px;
                color:rgba(255,255,255,0.4);
              ">
                @${escapeHtmlLocal(r.author?.handle ?? '')}
              </span>

              <span style="
                font-size:11px;
                color:rgba(255,255,255,0.25);
              ">
                • ${getTime(r.created_at)}
              </span>

            </div>

            <p style="
              margin:4px 0 0;
              font-size:13px;
              line-height:1.6;
              color:rgba(255,255,255,0.82);
              word-break:break-word;
            ">
              ${escapeHtmlLocal(r.content)}
            </p>

          </div>

        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.scrollTop = 0;

  } catch (err) {
    console.error('[lbComments]', err);

    if (listEl) {
      listEl.innerHTML = `
        <p style="
          text-align:center;
          padding:20px;
          color:rgba(255,0,0,0.6);
        ">
          Erro ao carregar.
        </p>
      `;
    }
  }
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

  // Coleta todas as mídias com referência ao post
  const allMedia = [];
  posts.forEach(post => {
    (post.media_urls || []).forEach(url => {
      allMedia.push({ url, post });
    });
  });

  if (!allMedia.length) {
    containerElement.innerHTML = `
      <p style="padding:40px;text-align:center;color:var(--text-secondary);">
        Nenhuma foto encontrada. 📷
      </p>`;
    return;
  }

  containerElement.innerHTML = `
    <div style="
      display:grid;
      grid-template-columns:repeat(3, 1fr);
      gap:3px;padding:3px;
    ">
      ${allMedia.map((item, i) => `
        <div style="
          position:relative;
          aspect-ratio:1;
          overflow:hidden;
          background:var(--dark-bg-secondary);
          cursor:pointer;
        "
        class="profile-media-item"
        data-all-urls="${encodeURIComponent(JSON.stringify(allMedia.map(m => m.url)))}"
        data-index="${i}"
        >
          <img
            src="${item.url}"
            loading="lazy"
            style="
              width:100%;height:100%;
              object-fit:cover;
              transition:transform 0.3s,opacity 0.2s;
            "
            onmouseover="this.style.transform='scale(1.04)';this.style.opacity='0.85'"
            onmouseout="this.style.transform='scale(1)';this.style.opacity='1'"
          >
        </div>
      `).join('')}
    </div>
  `;

  containerElement.querySelectorAll('.profile-media-item').forEach(item => {
    item.addEventListener('click', () => {
      try {
        const urls = JSON.parse(decodeURIComponent(item.dataset.allUrls || '[]'));
        const index = parseInt(item.dataset.index || '0');
        openMediaLightbox(urls, index);
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
