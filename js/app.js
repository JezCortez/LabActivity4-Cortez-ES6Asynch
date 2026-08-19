'use strict';

/* ==========================================================================
   Lab Activity 4 — ES6+ & Asynchronous JavaScript
   Data source: https://jsonplaceholder.typicode.com/  (/posts, /users, /comments)

   Each section below is labelled with the concept it demonstrates so it is
   easy to map back to the Week 4 lecture deck.
   ========================================================================== */

// ---- Template literals for endpoint construction --------------------------
const API_BASE = 'https://jsonplaceholder.typicode.com';
const POSTS_URL = `${API_BASE}/posts`;
const USERS_URL = `${API_BASE}/users`;
const commentsUrl = (postId) => `${API_BASE}/posts/${postId}/comments`;

// ---- Central app state (kept in one place, updated immutably) ------------
const state = {
  posts: [],
  usersById: new Map(),
  commentsCache: new Map(), // postId -> comments array, avoids re-fetching
  openReplies: new Set(),   // postIds currently expanded
  search: '',
  correspondent: 'all',
  sort: 'newest',
};

// ---- DOM handles -----------------------------------------------------------
const els = {
  ticker: document.getElementById('tickerTrack'),
  lampDot: document.getElementById('lampDot'),
  statusText: document.getElementById('statusText'),
  searchInput: document.getElementById('searchInput'),
  correspondentSelect: document.getElementById('correspondentSelect'),
  sortSelect: document.getElementById('sortSelect'),
  refreshBtn: document.getElementById('refreshBtn'),
  sendBtn: document.getElementById('sendBtn'),
  statsStrip: document.getElementById('statsStrip'),
  feedStatus: document.getElementById('feedStatus'),
  feed: document.getElementById('feed'),
  sendDialog: document.getElementById('sendDialog'),
  sendForm: document.getElementById('sendForm'),
  cancelSendBtn: document.getElementById('cancelSendBtn'),
  authorField: document.getElementById('authorField'),
};

/* ==========================================================================
   1. FETCH HELPER — Fetch API + Promises + custom error throwing
   fetch() only rejects on a network failure, so we check res.ok ourselves
   and throw a real Error for bad HTTP statuses (Week 4, slide 13).
   ========================================================================== */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Request to ${url} failed: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/* ==========================================================================
   2. INITIAL LOAD — async/await + try/catch + Promise.all
   Posts and users are independent requests, so they run in parallel instead
   of one-after-another (a small optimization over sequential awaits).
   ========================================================================== */
async function loadBoard() {
  setStatus('loading');
  try {
    const [posts, users] = await Promise.all([
      fetchJSON(POSTS_URL),
      fetchJSON(USERS_URL),
    ]);

    state.posts = posts;
    // Map built with .map() + spread-friendly entries — O(1) author lookups
    state.usersById = new Map(users.map((u) => [u.id, u]));
    state.commentsCache.clear();
    state.openReplies.clear();

    populateCorrespondentFilter(users);
    populateAuthorField(users);
    renderStats();
    renderFeed();
    updateTicker();
    setStatus('live');
  } catch (err) {
    console.error(err);
    setStatus('error', err);
    renderFeedError(err);
  }
}

/* ==========================================================================
   3. FILTER DROPDOWNS — destructuring + template literals + spread/Set
   ========================================================================== */
function populateCorrespondentFilter(users) {
  const { correspondentSelect } = els;
  correspondentSelect.innerHTML = '<option value="all">All correspondents</option>';

  // Sort a *copy* of the array so we never mutate the fetched data (spread)
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  for (const { id, name } of sortedUsers) {
    const option = document.createElement('option');
    option.value = String(id);
    option.textContent = name;
    correspondentSelect.appendChild(option);
  }
}

function populateAuthorField(users) {
  els.authorField.innerHTML = users
    .map(({ id, name }) => `<option value="${id}">${escapeHtml(name)}</option>`)
    .join('');
}

/* ==========================================================================
   4. DERIVED / VISIBLE POSTS — .filter() + .sort() chained, arrow fns
   ========================================================================== */
function getVisiblePosts() {
  const term = state.search.trim().toLowerCase();

  const filtered = state.posts.filter(({ title, body, userId }) => {
    const matchesSearch =
      term === '' || title.toLowerCase().includes(term) || body.toLowerCase().includes(term);
    const matchesCorrespondent =
      state.correspondent === 'all' || String(userId) === state.correspondent;
    return matchesSearch && matchesCorrespondent;
  });

  // Sort a copy (spread) — never mutate state.posts in place
  const sorted = [...filtered].sort((a, b) => {
    if (state.sort === 'newest') return b.id - a.id;
    if (state.sort === 'oldest') return a.id - b.id;
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    return 0;
  });

  return sorted;
}

/* ==========================================================================
   5. STATS STRIP — .reduce() for aggregation
   ========================================================================== */
function renderStats() {
  const { posts, usersById } = state;

  // reduce() -> { [userId]: count } tally of dispatches per correspondent
  const countsByUser = posts.reduce((acc, { userId }) => {
    acc[userId] = (acc[userId] ?? 0) + 1;
    return acc;
  }, {});

  const topUserId = Object.keys(countsByUser).reduce(
    (leaderId, id) => (countsByUser[id] > (countsByUser[leaderId] ?? 0) ? id : leaderId),
    null
  );

  // reduce() -> average headline length, rounded
  const avgTitleLength = posts.length
    ? Math.round(posts.reduce((sum, { title }) => sum + title.length, 0) / posts.length)
    : 0;

  const topName = topUserId ? usersById.get(Number(topUserId))?.name ?? 'Unknown' : '—';

  const stats = [
    { label: 'Dispatches on wire', value: posts.length },
    { label: 'Correspondents', value: usersById.size },
    { label: 'Avg. headline length', value: `${avgTitleLength} ch` },
    { label: 'Most active byline', value: topName },
  ];

  els.statsStrip.innerHTML = stats
    .map(
      ({ label, value }) => `
      <div class="stat-card">
        <span class="stat-value">${escapeHtml(String(value))}</span>
        <span class="stat-label">${escapeHtml(label)}</span>
      </div>`
    )
    .join('');
}

/* ==========================================================================
   6. FEED RENDERING — .map() + template literals + default params
   ========================================================================== */
function truncate(text, max = 220) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function renderFeed() {
  const visible = getVisiblePosts();

  els.feedStatus.textContent = `Showing ${visible.length} of ${state.posts.length} dispatches`;

  if (visible.length === 0) {
    els.feed.innerHTML = `<div class="feed-empty">No dispatches match this filter. Try clearing the search.</div>`;
    return;
  }

  els.feed.innerHTML = visible.map(renderCard).join('');
}

function renderCard({ id, title, body, userId }) {
  // Destructure with a default so a missing/unmapped author never breaks the UI
  const { name = 'Unknown correspondent', email = '' } = state.usersById.get(userId) ?? {};
  const isOpen = state.openReplies.has(id);
  const cached = state.commentsCache.get(id);

  return `
    <article class="dispatch-card" data-post-id="${id}">
      <div class="dispatch-head">
        <h3 class="dispatch-title">${escapeHtml(title)}</h3>
        <span class="dispatch-id">#${id}</span>
      </div>
      <p class="dispatch-byline">${escapeHtml(name)}${email ? ` · ${escapeHtml(email)}` : ''}</p>
      <p class="dispatch-body">${escapeHtml(truncate(body))}</p>
      <div class="dispatch-actions">
        <button type="button" class="link-btn" data-action="toggle-replies" data-post-id="${id}">
          ${isOpen ? 'Hide responses ▲' : 'View responses ▼'}
        </button>
      </div>
      <div class="replies ${isOpen ? 'open' : ''}" data-replies-for="${id}">
        ${isOpen ? renderRepliesContent(id, cached) : ''}
      </div>
    </article>
  `;
}

function renderRepliesContent(postId, comments) {
  if (!comments) {
    return `<p class="replies-status">Loading responses…</p>`;
  }
  if (comments.length === 0) {
    return `<p class="replies-status">No responses yet.</p>`;
  }
  // .map() over a nested async-fetched resource, joined into one string
  return comments
    .map(
      ({ name, email, body }) => `
      <div class="reply">
        <strong>${escapeHtml(name)}</strong> — <span>${escapeHtml(email)}</span>
        <p>${escapeHtml(body)}</p>
      </div>`
    )
    .join('');
}

/* ==========================================================================
   7. LAZY-LOADED COMMENTS — async/await triggered by a user event,
   cached in a Map so re-opening a card never re-fetches.
   ========================================================================== */
async function toggleReplies(postId) {
  const isOpen = state.openReplies.has(postId);

  if (isOpen) {
    state.openReplies.delete(postId);
    renderFeed();
    return;
  }

  state.openReplies.add(postId);
  renderFeed(); // show "Loading responses…" immediately

  if (state.commentsCache.has(postId)) return; // already cached, nothing to fetch

  try {
    const comments = await fetchJSON(commentsUrl(postId));
    state.commentsCache.set(postId, comments);
  } catch (err) {
    console.error(err);
    state.commentsCache.set(postId, []); // fail soft: show "no responses" rather than crash
  } finally {
    renderFeed();
  }
}

/* ==========================================================================
   8. SEND DISPATCH — async/await + fetch POST with a JSON body,
   optimistic UI update using spread (never mutating state.posts directly)
   ========================================================================== */
async function sendDispatch({ title, body, userId }) {
  const payload = { title, body, userId: Number(userId) };

  const res = await fetch(POSTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Could not send dispatch: HTTP ${res.status}`);
  }

  const saved = await res.json(); // JSONPlaceholder echoes back an id: 101

  // Rest/spread: build a new array rather than mutating the old one
  state.posts = [{ ...payload, id: saved.id ?? Date.now() }, ...state.posts];
  renderStats();
  renderFeed();
  updateTicker();
}

/* ==========================================================================
   9. TICKER + STATUS LAMP — small UI-state helpers
   ========================================================================== */
function updateTicker() {
  const time = new Date().toLocaleTimeString();
  const message = `// ${state.posts.length} DISPATCHES ON WIRE · ${state.usersById.size} CORRESPONDENTS · LAST SYNC ${time} // JEZ CORTEZ`;
  // Repeated twice back-to-back so the CSS marquee loop has no visible seam
  els.ticker.textContent = `${message}   ${message}`;
}

function setStatus(kind, err) {
  els.lampDot.classList.remove('live', 'error');
  if (kind === 'loading') {
    els.statusText.textContent = 'Connecting…';
  } else if (kind === 'live') {
    els.lampDot.classList.add('live');
    els.statusText.textContent = 'Live';
  } else if (kind === 'error') {
    els.lampDot.classList.add('error');
    els.statusText.textContent = `Offline — ${err?.message ?? 'unknown error'}`;
  }
}

function renderFeedError(err) {
  els.feedStatus.textContent = '';
  els.feed.innerHTML = `
    <div class="feed-error">
      Could not reach the wire (${escapeHtml(err.message)}).
      <br /><button type="button" class="link-btn" id="retryBtn">Retry connection</button>
    </div>`;
  document.getElementById('retryBtn')?.addEventListener('click', loadBoard);
}

/* ==========================================================================
   10. UTIL — escape any API text before it touches innerHTML
   ========================================================================== */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   11. EVENT WIRING — arrow functions + event delegation (carried over
   from the Week 3 DOM lab: one listener on the feed container, not one
   per card).
   ========================================================================== */
let searchDebounce;
els.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const { value } = e.target;
  searchDebounce = setTimeout(() => {
    state.search = value;
    renderFeed();
  }, 200);
});

els.correspondentSelect.addEventListener('change', (e) => {
  state.correspondent = e.target.value;
  renderFeed();
});

els.sortSelect.addEventListener('change', (e) => {
  state.sort = e.target.value;
  renderFeed();
});

els.refreshBtn.addEventListener('click', () => loadBoard());

// Event delegation: one listener handles every "view responses" click
els.feed.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="toggle-replies"]');
  if (!btn) return;
  const postId = Number(btn.dataset.postId);
  toggleReplies(postId);
});

els.sendBtn.addEventListener('click', () => els.sendDialog.showModal());
els.cancelSendBtn.addEventListener('click', () => els.sendDialog.close());

els.sendForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(els.sendForm);
  const { title, body, userId } = Object.fromEntries(formData.entries());

  if (!title.trim() || !body.trim()) return;

  const confirmBtn = document.getElementById('confirmSendBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Transmitting…';

  try {
    await sendDispatch({ title, body, userId });
    els.sendDialog.close();
    els.sendForm.reset();
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Transmit';
  }
});

// Refresh the ticker clock periodically even without new data
setInterval(updateTicker, 30000);

/* ==========================================================================
   12. BOOT
   ========================================================================== */
loadBoard();
