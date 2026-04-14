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

  const gridStyles = {
    1: 'grid-template-columns:1fr;',
    2: 'grid-template-columns:1fr 1fr;',
    3: 'grid-template-columns:1fr 1fr;grid-template-rows:auto auto;',
    4: 'grid-template-columns:1fr 1fr;grid-template-rows:auto auto;',
  };

  const imgStyle = 'width:100%;height:200px;object-fit:cover;cursor:pointer;transition:opacity 0.2s;';
  const firstImgStyle = count === 3 ? 'width:100%;height:100%;object-fit:cover;cursor:pointer;transition:opacity 0.2s;' : imgStyle;

  let innerHTML = '';
  urls.forEach((url, i) => {
    const isFirst = i === 0 && count === 3;
    const spanStyle = isFirst ? 'grid-row:span 2;' : '';
    const isLast = i === count - 1 && mediaUrls.length > 4;

    innerHTML += `
      <div style="
        position:relative;overflow:hidden;border-radius:0;
        ${spanStyle}
      " data-media-index="${i}" data-post-id="${postId}">
        <img
          src="${url}"
          style="${isFirst ? firstImgStyle : imgStyle}"
          loading="lazy"
          onmouseover="this.style.opacity='0.85'"
          onmouseout="this.style.opacity='1'"
          class="media-photo"
          data-media-urls="${encodeURIComponent(JSON.stringify(mediaUrls))}"
          data-index="${i}"
        >
        ${isLast ? `
          <div style="
            position:absolute;inset:0;
            background:rgba(0,0,0,0.55);
            display:flex;align-items:center;justify-content:center;
            font-size:22px;font-weight:700;color:white;
            cursor:pointer;pointer-events:none;
          ">+${mediaUrls.length - 4}</div>
        ` : ''}
      </div>
    `;
  });

  return `
    <div class="media-grid" style="
      display:grid;${gridStyles[count]}
      gap:3px;margin-top:10px;
      border-radius:12px;overflow:hidden;
      border:1px solid var(--border);
    ">
      ${innerHTML}
    </div>
  `;
}

// ============================================================
// LIGHTBOX — visualizador de foto em tela cheia
// ============================================================
export function openMediaLightbox(mediaUrls, startIndex = 0) {
  document.getElementById('mediaLightbox')?.remove();

  let currentIndex = startIndex;

  const lb = document.createElement('div');
  lb.id = 'mediaLightbox';
  lb.style.cssText = `
    position:fixed;inset:0;z-index:5000;
    background:rgba(0,0,0,0.92);
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    padding:20px;
    backdrop-filter:blur(8px);
  `;

  lb.innerHTML = `
    <button id="lbClose" style="
      position:fixed;top:16px;right:20px;
      background:rgba(255,255,255,0.12);color:white;
      border:none;border-radius:50%;
      width:36px;height:36px;font-size:18px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
    ">✕</button>

    ${mediaUrls.length > 1 ? `
      <button id="lbPrev" style="
        position:fixed;left:16px;top:50%;transform:translateY(-50%);
        background:rgba(255,255,255,0.12);color:white;
        border:none;border-radius:50%;
        width:40px;height:40px;font-size:20px;
        cursor:pointer;display:flex;align-items:center;justify-content:center;
      ">‹</button>
      <button id="lbNext" style="
        position:fixed;right:16px;top:50%;transform:translateY(-50%);
        background:rgba(255,255,255,0.12);color:white;
        border:none;border-radius:50%;
        width:40px;height:40px;font-size:20px;
        cursor:pointer;display:flex;align-items:center;justify-content:center;
      ">›</button>
    ` : ''}

    <img id="lbImage" src="${mediaUrls[currentIndex]}"
      style="
        max-width:92vw;max-height:86vh;
        border-radius:12px;object-fit:contain;
        transition:opacity 0.18s;
      ">

    ${mediaUrls.length > 1 ? `
      <div id="lbDots" style="
        display:flex;gap:6px;margin-top:14px;
      ">
        ${mediaUrls.map((_, i) => `
          <div class="lb-dot" data-index="${i}" style="
            width:${i === currentIndex ? '18px' : '7px'};height:7px;
            border-radius:4px;
            background:${i === currentIndex ? 'white' : 'rgba(255,255,255,0.35)'};
            cursor:pointer;transition:all 0.2s;
          "></div>
        `).join('')}
      </div>
    ` : ''}

    <p id="lbCounter" style="
      color:rgba(255,255,255,0.5);font-size:13px;margin-top:8px;
    ">${mediaUrls.length > 1 ? `${currentIndex + 1} / ${mediaUrls.length}` : ''}</p>
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
      dot.style.background = i === currentIndex ? 'white' : 'rgba(255,255,255,0.35)';
    });

    const counter = document.getElementById('lbCounter');
    if (counter) counter.textContent = mediaUrls.length > 1 ? `${currentIndex + 1} / ${mediaUrls.length}` : '';
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

  // Swipe touch
  let touchStartX = 0;
  lb.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
  lb.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(diff > 0 ? currentIndex + 1 : currentIndex - 1);
  });
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
        if (urls.length) openMediaLightbox(urls, index);
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
