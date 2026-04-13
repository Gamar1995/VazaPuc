// ============================================================
// js/reposts.js — Sistema de Reposts (retweet/quote post)
// ============================================================

import { supabase, getCurrentUser } from './supabase.js';

// ============================================================
// CRIAR REPOST SIMPLES (compartilhamento direto sem comentário)
// ============================================================
export async function repostPost(originalPostId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  // Verifica se já repostou
  const { data: existing } = await supabase
    .from('reposts')
    .select('id')
    .eq('user_id', user.id)
    .eq('original_post_id', originalPostId)
    .maybeSingle();

  if (existing) throw new Error('ALREADY_REPOSTED');

  const { data, error } = await supabase
    .from('reposts')
    .insert({ user_id: user.id, original_post_id: originalPostId })
    .select()
    .single();

  if (error) throw error;

  // Incrementa contador no post original
  await supabase.rpc('increment_reposts_count', { post_id: originalPostId });

  return data;
}

// ============================================================
// DESFAZER REPOST
// ============================================================
export async function undoRepost(originalPostId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase
    .from('reposts')
    .delete()
    .eq('user_id', user.id)
    .eq('original_post_id', originalPostId);

  if (error) throw error;

  await supabase.rpc('decrement_reposts_count', { post_id: originalPostId });
}

// ============================================================
// QUOTE POST (repost com comentário do usuário)
// ============================================================
export async function quotePost(originalPostId, quoteContent) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Não autenticado');

  if (!quoteContent?.trim()) throw new Error('Comentário não pode ser vazio');

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      content: quoteContent.trim(),
      quoted_post_id: originalPostId,
      is_quote: true,
    })
    .select()
    .single();

  if (error) throw error;

  await supabase.rpc('increment_reposts_count', { post_id: originalPostId });

  return data;
}

// ============================================================
// VERIFICA SE O USUÁRIO JÁ REPOSTOU
// ============================================================
export async function hasReposted(postId) {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data } = await supabase
    .from('reposts')
    .select('id')
    .eq('user_id', user.id)
    .eq('original_post_id', postId)
    .maybeSingle();

  return !!data;
}

// ============================================================
// BUSCA IDs de posts repostados pelo usuário (para UI)
// ============================================================
export async function getRepostedPostIds(postIds) {
  const user = await getCurrentUser();
  if (!user || !postIds?.length) return new Set();

  const { data } = await supabase
    .from('reposts')
    .select('original_post_id')
    .eq('user_id', user.id)
    .in('original_post_id', postIds);

  return new Set((data || []).map(r => r.original_post_id));
}

// ============================================================
// BUSCA O POST ORIGINAL PARA RENDERIZAR O QUOTE CARD
// ============================================================
export async function getOriginalPost(postId) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, content, created_at, likes_count, replies_count, reposts_count,
      media_urls,
      author:profiles!posts_user_id_fkey(id, name, handle, avatar_url)
    `)
    .eq('id', postId)
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// HTML DO QUOTE CARD (renderizado dentro do post que cita)
// ============================================================
export function createQuoteCardHTML(originalPost) {
  if (!originalPost) return '';

  const avatar = originalPost.author?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${originalPost.author?.handle}`;

  const mediaPreview = originalPost.media_urls?.length
    ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
        ${originalPost.media_urls.slice(0, 2).map(url =>
          `<img src="${url}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">`
        ).join('')}
       </div>`
    : '';

  return `
    <div class="quote-card" data-quoted-post-id="${originalPost.id}" style="
      margin-top:10px;
      border:1px solid var(--border);
      border-radius:12px;
      padding:10px 14px;
      cursor:pointer;
      background:var(--dark-bg);
      transition:background 0.2s;
    " onmouseover="this.style.background='var(--dark-bg-secondary)'"
       onmouseout="this.style.background='var(--dark-bg)'">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <img src="${avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">
        <span style="font-weight:700;font-size:13px;color:var(--text-primary);">
          ${escapeHtml(originalPost.author?.name ?? 'Usuário')}
        </span>
        <span style="color:var(--text-secondary);font-size:12px;">
          @${escapeHtml(originalPost.author?.handle ?? '')}
        </span>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.4;
                display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
        ${escapeHtml(originalPost.content ?? '')}
      </p>
      ${mediaPreview}
    </div>
  `;
}

// ============================================================
// MODAL DE QUOTE POST (abre ao clicar em "Citar")
// ============================================================
export function openQuoteModal(originalPost, onSubmit) {
  document.getElementById('quotePostModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'quotePostModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:4000;
    background:rgba(0,0,0,0.7);
    display:flex;align-items:center;justify-content:center;
    padding:20px;backdrop-filter:blur(4px);
  `;

  const authorAvatar = originalPost.author?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${originalPost.author?.handle}`;

  const mediaThumb = originalPost.media_urls?.length
    ? `<div style="margin-top:6px;display:flex;gap:4px;">
        ${originalPost.media_urls.slice(0, 2).map(url =>
          `<img src="${url}" style="width:70px;height:52px;object-fit:cover;border-radius:6px;">`
        ).join('')}
       </div>`
    : '';

  modal.innerHTML = `
    <div style="
      background:var(--dark-bg-secondary);
      border:1px solid var(--border);
      border-radius:16px;
      width:100%;max-width:560px;
      padding:20px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);">Citar Post</h3>
        <button id="closeQuoteModal" style="
          background:none;border:none;color:var(--text-secondary);
          font-size:20px;cursor:pointer;padding:2px 8px;border-radius:50%;
        ">✕</button>
      </div>

      <textarea id="quoteInput" placeholder="Adicione um comentário..." rows="3" style="
        width:100%;resize:none;
        background:var(--dark-bg);border:1px solid var(--border);
        border-radius:12px;padding:12px;color:var(--text-primary);
        font-size:15px;outline:none;font-family:inherit;margin-bottom:12px;
        box-sizing:border-box;
      "></textarea>

      <div style="
        border:1px solid var(--border);border-radius:12px;
        padding:10px 14px;background:var(--dark-bg);
      ">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <img src="${authorAvatar}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;">
          <span style="font-weight:700;font-size:13px;color:var(--text-primary);">
            ${escapeHtml(originalPost.author?.name ?? 'Usuário')}
          </span>
          <span style="color:var(--text-secondary);font-size:12px;">
            @${escapeHtml(originalPost.author?.handle ?? '')}
          </span>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.4;
                  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
          ${escapeHtml(originalPost.content ?? '')}
        </p>
        ${mediaThumb}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
        <button id="cancelQuoteBtn" style="
          background:none;border:1px solid var(--border);
          color:var(--text-primary);padding:8px 18px;
          border-radius:20px;cursor:pointer;font-size:14px;
        ">Cancelar</button>
        <button id="submitQuoteBtn" style="
          background:var(--primary);color:white;border:none;
          padding:8px 22px;border-radius:20px;cursor:pointer;
          font-size:14px;font-weight:600;
        ">Citar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  document.getElementById('closeQuoteModal').addEventListener('click', closeModal);
  document.getElementById('cancelQuoteBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  const submitBtn = document.getElementById('submitQuoteBtn');
  submitBtn.addEventListener('click', async () => {
    const content = document.getElementById('quoteInput').value.trim();
    if (!content) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    try {
      await onSubmit(content);
      closeModal();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Citar';
    }
  });

  document.getElementById('quoteInput').focus();
}

// ============================================================
// BOTÃO DE REPOST — HTML (para usar no createPostHTML do home.js)
// ============================================================
export function createRepostButtonHTML(post, isReposted) {
  return `
    <button class="post-action repost-action ${isReposted ? 'reposted' : ''}"
      title="Republicar"
      data-post-id="${post.id}"
      data-author-id="${post.author?.id ?? ''}"
      data-reposted="${isReposted}"
      style="
        background:none;border:none;cursor:pointer;
        display:flex;align-items:center;gap:4px;
        color:${isReposted ? 'var(--success, #17bf63)' : 'inherit'};
        font-size:inherit;padding:4px 8px;
        transition:color 0.2s;
      ">
      🔁 <span class="repost-count">${post.reposts_count ?? 0}</span>
    </button>
  `;
}

// ============================================================
// HANDLER DO BOTÃO DE REPOST (chame no attachPostEventListeners)
// ============================================================
export function attachRepostListeners(container, currentProfile, signal, callbacks = {}) {
  container.querySelectorAll('.repost-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (!currentProfile) {
        callbacks.showNotification?.('Faça login para republicar! 🚀');
        return;
      }

      const postId = btn.dataset.postId;
      const authorId = btn.dataset.authorId;
      const wasReposted = btn.dataset.reposted === 'true';

      // Menu de opções: Repost simples vs Citar
      showRepostMenu(btn, postId, authorId, wasReposted, currentProfile, callbacks);
    }, { signal });
  });
}

// ============================================================
// MENU FLUTUANTE DE REPOST (repost simples ou citar)
// ============================================================
function showRepostMenu(triggerBtn, postId, authorId, wasReposted, currentProfile, callbacks) {
  document.getElementById('repostFloatingMenu')?.remove();

  const rect = triggerBtn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'repostFloatingMenu';
  menu.style.cssText = `
    position:fixed;
    top:${rect.bottom + 4}px;
    left:${Math.min(rect.left, window.innerWidth - 220)}px;
    z-index:9999;
    background:var(--dark-bg-secondary);
    border:1px solid var(--border);
    border-radius:12px;
    min-width:200px;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    overflow:hidden;
  `;

  if (wasReposted) {
    menu.innerHTML = `
      <button class="rm-undo" style="display:block;width:100%;text-align:left;padding:12px 16px;
        background:none;border:none;cursor:pointer;color:var(--danger,#e0245e);font-size:14px;">
        🔁 Desfazer Repost
      </button>
    `;
  } else {
    menu.innerHTML = `
      <button class="rm-repost" style="display:block;width:100%;text-align:left;padding:12px 16px;
        background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:14px;">
        🔁 Repostar
      </button>
      <button class="rm-quote" style="display:block;width:100%;text-align:left;padding:12px 16px;
        background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:14px;">
        ✏️ Citar Post
      </button>
    `;
  }

  document.body.appendChild(menu);

  menu.querySelectorAll('button').forEach(b => {
    b.addEventListener('mouseenter', () => b.style.background = 'var(--border)');
    b.addEventListener('mouseleave', () => b.style.background = 'none');
  });

  const closeMenu = () => menu.remove();
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);

  // REPOST SIMPLES
  menu.querySelector('.rm-repost')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenu();

    const allBtns = document.querySelectorAll(`.repost-action[data-post-id="${postId}"]`);
    allBtns.forEach(b => {
      b.dataset.reposted = 'true';
      b.style.color = 'var(--success, #17bf63)';
      const c = b.querySelector('.repost-count');
      if (c) c.textContent = parseInt(c.textContent || '0') + 1;
    });

    try {
      await repostPost(postId);
      callbacks.showNotification?.('Post republicado! 🔁');

      if (authorId && authorId !== currentProfile.id) {
        callbacks.createNotification?.({
          toUserId: authorId,
          actorId: currentProfile.id,
          type: 'REPOST',
          postId,
        });
      }
    } catch (err) {
      if (err?.message === 'ALREADY_REPOSTED') {
        callbacks.showNotification?.('Você já repostou este post.');
        return;
      }
      // Reverte
      allBtns.forEach(b => {
        b.dataset.reposted = 'false';
        b.style.color = '';
        const c = b.querySelector('.repost-count');
        if (c) c.textContent = Math.max(0, parseInt(c.textContent || '0') - 1);
      });
      callbacks.showNotification?.('Erro ao repostar. Tente novamente.');
    }
  });

  // DESFAZER REPOST
  menu.querySelector('.rm-undo')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenu();

    const allBtns = document.querySelectorAll(`.repost-action[data-post-id="${postId}"]`);
    allBtns.forEach(b => {
      b.dataset.reposted = 'false';
      b.style.color = '';
      const c = b.querySelector('.repost-count');
      if (c) c.textContent = Math.max(0, parseInt(c.textContent || '0') - 1);
    });

    try {
      await undoRepost(postId);
      callbacks.showNotification?.('Repost desfeito.');
    } catch (err) {
      // Reverte
      allBtns.forEach(b => {
        b.dataset.reposted = 'true';
        b.style.color = 'var(--success, #17bf63)';
        const c = b.querySelector('.repost-count');
        if (c) c.textContent = parseInt(c.textContent || '0') + 1;
      });
      callbacks.showNotification?.('Erro ao desfazer repost.');
    }
  });

  // CITAR POST
  menu.querySelector('.rm-quote')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeMenu();

    try {
      const originalPost = await getOriginalPost(postId);
      openQuoteModal(originalPost, async (quoteContent) => {
        await quotePost(postId, quoteContent);
        callbacks.showNotification?.('Post citado com sucesso! ✏️');

        // Atualiza contador
        const allBtns = document.querySelectorAll(`.repost-action[data-post-id="${postId}"]`);
        allBtns.forEach(b => {
          const c = b.querySelector('.repost-count');
          if (c) c.textContent = parseInt(c.textContent || '0') + 1;
        });

        if (authorId && authorId !== currentProfile.id) {
          callbacks.createNotification?.({
            toUserId: authorId,
            actorId: currentProfile.id,
            type: 'REPOST',
            postId,
          });
        }

        callbacks.prependPost?.();
      });
    } catch (err) {
      callbacks.showNotification?.('Erro ao carregar post. Tente novamente.');
    }
  });
}



// Utilitário interno
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}