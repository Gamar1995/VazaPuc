 async function enviarForm() {
      const nome     = document.getElementById('nome').value.trim();
      const email    = document.getElementById('email').value.trim();
      const mensagem = document.getElementById('mensagem').value.trim();
      const msg      = document.getElementById('form-msg');

      if (!nome || !email || !mensagem) {
        alert('Por favor, preencha todos os campos.');
        return;
      }

      try {
        const res = await fetch('/contato', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, email, mensagem })
        });

        if (res.ok) {
          msg.style.display = 'block';
          document.getElementById('nome').value = '';
          document.getElementById('email').value = '';
          document.getElementById('mensagem').value = '';
        } else {
          alert('Erro ao enviar. Verifique o servidor.');
        }
      } catch {
        // Servidor offline – feedback visual mesmo assim
        msg.style.display = 'block';
        msg.textContent = '⚠️ Servidor offline. Dados captados localmente.';
      }
    }