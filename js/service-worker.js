const CACHE_NAME = 'vazapuc-cache-v1';

// ATUALIZE APENAS ESSE BLOCO ABAIXO NO SEU ARQUIVO:
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/Pagina_Principal.css',
  './css/mobile-responsividade.css',
  './js/supabase.js',
  './js/posts.js',
  './js/home.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@300;400;500;600;700&display=swap'
];
// Instalação do Service Worker e armazenamento inicial da cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigas se atualizares o site
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceção de requisições: Estratégia Cache-First (com atualização em background)
self.addEventListener('fetch', (e) => {
  // 🔥 CRÍTICO: Ignora requisições para a API Rest/Realtime do Supabase. 
  // O banco de dados precisa de ser sempre consultado em tempo real na internet.
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Se o ficheiro estiver na cache, entrega-o imediatamente...
        // ...mas procura uma versão nova na rede em paralelo para atualizar a cache do próximo acesso.
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {/* Silencia falhas de rede offline */});
        
        return cachedResponse;
      }
      // Se não estiver na cache, vai buscar normalmente à internet
      return fetch(e.request);
    })
  );
});