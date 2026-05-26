import { supabase, getCurrentUser } from './supabase.js';

/**
 * Envia um novo Flash para o Storage e salva no Banco de Dados
 */
export async function createFlash(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Você precisa estar logado.');

  const fileExt = file.name.split('.').pop();
  const fileName = `${user.id}/${Date.now()}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from('flashes-media')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('flashes-media')
    .getPublicUrl(fileName);

  const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

  const { data: flash, error: flashError } = await supabase
    .from('flashes')
    .insert({
      user_id: user.id,
      media_url: publicUrl,
      media_type: mediaType
    })
    .select()
    .single();

  if (flashError) throw flashError;
  return flash;
}

/**
 * Republica o Flash de outro aluno
 */
export async function repostFlash(originalFlashId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Você precisa estar logado.');

  const { data: original } = await supabase
    .from('flashes')
    .select('*')
    .eq('id', originalFlashId)
    .single();

  if (!original) throw new Error('Flash original não encontrado.');

  const { data: repost, error } = await supabase
    .from('flashes')
    .insert({
      user_id: user.id,
      media_url: original.media_url,
      media_type: original.media_type,
      original_flash_id: original.id
    })
    .select()
    .single();

  if (error) throw error;
  return repost;
}

/**
 * Registra a visualização (Modo Ghost nativo se for Premium)
 */
export async function viewFlash(flashId) {
  const user = await getCurrentUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_premium')
    .eq('id', user.id)
    .single();

  const isAnonymous = profile?.is_premium ?? false;

  await supabase
    .from('flash_views')
    .upsert({
      flash_id: flashId,
      viewer_id: user.id,
      is_anonymous: isAnonymous
    }, { onConflict: 'flash_id,viewer_id' });
}

/**
 * Busca Flashes válidos (últimas 24 horas) de um perfil
 */
export async function getActiveFlashesByUser(userId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('flashes')
    .select('*, author:profiles(id, name, handle, avatar_url, curso, bloco)')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data || [];
}

/**
 * Varre um elemento de imagem e decide se injeta o anel colorido e altera o evento de clique
 */
export async function aplicarIntercepcaoFlash(imgElement, profileId) {
  if (!imgElement || !profileId) return;

  // 🔥 TRAVA DE SEGURANÇA: Impede replicação de listeners e chamadas repetidas ao banco
  if (imgElement.dataset.flashBound === 'true') return;
  imgElement.dataset.flashBound = 'true';

  try {
    const user = await getCurrentUser();
    const flashes = await getActiveFlashesByUser(profileId);

    // Se tem flashes ativos, adiciona o anel visual estilo Instagram
    if (flashes.length > 0) {
      imgElement.classList.add('has-flashes-ring');
    }

    // Remove qualquer clique inline residual antigo
    imgElement.onclick = null;

    // Define o comportamento estável de clique único
    imgElement.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (user && profileId === user.id) {
        // Se for o próprio usuário logado
        if (flashes.length > 0) {
          const acao = confirm("Deseja ver seus Flashes ativos? (Clique em Cancelar para postar um novo)");
          if (acao) {
            abrirModalFlashes(flashes);
          } else {
            dispararUploadArquivo();
          }
        } else {
          dispararUploadArquivo();
        }
      } else {
        // Se for o perfil de outra pessoa
        if (flashes.length > 0) {
          abrirModalFlashes(flashes);
        } else {
          // Fallback: se não tem flashes, executa o zoom de imagem padrão
          if (window.openImageViewer) window.openImageViewer(imgElement.src);
        }
      }
    });
  } catch (err) {
    console.error("Erro na interceptação de flashes:", err);
  }
}

function dispararUploadArquivo() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,video/*';
  fileInput.onchange = async () => {
    if (fileInput.files.length > 0) {
      try {
        alert("Enviando seu Flash para a rede...");
        await createFlash(fileInput.files[0]);
        alert("Flash postado com sucesso! Visível por 24 horas.");
        window.location.reload();
      } catch (err) {
        alert("Erro ao salvar Flash: " + err.message);
      }
    }
  };
  fileInput.click();
}

/**
 * Constrói a interface e gerencia a exibição sequencial dos Flashes
 */
function abrirModalFlashes(flashesList) {
  let currentIndex = 0;
  let timer = null;
  const duration = 5000; // 5 segundos por mídia

  const modal = document.createElement('div');
  modal.className = 'flash-viewer-modal';
  
  modal.innerHTML = `
    <div class="flash-content-container">
      <div class="flash-top-overlay">
        <div class="flash-progress-bar-container" id="flashProgressContainer"></div>
        <div class="flash-header-info">
          <img id="flashModalAvatar" src="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.4);">
          <div>
            <b id="flashModalName" style="font-size:14px;display:block;"></b>
            <span id="flashModalHandle" style="font-size:12px;opacity:0.8;"></span>
          </div>
          <button id="closeFlashViewer" style="margin-left:auto;background:none;border:none;color:white;font-size:22px;cursor:pointer;">✕</button>
        </div>
      </div>
      
      <div id="flashMediaBox" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"></div>
      
      <div class="flash-stickers-box" id="flashStickersBox"></div>
      
      <div class="flash-actions-footer">
        <button class="flash-btn-action" id="flashRepostBtn">🔁 Republicar</button>
        <span id="flashViewsCounter" style="color:white;font-size:12px;opacity:0.9;"></span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const fechar = () => {
    clearTimeout(timer);
    modal.remove();
  };

  modal.querySelector('#closeFlashViewer').onclick = fechar;

  async function renderCurrentFlash() {
    clearTimeout(timer);
    const flash = flashesList[currentIndex];
    if (!flash) return fechar();

    // Registra visualização de forma síncrona em segundo plano
    viewFlash(flash.id);

    // Renderiza dados do autor
    const author = flash.author;
    document.getElementById('flashModalAvatar').src = author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author?.handle}`;
    document.getElementById('flashModalName').textContent = author?.name || 'Usuário';
    document.getElementById('flashModalHandle').textContent = `@${author?.handle || 'anonimo'}`;

    // Atualiza barras de progresso superiores
    const progressBox = document.getElementById('flashProgressContainer');
    progressBox.innerHTML = flashesList.map((_, idx) => `
      <div class="flash-progress-track">
        <div class="flash-progress-fill" id="fill-${idx}" style="width: ${idx < currentIndex ? '100%' : '0%'}"></div>
      </div>
    `).join('');

    // Injeta Mídia (Imagem ou Vídeo)
    const mediaBox = document.getElementById('flashMediaBox');
    mediaBox.innerHTML = '';
    if (flash.media_type === 'video') {
      const video = document.createElement('video');
      video.src = flash.media_url;
      video.className = 'flash-media-render';
      video.autoplay = true;
      video.muted = false;
      mediaBox.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = flash.media_url;
      img.className = 'flash-media-render';
      mediaBox.appendChild(img);
    }

    // Injeta stickers puros de Curso e Bloco
    const stickersBox = document.getElementById('flashStickersBox');
    stickersBox.innerHTML = '';
    if (author?.curso) {
      const st = document.createElement('div');
      st.className = 'flash-sticker-item';
      st.textContent = author.curso;
      stickersBox.appendChild(st);
    }
    if (author?.bloco) {
      const st = document.createElement('div');
      st.className = 'flash-sticker-item';
      st.textContent = author.bloco.toUpperCase();
      stickersBox.appendChild(st);
    }

    // Gerencia botões de rodapé e visualizações
    const currentUser = await getCurrentUser();
    const repostBtn = document.getElementById('flashRepostBtn');
    const viewsCounter = document.getElementById('flashViewsCounter');

    if (currentUser && flash.user_id === currentUser.id) {
      repostBtn.style.display = 'none';
      const { count } = await supabase.from('flash_views').select('*', { count: 'exact', head: true }).eq('flash_id', flash.id);
      viewsCounter.textContent = `👁️ ${count || 0} visualizações`;
    } else {
      repostBtn.style.display = 'block';
      viewsCounter.textContent = '';
      repostBtn.onclick = async () => {
        try {
          await repostFlash(flash.id);
          alert("Flash republicado no seu perfil!");
          fechar();
          window.location.reload();
        } catch (err) {
          alert("Erro ao republicar: " + err.message);
        }
      };
    }

    // Dispara animação da barra corrente
    setTimeout(() => {
      const fill = document.getElementById(`fill-${currentIndex}`);
      if (fill) {
        fill.style.transition = `width ${duration}ms linear`;
        fill.style.width = '100%';
      }
    }, 50);

    // Agenda próxima mídia
    timer = setTimeout(() => {
      currentIndex++;
      if (currentIndex < flashesList.length) {
        renderCurrentFlash();
      } else {
        fechar();
      }
    }, duration);
  }

  renderCurrentFlash();
}