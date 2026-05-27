import { supabase, getCurrentUser } from './supabase.js';

// Injeção de estilos CSS dedicados para animações, enquadramento, pílula de modo e o Slider Premium
const styles = document.createElement('style');
styles.textContent = `
  @keyframes flashModalFadeIn {
    from { opacity: 0; transform: scale(1.02); filter: blur(2px); }
    to { opacity: 1; transform: scale(1); filter: blur(0); }
  }
  @keyframes pulseGravar {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(224, 36, 94, 0.6); }
    70% { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(224, 36, 94, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(224, 36, 94, 0); }
  }
  @keyframes badgePulse {
    0% { opacity: 0.5; }
    50% { opacity: 1; }
    100% { opacity: 0.5; }
  }
  
  /* Animação dinâmica e viva para o anel/borda do Viewfinder */
  @keyframes cameraViewfinderGlow {
    0% {
      border-color: rgba(255, 255, 255, 0.15) !important;
      box-shadow: 0 0 15px rgba(0, 0, 0, 0.6), 0 0 0px transparent !important;
    }
    50% {
      border-color: var(--accent, var(--primary, #e8325a)) !important;
      box-shadow: 0 0 25px var(--accent, var(--primary, #e8325a)), inset 0 0 15px rgba(255, 255, 255, 0.1) !important;
    }
    100% {
      border-color: rgba(255, 255, 255, 0.15) !important;
      box-shadow: 0 0 15px rgba(0, 0, 0, 0.6), 0 0 0px transparent !important;
    }
  }

  .flash-anim-fade {
    animation: flashModalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  
  .flash-btn-premium {
    transition: all 0.2s ease;
    cursor: pointer;
  }
  .flash-btn-premium:hover {
    transform: scale(1.04);
    filter: brightness(1.1);
  }
  .flash-btn-premium:active {
    transform: scale(0.96);
  }

  /* Seletor de Modo Centralizado com Pílula Deslizante Adaptável ao Tema */
  .mode-selector-container {
    position: relative !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border-radius: 24px !important;
    padding: 4px !important;
    gap: 4px !important;
    width: fit-content !important;
    margin: 0 auto !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
  }
  .mode-pill-bg {
    position: absolute !important;
    top: 4px !important;
    left: 4px !important;
    height: calc(100% - 8px) !important;
    width: 80px !important;
    background: var(--accent, var(--primary, #e8325a)) !important;
    border-radius: 20px !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    z-index: 1 !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
  }
  .camera-mode-btn {
    position: relative !important;
    z-index: 2 !important;
    width: 80px !important;
    border: none !important;
    background: transparent !important;
    background-color: transparent !important;
    color: rgba(255, 255, 255, 0.5) !important;
    font-size: 12px !important;
    font-weight: 800 !important;
    cursor: pointer !important;
    padding: 8px 0 !important;
    transition: color 0.2s, opacity 0.2s !important;
    text-align: center !important;
    letter-spacing: 0.5px !important;
  }
  .camera-mode-btn.active {
    color: #ffffff !important;
    background: transparent !important;
    background-color: transparent !important;
    opacity: 1 !important;
  }

  /* Gatilho Principal da Câmera Perfeitamente Centralizado */
  .camera-trigger-btn {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: #ffffff;
    border: 5px solid rgba(255, 255, 255, 0.25);
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .camera-trigger-btn:hover {
    transform: scale(1.06);
  }
  .camera-trigger-btn.recording {
    animation: pulseGravar 1.5s infinite !important;
    background: #e0245e !important;
    border-radius: 16px;
  }

  /* ------------------------------------------------------------
     DESIGN PREMIUM DO SLIDER (COMPATIVEL COM CLARO E ESCURO)
     ------------------------------------------------------------ */
  .flash-slider-wrapper {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: 16px !important;
    padding: 12px 16px !important;
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    transition: border-color 0.3s ease, box-shadow 0.3s ease !important;
  }
  .flash-slider-wrapper:hover {
    border-color: rgba(255, 255, 255, 0.12) !important;
    background: rgba(255, 255, 255, 0.05) !important;
  }
  .flash-custom-slider {
    -webkit-appearance: none !important;
    appearance: none !important;
    flex: 1 !important;
    height: 4px !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 2px !important;
    outline: none !important;
    cursor: pointer !important;
    transition: background 0.3s ease !important;
  }
  .flash-custom-slider:hover {
    background: rgba(255, 255, 255, 0.15) !important;
  }
  
  /* Thumb para navegadores baseados em Webkit (Chrome, Safari, Edge, Opera) */
  .flash-custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none !important;
    appearance: none !important;
    width: 16px !important;
    height: 16px !important;
    border-radius: 50% !important;
    background: #ffffff !important;
    border: 3px solid var(--accent, var(--primary, #e8325a)) !important;
    box-shadow: 0 0 10px var(--accent, var(--primary, #e8325a)), 0 2px 6px rgba(0,0,0,0.5) !important;
    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s !important;
  }
  .flash-custom-slider::-webkit-slider-thumb:hover {
    transform: scale(1.25) !important;
    background: var(--accent, var(--primary, #e8325a)) !important;
    border-color: #ffffff !important;
  }
  .flash-custom-slider:active::-webkit-slider-thumb {
    transform: scale(1.1) !important;
  }

  /* Thumb para Firefox */
  .flash-custom-slider::-moz-range-thumb {
    width: 10px !important;
    height: 10px !important;
    border-radius: 50% !important;
    background: #ffffff !important;
    border: 3px solid var(--accent, var(--primary, #e8325a)) !important;
    box-shadow: 0 0 10px var(--accent, var(--primary, #e8325a)), 0 2px 6px rgba(0,0,0,0.5) !important;
    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s !important;
    cursor: pointer !important;
  }
  .flash-custom-slider::-moz-range-thumb:hover {
    transform: scale(1.25) !important;
    background: var(--accent, var(--primary, #e8325a)) !important;
    border-color: #ffffff !important;
  }

  #flashCameraPreview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #000;
  }

  .camera-viewfinder-glow-active {
    animation: cameraViewfinderGlow 2.5s infinite ease-in-out !important;
  }
`;
document.head.appendChild(styles);

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
    <div class="flash-content-container" style="backdrop-filter: blur(25px); background: rgba(10,10,10,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px;">
      <div class="flash-top-overlay">
        <div class="flash-progress-bar-container" id="flashProgressContainer"></div>
        <div class="flash-header-info">
          <img id="flashModalAvatar" src="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--accent, var(--primary, #e8325a));">
          <div>
            <b id="flashModalName" style="font-size:14px;display:block;color:#fff;"></b>
            <span id="flashModalHandle" style="font-size:12px;opacity:0.8;color:var(--accent, var(--primary, #e8325a));"></span>
          </div>
          <button id="closeFlashViewer" style="margin-left:auto;background:none;border:none;color:white;font-size:22px;cursor:pointer;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">✕</button>
        </div>
      </div>
      
      <div id="flashMediaBox" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:12px;overflow:hidden;"></div>
      
      <div class="flash-stickers-box" id="flashStickersBox"></div>
      
      <div class="flash-actions-footer" style="background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 20px 15px;">
        <button class="flash-btn-action flash-btn-premium" id="flashRepostBtn" style="background: var(--accent, var(--primary, #e8325a)); color: white; border-radius: 30px; font-weight: 700; padding: 10px 22px; border: none; box-shadow: 0 4px 15px rgba(232,50,90,0.25);">🔁 Republicar</button>
        <span id="flashViewsCounter" style="color:white;font-size:12px;opacity:0.9;font-weight:600;text-shadow: 0 2px 4px rgba(0,0,0,0.5);"></span>
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
      <div class="flash-progress-track" style="background: rgba(255,255,255,0.2); height: 4px; border-radius: 2px; overflow: hidden;">
        <div class="flash-progress-fill" id="fill-${idx}" style="background: var(--accent, var(--primary, #e8325a)); height: 100%; width: ${idx < currentIndex ? '100%' : '0%'}"></div>
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
      video.style.borderRadius = "12px";
      mediaBox.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = flash.media_url;
      img.className = 'flash-media-render';
      img.style.borderRadius = "12px";
      mediaBox.appendChild(img);
    }

    const stickersBox = document.getElementById('flashStickersBox');
    stickersBox.innerHTML = '';
    if (author?.curso) {
      const st = document.createElement('div');
      st.className = 'flash-sticker-item';
      st.style.background = 'rgba(0,0,0,0.65)';
      st.style.border = '1px solid var(--accent, var(--primary, #e8325a))';
      st.style.color = '#fff';
      st.style.fontWeight = '700';
      st.textContent = author.curso;
      stickersBox.appendChild(st);
    }
    if (author?.bloco) {
      const st = document.createElement('div');
      st.className = 'flash-sticker-item';
      st.style.background = 'var(--accent, var(--primary, #e8325a))';
      st.style.color = '#fff';
      st.style.fontWeight = '800';
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
 * Desenha retângulos arredondados nativos no Canvas de Fotos
 */
function desenharRetanguloArredondado(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Abre a interface dinâmica de câmera em tela cheia com modos de captura, galeria, flash de tela e tela de preview com marcações
 */
export async function abrirInterfaceCameraCaptura() {
  let stream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let currentMode = 'photo';
  let isRecording = false;
  let animationFrameId = null;
  
  let timerInterval = null;
  let elapsedSeconds = 0;

  const existingModal = document.querySelector('.flash-camera-modal');
  if (existingModal) existingModal.remove();

  const cameraModal = document.createElement('div');
  cameraModal.className = 'flash-camera-modal flash-anim-fade';
  
  cameraModal.style.cssText = `
    position: fixed !important; top: 0 !important; left: 0 !important;
    width: 100vw !important; height: 100vh !important;
    background: #0b0b0c !important; z-index: 100000 !important;
    display: flex !important; flex-direction: column !important;
    align-items: center !important; justify-content: space-between !important;
    padding: 30px 20px !important; box-sizing: border-box !important;
  `;

  cameraModal.innerHTML = `
    <div id="cameraSoftboxLight" style="position: absolute !important; inset: 0 !important; background: #ffffff !important; opacity: 0; pointer-events: none !important; z-index: 1 !important; transition: opacity 0.1s ease !important;"></div>

    <div style="width:100%; max-width:400px; display:flex; justify-content:space-between; align-items:center; z-index: 10; position:relative;">
      <h3 id="cameraHeaderTitle" style="color:#fff !important; margin:0 !important; font-size:18px !important; font-weight:900 !important; letter-spacing:-0.5px !important; text-shadow: 0 2px 10px rgba(0,0,0,0.5) !important; transition: color 0.2s ease !important;">⚡ Novo Flash</h3>
      <button id="closeFlashCamera" class="flash-btn-premium" style="background:rgba(255,255,255,0.12) !important; border:none !important; color:#fff !important; width:38px !important; height:38px !important; border-radius:50% !important; font-size:15px !important; display:flex !important; align-items:center !important; justify-content:center !important; font-weight:bold !important; transition: all 0.2s ease !important;">✕</button>
    </div>

    <div id="cameraViewfinderContainer" class="camera-viewfinder-glow-active" style="position: relative !important; width: 100% !important; max-width: 380px !important; aspect-ratio: 9/16 !important; overflow: hidden !important; border-radius: 28px !important; border: 2px solid rgba(255,255,255,0.12) !important; background: #000 !important; box-shadow: 0 20px 50px rgba(0,0,0,0.7) !important; z-index:10 !important; transition: border-color 0.3s ease !important;">
       <video id="flashCameraPreview" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover !important; transform: scaleX(-1) !important;"></video>
       
       <div id="cameraRecordingBadge" style="display:none; position:absolute !important; top:20px !important; left:20px !important; background:rgba(224, 36, 94, 0.9) !important; color:#fff !important; padding:6px 14px !important; border-radius:20px !important; font-size:11px !important; font-weight:900 !important; letter-spacing: 0.5px !important; animation: badgePulse 1s infinite !important; z-index: 20 !important; align-items:center !important;">● GRAVANDO</div>
       
       <div id="cameraTimerBadge" style="display:none; position:absolute !important; top:20px !important; right:20px !important; background:rgba(10, 10, 12, 0.7) !important; border:1px solid rgba(255,255,255,0.15) !important; color:#fff !important; padding:6px 14px !important; border-radius:20px !important; font-size:11px !important; font-weight:900 !important; letter-spacing: 0.5px !important; z-index: 20 !important; align-items:center !important; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);">00:00</div>
    </div>

    <div id="cameraControlsBottom" style="width:100% !important; max-width:400px !important; background: rgba(18, 18, 20, 0.85) !important; backdrop-filter: blur(25px) !important; -webkit-backdrop-filter: blur(25px) !important; border-radius: 28px !important; padding: 20px !important; border: 1px solid rgba(255,255,255,0.08) !important; display:flex !important; flex-direction:column !important; gap:18px !important; box-shadow: 0 10px 40px rgba(0,0,0,0.4) !important; z-index: 10 !important; position:relative !important; box-sizing:border-box !important;">
      
      <div class="flash-slider-wrapper">
        <span style="color:#fff !important; font-size:11px !important; font-weight:900 !important; opacity:0.8 !important; white-space:nowrap !important; letter-spacing:0.8px !important;">💡 LANTERNA PC</span>
        <input type="range" id="flashBrightnessSlider" min="0" max="1" step="0.05" value="0" class="flash-custom-slider">
        <span id="brightnessValue" style="color: var(--accent, var(--primary, #e8325a)) !important; font-size: 13px !important; min-width: 35px !important; text-align: right !important; font-weight: 900 !important;">0%</span>
      </div>

      <div class="mode-selector-container">
        <div class="mode-pill-bg" id="modePillBg"></div>
        <button class="camera-mode-btn active" data-mode="photo" style="outline:none !important;">FOTO</button>
        <button class="camera-mode-btn" data-mode="video" style="outline:none !important;">VÍDEO</button>
      </div>

      <div style="display:flex !important; justify-content:space-between !important; align-items:center !important; width:100% !important; padding: 0 10px !important; box-sizing:border-box !important;">
        <button id="btnCameraGallery" class="flash-btn-premium" style="background:rgba(255,255,255,0.08) !important; border:1px solid rgba(255,255,255,0.1) !important; color:#fff !important; width:52px !important; height:52px !important; border-radius:50% !important; font-size:22px !important; display:flex !items:center !justify-content:center !important; outline:none !important;">🖼️</button>
        
        <div style="flex:1 !important; display:flex !important; justify-content:center !important; align-items:center !important;">
          <button id="cameraTriggerBtn" class="camera-trigger-btn" style="outline:none !important;"></button>
        </div>
        
        <div style="width:52px !important; height:52px !important;"></div> </div>
    </div>
  `;

  document.body.appendChild(cameraModal);

  const videoElement = cameraModal.querySelector('#flashCameraPreview');
  const triggerBtn = cameraModal.querySelector('#cameraTriggerBtn');
  const pillBg = cameraModal.querySelector('#modePillBg');
  const softboxLight = cameraModal.querySelector('#cameraSoftboxLight');
  const brightnessValue = cameraModal.querySelector('#brightnessValue');
  const viewFinder = cameraModal.querySelector('#cameraViewfinderContainer');
  const controlsBottom = cameraModal.querySelector('#cameraControlsBottom');
  
  const recordingBadge = cameraModal.querySelector('#cameraRecordingBadge');
  const timerBadge = cameraModal.querySelector('#cameraTimerBadge');

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: true
    });
    videoElement.srcObject = stream;
  } catch (err) {
    alert("Erro de hardware na câmera: " + err.message);
    cameraModal.remove();
    return;
  }

  function getCropCoords() {
    const w_vid = videoElement.videoWidth;
    const h_vid = videoElement.videoHeight;
    const targetRatio = 9 / 16;
    let sx = 0, sy = 0, sw = w_vid, sh = h_vid;
    if (w_vid && h_vid) {
      const currentRatio = w_vid / h_vid;
      if (currentRatio > targetRatio) {
        sw = h_vid * targetRatio;
        sx = (w_vid - sw) / 2;
      } else {
        sh = w_vid / targetRatio;
        sy = (h_vid - sh) / 2;
      }
    }
    return { sx, sy, sw, sh };
  }

  cameraModal.querySelectorAll('.camera-mode-btn').forEach((btn, idx) => {
    btn.onclick = () => {
      if (isRecording) return;
      cameraModal.querySelectorAll('.camera-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      pillBg.style.transform = `translateX(${idx * 84}px)`;
      triggerBtn.style.background = currentMode === 'video' ? '#e0245e' : '#ffffff';
    };
  });

  cameraModal.querySelector('#flashBrightnessSlider').oninput = (e) => {
    const val = e.target.value;
    softboxLight.style.opacity = val;
    brightnessValue.textContent = `${Math.round(val * 100)}%`;

    // Intercepta e altera dinamicamente a cor do título e do fechar para evitar sumiço no branco
    const headerTitle = cameraModal.querySelector('#cameraHeaderTitle');
    const closeBtn = cameraModal.querySelector('#closeFlashCamera');
    
    if (val > 0.4) {
      headerTitle.style.setProperty('color', '#121214', 'important');
      closeBtn.style.setProperty('color', '#121214', 'important');
      closeBtn.style.setProperty('background', 'rgba(0,0,0,0.12)', 'important');
    } else {
      headerTitle.style.setProperty('color', '#ffffff', 'important');
      closeBtn.style.setProperty('color', '#ffffff', 'important');
      closeBtn.style.setProperty('background', 'rgba(255,255,255,0.12)', 'important');
    }
  };

  const limparRecursosHardware = () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  };

  cameraModal.querySelector('#closeFlashCamera').onclick = () => {
    limparRecursosHardware();
    cameraModal.remove();
  };

  cameraModal.querySelector('#btnCameraGallery').onclick = () => {
     const input = document.createElement('input');
     input.type = 'file'; input.accept = 'image/*,video/*';
     input.onchange = () => {
       if (input.files[0]) {
         limparRecursosHardware();
         abrirInterfacePreview(input.files[0], input.files[0].type.startsWith('video/') ? 'video' : 'photo');
       }
     };
     input.click();
  };

  triggerBtn.onclick = async () => {
    if (currentMode === 'photo') {
      const coords = getCropCoords();
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');
      
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoElement, coords.sx + 0.5, coords.sy + 0.5, coords.sw - 1, coords.sh - 1, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(blob => {
        limparRecursosHardware();
        abrirInterfacePreview(new File([blob], `flash_${Date.now()}.jpg`, {type:"image/jpeg"}), 'photo');
      }, 'image/jpeg', 0.96);
    } else {
      if (!isRecording) {
        recordedChunks = [];
        let options = { mimeType: 'video/webm;codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm;codecs=vp8,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };

        const coords = getCropCoords();
        const videoCanvas = document.createElement('canvas');
        videoCanvas.width = 480;
        videoCanvas.height = 854;
        const vCtx = videoCanvas.getContext('2d');

        function renderStreamRecortado() {
          if (!isRecording) return;
          vCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
          vCtx.save();
          vCtx.translate(videoCanvas.width, 0);
          vCtx.scale(-1, 1);
          vCtx.drawImage(videoElement, coords.sx + 0.5, coords.sy + 0.5, coords.sw - 1, coords.sh - 1, 0, 0, videoCanvas.width, videoCanvas.height);
          vCtx.restore();
          animationFrameId = requestAnimationFrame(renderStreamRecortado);
        }

        isRecording = true;
        renderStreamRecortado();

        const canvasStream = videoCanvas.captureStream(30);
        if (stream.getAudioTracks().length > 0) {
          stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
        }

        try {
          mediaRecorder = new MediaRecorder(canvasStream, options);
        } catch (e) {
          mediaRecorder = new MediaRecorder(canvasStream);
        }

        mediaRecorder.ondataavailable = e => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, {type: mediaRecorder.mimeType || 'video/webm'});
          abrirInterfacePreview(new File([blob], `flash_${Date.now()}.webm`, {type: blob.type}), 'video');
        };

        elapsedSeconds = 0;
        timerBadge.textContent = "00:00";
        timerBadge.style.display = 'flex';
        recordingBadge.style.display = 'flex';
        triggerBtn.classList.add('recording');

        timerInterval = setInterval(() => {
          elapsedSeconds++;
          const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
          const secs = String(elapsedSeconds % 60).padStart(2, '0');
          timerBadge.textContent = `${mins}:${secs}`;
        }, 1000);

        mediaRecorder.start();
      } else {
        isRecording = false;
        triggerBtn.classList.remove('recording');
        recordingBadge.style.display = 'none';
        timerBadge.style.display = 'none';
        
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        
        mediaRecorder.stop();
        if (stream) stream.getTracks().forEach(t => t.stop());
      }
    }
  };

  function abrirInterfacePreview(file, type) {
    viewFinder.style.display = 'none';
    controlsBottom.style.display = 'none';
    softboxLight.style.opacity = '0';

    let listaMarcacoes = [];
    const fileUrl = URL.createObjectURL(file);

    const previewContainer = document.createElement('div');
    previewContainer.id = 'flashPreviewStage';
    previewContainer.className = 'flash-anim-fade';
    previewContainer.style.cssText = `width:100% !important; max-width:380px !important; flex:1 !important; display:flex !important; flex-direction:column !important; justify-content:space-between !important; margin: 15px 0 !important; z-index:50 !important; position:relative !important;`;
    
    let mediaMarkup = type === 'video' 
      ? `<video src="${fileUrl}" autoplay loop playsinline style="width:100% !important; height:100% !important; object-fit:cover !important; border-radius:24px !important; border:1px solid rgba(255,255,255,0.08) !important;"></video>` 
      : `<img src="${fileUrl}" style="width:100% !important; height:100% !important; object-fit:cover !important; border-radius:24px !important; border:1px solid rgba(255,255,255,0.08) !important;">`;

    previewContainer.innerHTML = `
      <div style="position:relative !important; width:100% !important; flex:1 !important; display:flex !important; align-items:center !important; justify-content:center !important; aspect-ratio:9/16 !important; overflow:hidden !important; border-radius:24px !important;">
        ${mediaMarkup}
        <div id="previewStickersLayer" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:12px; padding:20px; box-sizing:border-box;"></div>
      </div>

      <div style="display:flex !important; flex-direction:column !important; gap:14px !important; margin-top:18px !important; background: rgba(18, 18, 20, 0.85) !important; padding: 20px !important; border-radius: 28px !important; backdrop-filter: blur(25px) !important; -webkit-backdrop-filter: blur(25px) !important; border: 1px solid rgba(255,255,255,0.08) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;">
        <button id="btnAdicionarMarcacao" class="flash-btn-premium" style="background: rgba(255,255,255,0.08) !important; border:1px solid rgba(255,255,255,0.12) !important; color:white !important; padding:12px !important; border-radius:14px !important; font-weight:700 !important; font-size:13px !important; display:flex !important; align-items:center !important; justify-content:center !important; gap:8px !important; outline:none !important;">🏷️ Adicionar Marcação / Legenda</button>
        
        <div style="display:flex !important; gap:12px !important; width:100% !important;">
          <button id="btnCancelarPreview" class="flash-btn-premium" style="flex:1 !important; background:rgba(255,255,255,0.05) !important; border:1px solid rgba(255,255,255,0.05) !important; color:#ff4a4a !important; padding:15px !important; border-radius:16px !important; font-weight:700 !important; font-size:14px !important; outline:none !important;">🗑️ Refazer</button>
          <button id="btnConfirmarPreview" class="flash-btn-premium" style="flex:2 !important; background: var(--accent, var(--primary, #e8325a)) !important; border:none !important; color:white !important; padding:15px !important; border-radius:16px !important; font-weight:800 !important; font-size:14px !important; box-shadow: 0 6px 20px rgba(232,50,90,0.3) !important; outline:none !important;">Postar Flash 🚀</button>
        </div>
      </div>
    `;

    cameraModal.appendChild(previewContainer);
    const stickersLayer = previewContainer.querySelector('#previewStickersLayer');

    const atualizarStickersNaTela = () => {
      stickersLayer.innerHTML = '';
      listaMarcacoes.forEach((texto, index) => {
        const badge = document.createElement('div');
        badge.style.cssText = `background:rgba(10,10,12,0.85) !important; color:#fff !important; padding:10px 18px !important; border-radius:30px !important; font-size:13px !important; font-weight:700 !important; border:1px solid var(--accent, var(--primary, #e8325a)) !important; pointer-events:auto !important; cursor:pointer !important; backdrop-filter:blur(10px) !important; -webkit-backdrop-filter:blur(10px) !important; box-shadow:0 4px 15px rgba(0,0,0,0.3) !important; transition:transform 0.15s !important;`;
        badge.textContent = texto;
        
        badge.onmouseover = () => badge.style.transform = 'scale(1.05)';
        badge.onmouseout = () => badge.style.transform = 'scale(1)';
        badge.onclick = () => {
          listaMarcacoes.splice(index, 1);
          atualizarStickersNaTela();
        };
        stickersLayer.appendChild(badge);
      });
    };

    previewContainer.querySelector('#btnAdicionarMarcacao').onclick = () => {
      const texto = prompt("Digite o texto da sua marcação:");
      if (texto && texto.trim() !== "") {
        listaMarcacoes.push(texto.trim());
        atualizarStickersNaTela();
      }
    };

    previewContainer.querySelector('#btnCancelarPreview').onclick = () => {
      previewContainer.remove();
      URL.revokeObjectURL(fileUrl);
      abrirInterfaceCameraCaptura();
    };

    previewContainer.querySelector('#btnConfirmarPreview').onclick = async () => {
      const btnConfirmar = previewContainer.querySelector('#btnConfirmarPreview');
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = "Processando... ⚙️";

      try {
        let arquivoParaEnviar = file;

        if (type === 'photo' && listaMarcacoes.length > 0) {
          const imgTemp = new Image();
          imgTemp.src = fileUrl;
          await new Promise(res => { imgTemp.onload = res; imgTemp.onerror = res; });

          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = imgTemp.naturalWidth || 720;
          finalCanvas.height = imgTemp.naturalHeight || 1280;
          const finalCtx = finalCanvas.getContext('2d');

          finalCtx.drawImage(imgTemp, 0, 0);

          const fontSize = Math.round(finalCanvas.height * 0.038) || 24;
          finalCtx.font = `bold ${fontSize}px sans-serif`;
          finalCtx.textAlign = 'center';

          let startY = finalCanvas.height * 0.45;
          listaMarcacoes.forEach(texto => {
            const textWidth = finalCtx.measureText(texto).width;
            const paddingX = fontSize * 0.8;
            const paddingY = fontSize * 0.4;
            
            const bgWidth = textWidth + (paddingX * 2);
            const bgHeight = fontSize + paddingY;
            const bgX = (finalCanvas.width / 2) - (textWidth / 2) - paddingX;
            const bgY = startY - fontSize + paddingY;

            finalCtx.fillStyle = 'rgba(10, 10, 12, 0.9)';
            desenharRetanguloArredondado(finalCtx, bgX, bgY, bgWidth, bgHeight, fontSize * 0.5);

            const computedAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 
                                   getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#e8325a';
            finalCtx.strokeStyle = computedAccent;
            finalCtx.lineWidth = Math.max(1, fontSize * 0.05);
            finalCtx.stroke();

            finalCtx.fillStyle = '#FFFFFF';
            finalCtx.fillText(texto, finalCanvas.width / 2, startY);
            startY += fontSize * 1.6;
          });

          const mescladoBlob = await new Promise(res => finalCanvas.toBlob(res, 'image/jpeg', 0.95));
          arquivoParaEnviar = new File([mescladoBlob], `flash_${Date.now()}.jpg`, { type: 'image/jpeg' });
        }

        cameraModal.remove();
        await createFlash(arquivoParaEnviar);
        window.location.reload();

      } catch (err) {
        alert("Erro ao salvar Flash: " + err.message);
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = "Postar Flash 🚀";
      }
    };
  }
}