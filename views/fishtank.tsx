/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";
import { GoogleAnalytics } from "./components/ga.tsx";
interface FishtankProps {
  urls: string[];
}

export const FishtankPage: FC<FishtankProps> = ({ urls }) => {
  const urlsJson = JSON.stringify(urls).replace(/</g, "\\u003c");
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="A fishtank viewer of hacker homepages."
        />
        <title>Fishtank · The Hacker's Directory</title>
        <link rel="icon" href="/static/favicon.png" type="image/png" />
        <link rel="stylesheet" href="/static/styles.css" />
        <GoogleAnalytics />
      </head>
      <body class="fishtank-page">
        <header class="fishtank-nav">
          <div class="fishtank-brand">
            <a href="/">The Hacker's Directory</a>
          </div>
          <div class="fishtank-controls">
            <button type="button" class="fishtank-btn" data-dir="-1">
              Prev
            </button>
            <button type="button" class="fishtank-btn" data-dir="1">
              Next
            </button>
            <button type="button" class="fishtank-btn" data-action="shuffle">
              Shuffle
            </button>
            <button
              type="button"
              id="fishtank-like"
              class="heart-btn fishtank-like"
              aria-label="Like"
            >
              &#9825;
            </button>
          </div>
          <div class="fishtank-meta">
            <span id="fishtank-count">0 / 0</span>
            <span id="fishtank-likes" class="fishtank-likes">0 likes</span>
            <a
              id="fishtank-open"
              href="/"
              target="_blank"
              rel="noopener"
            >
              Open
            </a>
          </div>
        </header>

        <main class="fishtank-stage">
          <div id="fishtank-status" class="fishtank-status">
            Loading...
          </div>
          <iframe
            id="fishtank-frame"
            title="Fishtank site"
            referrerpolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          >
          </iframe>
        </main>

        <script
          dangerouslySetInnerHTML={{
            __html: `
          document.addEventListener('DOMContentLoaded', function() {
            var urls = ${urlsJson};
            var page = 1;
            var totalPages = 1;
            var loading = false;

            var frame = document.getElementById('fishtank-frame');
            var status = document.getElementById('fishtank-status');
            var count = document.getElementById('fishtank-count');
            var likeCount = document.getElementById('fishtank-likes');
            var open = document.getElementById('fishtank-open');
            var buttons = document.querySelectorAll('.fishtank-btn');
            var likeButton = document.getElementById('fishtank-like');
            var currentIndex = 0;
            var loadTimer = null;
            var loadToken = 0;
            var skipCount = 0;

            function setStatus(message) {
              if (status) status.textContent = message || '';
            }

            function updateMeta() {
              if (!count) return;
              count.textContent = (currentIndex + 1) + ' / ' + urls.length;
            }

            function safeShuffle() {
              for (var i = urls.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = urls[i];
                urls[i] = urls[j];
                urls[j] = temp;
              }
              currentIndex = 0;
            }

            function looksBlocked() {
              try {
                var href = frame.contentWindow.location.href;
                if (href === 'about:blank') return true;
                if (href.indexOf('chrome-error://') === 0) return true;
                var body = frame.contentDocument && frame.contentDocument.body;
                if (!body) return false;
                var text = body.innerText || '';
                return /refused to connect|blocked|denied/i.test(text);
              } catch (_err) {
                return false;
              }
            }

            function loadIndex(index) {
              if (!frame) return;
              loadToken += 1;
              var token = loadToken;
              currentIndex = (index + urls.length) % urls.length;
              var url = urls[currentIndex];
              if (open) open.href = url;
              updateMeta();
              setStatus('Loading...');
              frame.src = url;
              if (likeButton) {
                likeButton.classList.add('loading');
                likeButton.classList.remove('liked');
                likeButton.innerHTML = '&#9825;';
                likeButton.setAttribute('aria-label', 'Like');
                likeButton.dataset.url = encodeURIComponent(url);
              }
              if (likeCount) likeCount.textContent = '...';
              fetch('/like/status?url=' + encodeURIComponent(url))
                .then(function(response) { return response.json(); })
                .then(function(data) {
                  if (likeCount) {
                    likeCount.textContent = (data.count || 0) + ' likes';
                  }
                  if (likeButton) {
                    likeButton.classList.remove('loading');
                    if (data.liked) {
                      likeButton.classList.add('liked');
                      likeButton.innerHTML = '&#9829;';
                      likeButton.setAttribute('aria-label', 'Unlike');
                    } else {
                      likeButton.classList.remove('liked');
                      likeButton.innerHTML = '&#9825;';
                      likeButton.setAttribute('aria-label', 'Like');
                    }
                  }
                })
                .catch(function() {
                  if (likeButton) likeButton.classList.remove('loading');
                  if (likeCount) likeCount.textContent = '0 likes';
                });

              if (loadTimer) clearTimeout(loadTimer);
              loadTimer = setTimeout(function() {
                if (token !== loadToken) return;
                skipCount += 1;
                if (skipCount >= urls.length) {
                  setStatus('No embeddable sites found.');
                  return;
                }
                setStatus('Skipping site (iframe blocked)');
                loadIndex(currentIndex + 1);
              }, 5000);
            }

            function maybePrefetch() {
              if (loading) return;
              if (page >= totalPages) return;
              if (urls.length - currentIndex > 6) return;
              loading = true;
              fetch('/fishtank/links?page=' + (page + 1) + '&perPage=200')
                .then(function(response) { return response.json(); })
                .then(function(data) {
                  if (Array.isArray(data.urls) && data.urls.length) {
                    data.urls.forEach(function(url) {
                      urls.push(url);
                    });
                  }
                  page = data.page || page + 1;
                  totalPages = data.totalPages || totalPages;
                  loading = false;
                })
                .catch(function() {
                  loading = false;
                });
            }

            frame.addEventListener('load', function() {
              if (loadTimer) {
                clearTimeout(loadTimer);
                loadTimer = null;
              }
              if (looksBlocked()) {
                skipCount += 1;
                if (skipCount >= urls.length) {
                  setStatus('No embeddable sites found.');
                  return;
                }
                setStatus('Skipping site (iframe blocked)');
                loadIndex(currentIndex + 1);
                return;
              }
              skipCount = 0;
              setStatus('');
              maybePrefetch();
            });

            buttons.forEach(function(btn) {
              btn.addEventListener('click', function() {
                var dir = parseInt(btn.dataset.dir || '0', 10);
                var action = btn.dataset.action;
                if (action === 'shuffle') {
                  safeShuffle();
                  skipCount = 0;
                  loadIndex(0);
                  return;
                }
                if (!dir) return;
                skipCount = 0;
                loadIndex(currentIndex + dir);
              });
            });

            if (likeButton) {
              likeButton.addEventListener('click', function() {
                var encodedUrl = likeButton.dataset.url || '';
                if (!encodedUrl) return;
                var url = decodeURIComponent(encodedUrl);
                fetch('/like', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: url })
                })
                  .then(function(response) { return response.json(); })
                  .then(function(data) {
                    if (likeCount) {
                      likeCount.textContent = (data.count || 0) + ' likes';
                    }
                    if (data.liked) {
                      likeButton.classList.add('liked');
                      likeButton.innerHTML = '&#9829;';
                      likeButton.setAttribute('aria-label', 'Unlike');
                    } else {
                      likeButton.classList.remove('liked');
                      likeButton.innerHTML = '&#9825;';
                      likeButton.setAttribute('aria-label', 'Like');
                    }
                  })
                  .catch(function(err) {
                    console.error('Failed to toggle like:', err);
                  });
              });
            }

            function startPlayback() {
              if (!urls.length) {
                setStatus('No sites found.');
                return;
              }
              safeShuffle();
              loadIndex(0);
            }

            if (!urls.length) {
              setStatus('Loading sites...');
              fetch('/fishtank/links?page=1&perPage=200')
                .then(function(response) { return response.json(); })
                .then(function(data) {
                  urls = Array.isArray(data.urls) ? data.urls : [];
                  page = data.page || 1;
                  totalPages = data.totalPages || 1;
                  startPlayback();
                })
                .catch(function() {
                  setStatus('Failed to load sites.');
                });
              return;
            }

            startPlayback();
          });
        `,
          }}
        />
      </body>
    </html>
  );
};
