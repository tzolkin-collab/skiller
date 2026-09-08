const CACHE = 'skiller-v1';
const OFFLINE = ['/offline'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // `addAll` REJEITA se qualquer recurso nao responder ok — e install que
      // rejeita nunca ativa o worker. Era o caso: `/offline` batia no
      // middleware de idioma, virava 307 para `/pt/offline`, que nao existe, e
      // o 404 derrubava a instalacao inteira. Resultado: nenhum service worker
      // ativo em lugar nenhum, PWA sem offline e `serviceWorker.ready`
      // pendurado para sempre.
      //
      // Cache e' otimizacao; presenca do worker e' requisito (push depende
      // dele). Falha de cache nao pode custar o worker.
      .then((c) => c.addAll(OFFLINE).catch((err) => {
        console.warn('[sw] cache offline falhou, seguindo sem ele:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/offline'))
    );
  }
});

// ---------------------------------------------------------------------------
// Web Push
//
// No iPhone isto so' roda com o PWA instalado na tela de inicio. Em aba do
// Safari o evento nunca chega, por mais que a permissao tenha sido concedida.
// ---------------------------------------------------------------------------

self.addEventListener('push', (e) => {
  // Payload proprio e' o caso normal, mas o servico de push pode entregar um
  // aviso sem corpo. Cair para um texto generico e' melhor que nao mostrar
  // nada: `userVisibleOnly` obriga a exibir alguma coisa, e nao exibir custa a
  // permissao do site no navegador.
  let dados = { title: 'Skiller', body: 'Você tem uma novidade.', url: '/pt/dashboard' };
  try {
    if (e.data) dados = { ...dados, ...e.data.json() };
  } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: '/skiller-google-logo.png',
      badge: '/skiller-google-logo.png',
      // `tag` igual substitui o aviso anterior em vez de empilhar: cinco
      // "escolha as fontes" da mesma sessao viram um.
      tag: dados.tag || undefined,
      data: { url: dados.url },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/pt/dashboard';

  // Reaproveita uma janela ja' aberta em vez de abrir outra: quem tem o painel
  // no fundo espera ser levado ate' la', nao ganhar uma segunda copia.
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.includes(destino) && 'focus' in j) return j.focus();
      }
      for (const j of janelas) {
        if ('navigate' in j && 'focus' in j) return j.navigate(destino).then((c) => c && c.focus());
      }
      return self.clients.openWindow(destino);
    })
  );
});
