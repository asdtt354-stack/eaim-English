// EAIM 영어 플랫폼 Service Worker
// 캐시 버전 — 파일 수정 시 버전 번호를 올려주세요 (예: v2, v3 ...)
const CACHE_VERSION = 'eaim-english-v1';

// 오프라인에서도 작동할 파일 목록
const CACHE_FILES = [
  './',
  './index.html',
  './eaim-english-playground.html',
  './eaim-english-game.html',
  './guide.html',
  './manifest.json',
  // 폰트 (Google Fonts CDN — 온라인일 때 캐시됨)
  'https://fonts.googleapis.com/css2?family=Fredoka+One&family=Gaegu:wght@400;700&family=Noto+Sans+KR:wght@400;700;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&family=Noto+Sans+KR:wght@400;700&display=swap',
  // FontAwesome
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  // Tailwind (놀이터)
  'https://cdn.tailwindcss.com'
];

// ── Install: 캐시 저장 ──────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing EAIM v1...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // 핵심 HTML 파일은 반드시 캐시
      return cache.addAll([
        './',
        './index.html',
        './eaim-english-playground.html',
        './eaim-english-game.html',
        './guide.html',
        './manifest.json'
      ]).then(() => {
        // CDN 파일은 실패해도 설치 계속 진행
        return Promise.allSettled(
          CACHE_FILES.slice(6).map(url =>
            cache.add(url).catch(err => console.warn('[SW] CDN cache skip:', url))
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: 오래된 캐시 삭제 ──────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: 캐시 우선, 없으면 네트워크 ──────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Gemini API 요청은 캐시하지 않음 (항상 네트워크)
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return; // 브라우저 기본 처리에 맡김
  }

  // GET 요청만 캐시 처리
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // 캐시 히트 → 즉시 반환 + 백그라운드 업데이트 (stale-while-revalidate)
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, responseClone));
          }
          return networkResponse;
        }).catch(() => {}); // 오프라인이면 조용히 실패
        return cached;
      }

      // 캐시 미스 → 네트워크 요청 후 캐시에 저장
      return fetch(request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, responseClone));
        return networkResponse;
      }).catch(() => {
        // 완전 오프라인 + 캐시 없음 → 오프라인 안내
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── 업데이트 알림 (선택) ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
