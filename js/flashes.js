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

  if (imgElement.dataset.flashBound === 'true') return;
  imgElement.dataset.flashBound = 'true';

  try {
    const user = await getCurrentUser();
    const flashes = await getActiveFlashesByUser(profileId);

    if (flashes.length > 0) {
      imgElement.classList.add('has-flashes-ring');
    }

    imgElement.onclick = null;

    imgElement.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (user && profileId === user.id) {
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
        if (flashes.length > 0) {
          abrirModalFlashes(flashes);
        } else {
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
  const duration = 5000;

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

    viewFlash(flash.id);

    const author = flash.author;
    document.getElementById('flashModalAvatar').src = author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author?.handle}`;
    document.getElementById('flashModalName').textContent = author?.name || 'Usuário';
    document.getElementById('flashModalHandle').textContent = `@${author?.handle || 'anonimo'}`;

    const progressBox = document.getElementById('flashProgressContainer');
    progressBox.innerHTML = flashesList.map((_, idx) => `
      <div class="flash-progress-track">
        <div class="flash-progress-fill" id="fill-${idx}" style="width: ${idx < currentIndex ? '100%' : '0%'}"></div>
      </div>
    `).join('');

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

    setTimeout(() => {
      const fill = document.getElementById(`fill-${currentIndex}`);
      if (fill) {
        fill.style.transition = `width ${duration}ms linear`;
        fill.style.width = '100%';
      }
    }, 50);

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

/**
 * Abre a interface dinâmica de câmera em tela cheia com modos de captura e galeria
 */
export async function abrirInterfaceCameraCaptura() {
  let stream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let currentMode = 'photo';
  let isRecording = false;

  // Evita abrir modais duplicados na árvore do DOM
  const existingModal = document.querySelector('.flash-camera-modal');
  if (existingModal) existingModal.remove();

  const cameraModal = document.createElement('div');
  cameraModal.className = 'flash-camera-modal';
  cameraModal.innerHTML = `
    <div style="display:flex; justify-content:space-between; width:100%; max-width:440px; align-items:center; z-index: 100;">
      <h3 style="margin:0; font-size:18px; font-weight:800; color: white;">⚡ Novo Flash</h3>
      <button id="closeFlashCamera" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">✕</button>
    </div>

    <div class="camera-viewfinder-container">
      <div class="camera-recording-badge" id="cameraRecordingBadge" style="display: none; align-items: center; gap: 6px; position: absolute; top: 20px; left: 20px; background: rgba(224, 36, 94, 0.85); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; z-index: 10;">
        <span style="width:8px; height:8px; background:white; border-radius:50%; display:inline-block;"></span> GRAVANDO
      </div>
      <video id="flashCameraPreview" autoplay playsinline muted></video>
    </div>

    <div class="camera-controls-bottom" style="z-index: 100;">
      <div class="camera-modes-row">
        <button class="camera-mode-btn active" data-mode="photo">FOTO</button>
        <button class="camera-mode-btn" data-mode="video">VÍDEO</button>
      </div>

      <div class="camera-actions-row">
        <button id="btnCameraGallery" style="background:rgba(255,255,255,0.1); border:none; color:white; width:44px; height:44px; border-radius:50%; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">🖼️</button>
        <button class="camera-trigger-btn" id="cameraTriggerBtn"></button>
        <div style="width:44px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(cameraModal);

  const videoElement = cameraModal.querySelector('#flashCameraPreview');
  const triggerBtn = cameraModal.querySelector('#cameraTriggerBtn');
  const recordingBadge = cameraModal.querySelector('#cameraRecordingBadge');

  // Solicitação direta de permissão de hardware (Áudio + Vídeo)
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: true
    });
    videoElement.srcObject = stream;
  } catch (err) {
    alert("Erro de Acesso: Ative as permissões de Câmera/Microfone no seu navegador para postar Flashes: " + err.message);
    cameraModal.remove();
    return;
  }

  const encerrarCamera = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    cameraModal.remove();
    const btnParaVoce = document.querySelector('.tab-btn[data-tab="para-voce"]');
    if (btnParaVoce) btnParaVoce.click();
  };

  cameraModal.querySelector('#closeFlashCamera').onclick = encerrarCamera;

  cameraModal.querySelectorAll('.camera-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRecording) return;
      cameraModal.querySelectorAll('.camera-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      if (currentMode === 'video') {
        triggerBtn.classList.add('mode-video');
      } else {
        triggerBtn.classList.remove('mode-video');
      }
    });
  });

  cameraModal.querySelector('#btnCameraGallery').onclick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*';
    fileInput.onchange = async () => {
      if (fileInput.files.length > 0) {
        try {
          if (stream) stream.getTracks().forEach(track => track.stop());
          cameraModal.remove();
          await createFlash(fileInput.files[0]);
          alert("Flash da galeria enviado com sucesso!");
          window.location.reload();
        } catch (err) {
          alert("Erro ao enviar arquivo: " + err.message);
        }
      }
    };
    fileInput.click();
  };

  triggerBtn.onclick = async () => {
    if (currentMode === 'photo') {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const fotoFile = new File([blob], `flash_${Date.now()}.jpg`, { type: 'image/jpeg' });
          if (stream) stream.getTracks().forEach(track => track.stop());
          cameraModal.remove();
          await createFlash(fotoFile);
          alert("Flash de foto publicado!");
          window.location.reload();
        } catch (err) {
          alert("Erro ao salvar foto: " + err.message);
        }
      }, 'image/jpeg', 0.9);

    } else {
      if (!isRecording) {
        recordedChunks = [];
        
        // Redundância inteligente de formatos de gravação web
        let options = { mimeType: 'video/webm;codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/webm;codecs=vp8,opus' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/mp4' };
        }

        try {
          mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
          try {
            const videoFile = new File([videoBlob], `flash_${Date.now()}.webm`, { type: videoBlob.type });
            await createFlash(videoFile);
            alert("Flash de vídeo publicado!");
            window.location.reload();
          } catch (err) {
            alert("Erro ao salvar vídeo: " + err.message);
          }
        };

        mediaRecorder.start();
        isRecording = true;
        triggerBtn.classList.add('recording');
        recordingBadge.style.display = 'flex';
      } else {
        mediaRecorder.stop();
        if (stream) stream.getTracks().forEach(track => track.stop());
        cameraModal.remove();
      }
    }
  };
}