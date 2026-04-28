// ============================================================
// SISTEMA DE TEMAS DE CORES
// ============================================================
function setupTemas() {
  const btnAbrirTemas = document.getElementById('btnAbrirTemas');
  const modalTemas = document.getElementById('modalTemas');
  const closeModalTemas = document.getElementById('closeModalTemas');
  const themeOptions = document.querySelectorAll('.theme-option');

  // 1. Carregar tema salvo no LocalStorage ao abrir o site
  const temaSalvo = localStorage.getItem('vazaPucTheme') || 'padrao';
  aplicarTema(temaSalvo);

  // 2. Abrir e Fechar o Modal
  btnAbrirTemas?.addEventListener('click', (e) => {
    e.preventDefault();
    modalTemas.classList.add('active');
  });

  closeModalTemas?.addEventListener('click', () => {
    modalTemas.classList.remove('active');
  });

  // Fecha clicando fora
  modalTemas?.addEventListener('click', (e) => {
    if (e.target === modalTemas) modalTemas.classList.remove('active');
  });

  // 3. Lógica de clique nas bolinhas de cor
  themeOptions.forEach(opcao => {
    opcao.addEventListener('click', () => {
      const temaEscolhido = opcao.getAttribute('data-theme');
      aplicarTema(temaEscolhido);
      localStorage.setItem('vazaPucTheme', temaEscolhido); // Salva no navegador
    });
  });

  // 4. Função que altera as cores e dá feedback visual (borda branca na bolinha)
  function aplicarTema(tema) {
    // Se for 'padrao', remove o data-theme para usar o CSS original. Se não, aplica o atributo.
    if (tema === 'padrao') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', tema);
    }

    // Feedback visual de seleção no modal
    themeOptions.forEach(opt => opt.style.borderColor = 'transparent');
    const opcaoAtiva = document.querySelector(`.theme-option[data-theme="${tema}"]`);
    if (opcaoAtiva) {
      opcaoAtiva.style.borderColor = '#ffffff';
    }
  }
}

// Inicializa o setup dos temas assim que possível
setupTemas();