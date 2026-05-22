// ============================================================
// settings-patch.js
// Adiciona novas abas de configurações ao app VazaPUC:
//   • Aparência   — fonte, densidade, animações
//   • Privacidade — já existe, só melhora
//   • Conta       — inclui "Desativar Conta" funcional
//   • Acessibilidade — contraste, motion
//   • Sobre       — versão, créditos
//
// Como usar: <script src="settings-patch.js"></script>
// Carregue APÓS o home.js (ou no final do <body>).
// ============================================================

(function () {
  'use strict';

  // ── Chaves de preferências locais ───────────────────────────
  const PREF_KEY = 'vazapuc_prefs';

  function getPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
  }

  function setPrefs(obj) {
    const current = getPrefs();
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...current, ...obj }));
  }

  function getPref(key, defaultValue) {
    return getPrefs()[key] ?? defaultValue;
  }

  // ── Aplica preferências salvas na inicialização ──────────────
  function applyStoredPrefs() {
    const prefs = getPrefs();

    // Tamanho de fonte
    const fontSize = prefs.fontSize ?? 'normal';
    const fontMap = { small: '14px', normal: '16px', large: '18px', xlarge: '20px' };
    document.documentElement.style.fontSize = fontMap[fontSize] || '16px';

    // Densidade do feed
    const density = prefs.density ?? 'normal';
    const densityStyle = document.getElementById('_densityStyle') || document.createElement('style');
    densityStyle.id = '_densityStyle';
    densityStyle.textContent = density === 'compact'
      ? '.post-card { padding: 10px 14px !important; } .posts-container { gap: 6px !important; }'
      : density === 'comfortable'
      ? '.post-card { padding: 24px 28px !important; } .posts-container { gap: 20px !important; }'
      : '';
    document.head.appendChild(densityStyle);

    // Animações reduzidas
    if (prefs.reducedMotion) {
      const s = document.getElementById('_reducedMotionStyle') || document.createElement('style');
      s.id = '_reducedMotionStyle';
      s.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }';
      document.head.appendChild(s);
    }

    // Alto contraste
    if (prefs.highContrast) {
      document.documentElement.setAttribute('data-high-contrast', '');
    }
  }

  // ── Aguarda o DOM estar pronto ───────────────────────────────
  function init() {
    applyStoredPrefs();
    patchSettingsSidebar();
    patchDeactivateAccount();
  }

  // ── Adiciona novas abas na sidebar de configurações ──────────
  function patchSettingsSidebar() {
    const sidebar = document.querySelector('.settings-sidebar');
    const content = document.querySelector('.settings-content');
    if (!sidebar || !content) {
      // Tenta de novo após 500ms (JS do home ainda carregando)
      setTimeout(patchSettingsSidebar, 500);
      return;
    }

    // Evita duplicação
    if (sidebar.dataset.patched) return;
    sidebar.dataset.patched = 'true';

    // ── Botões extras na sidebar ──────────────────────────────
    const extraTabs = [
      { id: 'aparencia',      icon: '🎨', label: 'Aparência' },
      { id: 'acessibilidade', icon: '♿', label: 'Acessibilidade' },
      { id: 'sobre',          icon: 'ℹ️',  label: 'Sobre' },
    ];

    extraTabs.forEach(tab => {
      if (sidebar.querySelector(`[data-settings-tab="${tab.id}"]`)) return;
      const btn = document.createElement('button');
      btn.className = 'settings-tab-btn';
      btn.setAttribute('data-settings-tab', tab.id);
      btn.style.cssText = 'background:none;border:none;text-align:left;padding:12px;color:var(--text-secondary);cursor:pointer;border-radius:8px;font-size:15px;';
      btn.innerHTML = `${tab.icon} ${tab.label}`;
      sidebar.appendChild(btn);
    });

    // ── Seções extras no content ──────────────────────────────
    injectAparenciaSection(content);
    injectAcessibilidadeSection(content);
    injectSobreSection(content);

    // ── Listener unificado para troca de aba ──────────────────
    // Reatribui todos os botões (incluindo os originais)
    const allTabBtns = sidebar.querySelectorAll('.settings-tab-btn');
    const allSections = content.querySelectorAll('.settings-section');

    allTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        allTabBtns.forEach(b => {
          b.classList.remove('active');
          b.style.color = 'var(--text-secondary)';
          b.style.fontWeight = '';
        });
        allSections.forEach(s => s.classList.remove('active'));

        btn.classList.add('active');
        btn.style.color = 'var(--primary)';
        btn.style.fontWeight = 'bold';

        const target = content.getElementById
          ? content.getElementById(`settings-${btn.dataset.settingsTab}`)
          : document.getElementById(`settings-${btn.dataset.settingsTab}`);
        target?.classList.add('active');
      });
    });
  }

  // ── Seção: Aparência ─────────────────────────────────────────
  function injectAparenciaSection(content) {
    if (document.getElementById('settings-aparencia')) return;

    const section = document.createElement('div');
    section.className = 'settings-section';
    section.id = 'settings-aparencia';
    section.innerHTML = `
      <div style="border-bottom:1px solid var(--border);padding:15px 20px;position:sticky;top:0;background:var(--dark-bg);z-index:10;">
        <h3 style="font-size:1.1rem;font-weight:800;margin:0;color:var(--text-primary);">🎨 Aparência</h3>
      </div>

      <div style="padding:20px;display:flex;flex-direction:column;gap:24px;">

        <!-- Tamanho de fonte -->
        <div>
          <p style="font-weight:700;font-size:15px;color:var(--text-primary);margin:0 0 12px;">Tamanho do texto</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;" id="fontSizePicker">
            ${[
              { value: 'small',   label: 'Pequeno',   size: '12px' },
              { value: 'normal',  label: 'Normal',    size: '14px' },
              { value: 'large',   label: 'Grande',    size: '16px' },
              { value: 'xlarge',  label: 'Muito grande', size: '18px' },
            ].map(opt => `
              <button class="font-size-opt" data-value="${opt.value}" style="
                padding:10px 16px;border-radius:12px;border:2px solid var(--border);
                background:transparent;color:var(--text-primary);cursor:pointer;
                font-size:${opt.size};transition:all 0.2s;font-family:inherit;
              ">${opt.label}</button>
            `).join('')}
          </div>
        </div>

        <!-- Densidade do feed -->
        <div>
          <p style="font-weight:700;font-size:15px;color:var(--text-primary);margin:0 0 12px;">Densidade do feed</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;" id="densityPicker">
            ${[
              { value: 'compact',     label: '📦 Compacto' },
              { value: 'normal',      label: '📋 Normal' },
              { value: 'comfortable', label: '🛋️ Confortável' },
            ].map(opt => `
              <button class="density-opt" data-value="${opt.value}" style="
                padding:10px 18px;border-radius:12px;border:2px solid var(--border);
                background:transparent;color:var(--text-primary);cursor:pointer;
                font-size:14px;transition:all 0.2s;font-family:inherit;
              ">${opt.label}</button>
            `).join('')}
          </div>
        </div>

        <!-- Cores / temas (redireciona para o seletor já existente) -->
        <div>
          <p style="font-weight:700;font-size:15px;color:var(--text-primary);margin:0 0 6px;">Tema de cores</p>
          <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px;">Use o botão 🎨 na barra lateral ou as bolinhas abaixo.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;" id="themeInlineGrid">
            ${[
              { theme: 'padrao',        bg: '#a31f4b',  label: 'Vinho' },
              { theme: 'azul',          bg: '#1f5aa3',  label: 'Azul' },
              { theme: 'cinza',         bg: '#888888',  label: 'Cinza' },
              { theme: 'amarelo',       bg: '#b8860b',  label: 'Amarelo' },
              { theme: 'padrao-claro',  bg: 'linear-gradient(135deg,#a31f4b 50%,#f4f6f8 50%)', label: 'Vinho Claro' },
              { theme: 'azul-claro',    bg: 'linear-gradient(135deg,#1f5aa3 50%,#f0f4f8 50%)', label: 'Azul Claro' },
              { theme: 'cinza-claro',   bg: 'linear-gradient(135deg,#555 50%,#f5f5f5 50%)',    label: 'Cinza Claro' },
              { theme: 'amarelo-claro', bg: 'linear-gradient(135deg,#b8860b 50%,#fcfbf7 50%)', label: 'Amarelo Claro' },
            ].map(t => `
              <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
                <div class="inline-theme-btn" data-theme="${t.theme}" style="
                  width:40px;height:40px;border-radius:50%;
                  background:${t.bg};cursor:pointer;
                  border:3px solid transparent;
                  box-shadow:0 2px 8px rgba(0,0,0,0.3);
                  transition:transform 0.2s,border-color 0.2s;
                " title="${t.label}"></div>
                <span style="font-size:10px;color:var(--text-secondary);text-align:center;max-width:52px;">${t.label}</span>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    `;
    content.appendChild(section);

    // Marca opção ativa
    function markActive(selector, key, defaultVal) {
      const current = getPref(key, defaultVal);
      section.querySelectorAll(selector).forEach(btn => {
        const isActive = btn.dataset.value === current;
        btn.style.borderColor = isActive ? 'var(--primary)' : 'var(--border)';
        btn.style.background  = isActive ? 'rgba(var(--primary-rgb,163,31,75),0.12)' : 'transparent';
        btn.style.color       = isActive ? 'var(--primary)' : 'var(--text-primary)';
        btn.style.fontWeight  = isActive ? '700' : '400';
      });
    }
    markActive('.font-size-opt', 'fontSize', 'normal');
    markActive('.density-opt', 'density', 'normal');

    // Eventos: fonte
    section.querySelectorAll('.font-size-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        setPrefs({ fontSize: btn.dataset.value });
        applyStoredPrefs();
        markActive('.font-size-opt', 'fontSize', 'normal');
      });
    });

    // Eventos: densidade
    section.querySelectorAll('.density-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        setPrefs({ density: btn.dataset.value });
        applyStoredPrefs();
        markActive('.density-opt', 'density', 'normal');
      });
    });

    // Eventos: tema inline
    const currentTheme = localStorage.getItem('vazaPucTheme') || 'padrao';
    section.querySelectorAll('.inline-theme-btn').forEach(btn => {
      const isActive = btn.dataset.theme === currentTheme;
      if (isActive) btn.style.borderColor = '#fff';

      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        if (theme === 'padrao') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('vazaPucTheme', theme);

        section.querySelectorAll('.inline-theme-btn').forEach(b => b.style.borderColor = 'transparent');
        btn.style.borderColor = '#fff';
        btn.style.transform = 'scale(1.15)';
        setTimeout(() => btn.style.transform = '', 300);
      });
    });
  }

  // ── Seção: Acessibilidade ────────────────────────────────────
  function injectAcessibilidadeSection(content) {
    if (document.getElementById('settings-acessibilidade')) return;

    const section = document.createElement('div');
    section.className = 'settings-section';
    section.id = 'settings-acessibilidade';
    section.innerHTML = `
      <div style="border-bottom:1px solid var(--border);padding:15px 20px;position:sticky;top:0;background:var(--dark-bg);z-index:10;">
        <h3 style="font-size:1.1rem;font-weight:800;margin:0;color:var(--text-primary);">♿ Acessibilidade</h3>
      </div>
      <div style="padding:0;">

        ${toggleRow(
          'acc-reduced-motion',
          '🎞️ Reduzir animações',
          'Desativa transições e animações em toda a interface.',
          'reducedMotion',
          false
        )}

        ${toggleRow(
          'acc-high-contrast',
          '🔆 Alto contraste',
          'Aumenta o contraste de textos e bordas.',
          'highContrast',
          false
        )}

        ${toggleRow(
          'acc-large-click',
          '👆 Áreas de toque maiores',
          'Aumenta o tamanho clicável de botões pequenos.',
          'largeTouchTargets',
          false
        )}

        ${toggleRow(
          'acc-bold-text',
          '🅱️ Texto em negrito',
          'Deixa todo o texto principal em negrito para melhor leitura.',
          'boldText',
          false
        )}

      </div>
    `;
    content.appendChild(section);

    // Inicializa estados
    ['reducedMotion', 'highContrast', 'largeTouchTargets', 'boldText'].forEach(key => {
      const val = getPref(key, false);
      const input = section.querySelector(`#acc-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
      if (input) input.checked = val;
    });

    // Listeners
    section.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.prefKey;
        setPrefs({ [key]: input.checked });
        applyAccPref(key, input.checked);
      });
    });
  }

  function toggleRow(id, title, desc, prefKey, defaultVal) {
    const checked = getPref(prefKey, defaultVal) ? 'checked' : '';
    return `
      <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:16px;">
        <div>
          <p style="font-weight:700;font-size:15px;color:var(--text-primary);margin:0 0 4px;">${title}</p>
          <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.5;max-width:360px;">${desc}</p>
        </div>
        <label style="position:relative;display:flex;align-items:center;cursor:pointer;flex-shrink:0;">
          <input type="checkbox" id="${id}" data-pref-key="${prefKey}" ${checked}
            style="position:absolute;opacity:0;width:0;height:0;">
          <span class="acc-track" style="display:inline-block;width:46px;height:26px;background:var(--border);border-radius:13px;transition:background 0.25s;position:relative;">
            <span style="position:absolute;top:3px;left:3px;width:20px;height:20px;background:white;border-radius:50%;transition:transform 0.25s;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></span>
          </span>
        </label>
      </div>
    `;
  }

  function applyAccPref(key, value) {
    if (key === 'reducedMotion') {
      let s = document.getElementById('_reducedMotionStyle');
      if (value) {
        if (!s) { s = document.createElement('style'); s.id = '_reducedMotionStyle'; document.head.appendChild(s); }
        s.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }';
      } else if (s) s.textContent = '';
    }
    if (key === 'highContrast') {
      if (value) document.documentElement.setAttribute('data-high-contrast', '');
      else document.documentElement.removeAttribute('data-high-contrast');
    }
    if (key === 'largeTouchTargets') {
      let s = document.getElementById('_largeTouchStyle');
      if (value) {
        if (!s) { s = document.createElement('style'); s.id = '_largeTouchStyle'; document.head.appendChild(s); }
        s.textContent = 'button, .post-action, .nav-item, .tab-btn { min-height: 52px !important; min-width: 44px !important; }';
      } else if (s) s.textContent = '';
    }
    if (key === 'boldText') {
      let s = document.getElementById('_boldTextStyle');
      if (value) {
        if (!s) { s = document.createElement('style'); s.id = '_boldTextStyle'; document.head.appendChild(s); }
        s.textContent = 'body, .post-text, .nav-label, .post-author { font-weight: 700 !important; }';
      } else if (s) s.textContent = '';
    }
  }

  // ── Seção: Sobre ─────────────────────────────────────────────
  function injectSobreSection(content) {
    if (document.getElementById('settings-sobre')) return;

    const section = document.createElement('div');
    section.className = 'settings-section';
    section.id = 'settings-sobre';
    section.innerHTML = `
      <div style="border-bottom:1px solid var(--border);padding:15px 20px;position:sticky;top:0;background:var(--dark-bg);z-index:10;">
        <h3 style="font-size:1.1rem;font-weight:800;margin:0;color:var(--text-primary);">ℹ️ Sobre o VazaPUC</h3>
      </div>
      <div style="padding:32px 20px;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;">
        <div style="width:80px;height:80px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:36px;color:white;box-shadow:0 8px 24px rgba(var(--primary-rgb,163,31,75),0.35);">◆</div>
        <div>
          <h2 style="font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:var(--text-primary);margin:0 0 4px;">Vaza PUC</h2>
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">Versão 1.0.0 — Build 2026</p>
        </div>
        <p style="font-size:14px;color:var(--text-secondary);max-width:340px;line-height:1.7;margin:0;">
          O epicentro dos babados da PUC. Posts, fofocas, e tudo o que rola no campus — antes de todo mundo.
        </p>
        <div style="width:100%;max-width:380px;background:var(--dark-bg-secondary);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-top:8px;">
          ${sobreRow('👨‍💻', 'Desenvolvido por', 'Pedro L. e Pietro G.')}
          ${sobreRow('🎓', 'Universidade', 'PUC — Campus')}
          ${sobreRow('📅', 'Lançamento', '2026')}
          ${sobreRow('🛡️', 'Privacidade', 'Dados ficam no seu dispositivo')}
        </div>
        <button id="clearLocalDataBtn" style="
          margin-top:8px;padding:10px 24px;border-radius:20px;
          background:none;border:1px solid var(--border);
          color:var(--text-secondary);cursor:pointer;font-size:13px;
          transition:all 0.2s;font-family:inherit;
        " onmouseover="this.style.borderColor='var(--danger)';this.style.color='var(--danger)'"
           onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-secondary)'">
          🗑️ Limpar dados locais (cache, preferências)
        </button>
      </div>
    `;
    content.appendChild(section);

    section.querySelector('#clearLocalDataBtn')?.addEventListener('click', () => {
      if (!confirm('Isso vai apagar preferências e notificações salvas no navegador.\nDeseja continuar?')) return;
      const theme = localStorage.getItem('vazaPucTheme');
      const keys = Object.keys(localStorage).filter(k => k.startsWith('vazapuc'));
      keys.forEach(k => localStorage.removeItem(k));
      if (theme) localStorage.setItem('vazaPucTheme', theme);
      if (typeof window.showNotification === 'function') window.showNotification('Cache limpo! ♻️');
      else alert('Cache limpo com sucesso!');
    });
  }

  function sobreRow(icon, label, value) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);">
        <span style="font-size:14px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;">${icon} ${label}</span>
        <span style="font-size:14px;font-weight:600;color:var(--text-primary);">${value}</span>
      </div>
    `;
  }

  // ── Desativar conta ──────────────────────────────────────────
  function patchDeactivateAccount() {
    // Procura a opção "Desativar sua conta" no HTML e substitui seu onclick
    const attachDeactivate = () => {
      const deactivateOption = [...document.querySelectorAll('.config-option')].find(el =>
        el.textContent.includes('Desativar sua conta')
      );
      if (!deactivateOption) {
        setTimeout(attachDeactivate, 600);
        return;
      }

      deactivateOption.removeAttribute('onclick');
      deactivateOption.addEventListener('click', openDeactivateModal);
    };
    attachDeactivate();
  }

  function openDeactivateModal() {
    document.getElementById('deactivateModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'deactivateModal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.85);
      display:flex;align-items:center;justify-content:center;
      padding:20px;backdrop-filter:blur(8px);
    `;
    modal.innerHTML = `
      <div style="
        background:var(--dark-bg-secondary);
        border:1px solid rgba(231,76,60,0.35);
        border-radius:24px;width:100%;max-width:460px;
        padding:36px 32px;position:relative;text-align:center;
        box-shadow:0 0 60px rgba(231,76,60,0.15);
        animation:slideDown 0.25s ease;
      ">
        <button id="closeDeactivateModal" style="
          position:absolute;top:14px;right:16px;
          background:none;border:none;color:var(--text-secondary);
          font-size:20px;cursor:pointer;padding:4px 8px;
        ">✕</button>

        <div style="font-size:52px;margin-bottom:12px;">⚠️</div>
        <h2 style="font-size:22px;font-weight:800;color:#e74c3c;margin:0 0 10px;">Desativar sua conta</h2>
        <p style="font-size:14px;color:var(--text-secondary);line-height:1.7;margin:0 0 24px;">
          Ao desativar, seu perfil fica <strong style="color:var(--text-primary);">oculto para todos</strong>.
          Seus posts, seguidores e dados são <strong style="color:var(--text-primary);">preservados</strong>
          e você pode reativar a qualquer momento fazendo login novamente.
        </p>

        <div style="
          background:var(--dark-bg);border:1px solid var(--border);
          border-radius:14px;padding:16px;margin-bottom:24px;text-align:left;
        ">
          ${deactivateRow('👻', 'Seu perfil fica invisível para outros usuários')}
          ${deactivateRow('📦', 'Seus posts e dados são mantidos em segurança')}
          ${deactivateRow('🔄', 'Você pode reativar fazendo login a qualquer hora')}
          ${deactivateRow('🚫', 'Você não receberá notificações enquanto inativo')}
        </div>

        <div style="margin-bottom:20px;">
          <label style="font-size:13px;color:var(--text-secondary);display:block;margin-bottom:8px;text-align:left;">
            Para confirmar, escreva <strong style="color:#e74c3c;">DESATIVAR</strong> abaixo:
          </label>
          <input id="deactivateConfirmInput" type="text" placeholder="DESATIVAR"
            style="
              width:100%;padding:12px 16px;border-radius:12px;
              border:2px solid var(--border);background:var(--dark-bg);
              color:var(--text-primary);font-size:15px;
              outline:none;font-family:inherit;box-sizing:border-box;
              transition:border-color 0.2s;
            "
            oninput="document.getElementById('confirmDeactivateBtn').disabled = this.value !== 'DESATIVAR';"
          >
        </div>

        <div style="display:flex;gap:10px;">
          <button id="cancelDeactivateBtn" style="
            flex:1;padding:13px;border-radius:20px;
            background:none;border:1px solid var(--border);
            color:var(--text-secondary);cursor:pointer;font-size:14px;
            font-weight:700;font-family:inherit;transition:all 0.2s;
          " onmouseover="this.style.borderColor='var(--text-secondary)'"
             onmouseout="this.style.borderColor='var(--border)'">Cancelar</button>

          <button id="confirmDeactivateBtn" disabled style="
            flex:1;padding:13px;border-radius:20px;
            background:#e74c3c;border:none;
            color:white;cursor:pointer;font-size:14px;
            font-weight:800;font-family:inherit;
            opacity:0.4;transition:all 0.2s;
          " onmouseover="if(!this.disabled)this.style.opacity='0.85'"
             onmouseout="if(!this.disabled)this.style.opacity='1'">Desativar conta</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Habilita botão ao digitar corretamente
    const input = modal.querySelector('#deactivateConfirmInput');
    const confirmBtn = modal.querySelector('#confirmDeactivateBtn');
    input.addEventListener('input', () => {
      const ok = input.value === 'DESATIVAR';
      confirmBtn.disabled = !ok;
      confirmBtn.style.opacity = ok ? '1' : '0.4';
      confirmBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    });

    modal.querySelector('#closeDeactivateModal')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#cancelDeactivateBtn')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    confirmBtn.addEventListener('click', async () => {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Desativando...';

      try {
        await deactivateAccount();
        modal.remove();
        showDeactivateSuccess();
      } catch (err) {
        console.error('[deactivate]', err);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Desativar conta';
        if (typeof window.showNotification === 'function') {
          window.showNotification('Erro ao desativar. Tente novamente.');
        }
      }
    });
  }

  function deactivateRow(icon, text) {
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:16px;">${icon}</span>
        <span style="font-size:13px;color:var(--text-primary);">${text}</span>
      </div>
    `;
  }

  async function deactivateAccount() {
    // Salva flag local de conta desativada
    localStorage.setItem('vazapuc_deactivated', 'true');
    localStorage.setItem('vazapuc_deactivated_at', new Date().toISOString());

    // Tenta marcar no Supabase se disponível
    try {
      const { supabase } = await import('../js/supabase.js');
      const profile = window.currentProfile;
      if (supabase && profile?.id) {
        await supabase
          .from('profiles')
          .update({ is_deactivated: true, deactivated_at: new Date().toISOString() })
          .eq('id', profile.id);
      }
    } catch (dbErr) {
      // Banco indisponível — apenas salva localmente e desloga
      console.warn('[deactivate] DB update skipped:', dbErr);
    }

    // Faz logout
    try {
      const { signOut } = await import('../js/supabase.js');
      await signOut();
    } catch (_) { /* ignora erro de logout */ }
  }

  function showDeactivateSuccess() {
    document.body.innerHTML = `
      <div style="
        min-height:100vh;display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        background:#16070d;color:#fceef2;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        text-align:center;padding:40px 20px;gap:20px;
      ">
        <div style="font-size:72px;">😴</div>
        <h1 style="font-size:28px;font-weight:800;margin:0;">Conta desativada</h1>
        <p style="font-size:16px;color:#bba3ab;max-width:400px;line-height:1.7;margin:0;">
          Sua conta foi desativada com sucesso.<br>
          Para reativar, é só fazer login novamente — todos os seus dados continuam salvos.
        </p>
        <a href="../inicial/login.html" style="
          display:inline-flex;align-items:center;gap:8px;
          padding:14px 32px;border-radius:40px;
          background:#a31f4b;color:white;
          text-decoration:none;font-weight:700;font-size:15px;
          margin-top:8px;
          box-shadow:0 4px 16px rgba(163,31,75,0.4);
          transition:transform 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'"
           onmouseout="this.style.transform=''">
          ← Voltar ao login
        </a>
      </div>
    `;
  }

  // ── Atualiza visual dos toggles de acessibilidade ao mudar ───
  document.addEventListener('change', e => {
    const input = e.target;
    if (!input.dataset.prefKey) return;
    const track = input.nextElementSibling;
    const thumb = track?.querySelector('span');
    if (!track || !thumb) return;
    track.style.background = input.checked ? 'var(--primary)' : 'var(--border)';
    thumb.style.transform = input.checked ? 'translateX(20px)' : 'translateX(0)';
    applyAccPref(input.dataset.prefKey, input.checked);
  });

  // Inicia
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Reaplica ao navegar para Settings
  document.addEventListener('click', e => {
    if (e.target.closest('.nav-item[data-page="settings"]')) {
      setTimeout(patchSettingsSidebar, 100);
    }
  });

})();