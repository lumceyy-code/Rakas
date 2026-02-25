const searchToggle = document.getElementById('search-toggle');
const searchIsland = document.getElementById('search-island');
const searchInput = document.getElementById('search');
const platformFilters = document.getElementById('platform-filters');
const genreFilters = document.getElementById('genre-filters');
const content = document.getElementById('content');
const cloudDownload = document.getElementById('cloud-download');
const video = document.getElementById('video');
const streamStatus = document.getElementById('stream-status');
const reportIssueBtn = document.getElementById('report-issue');

const WATCH_KEY = 'pirater.watch.v1';
const FINISH_KEY = 'pirater.finish.v1';
const PROFILE_KEY = 'pirater.profile.v1';
const DEVICE_KEY = 'pirater.device.v1';

const state = {
  items: [],
  platforms: [],
  genres: [],
  activeTab: 'discover',
  selectedPlatforms: new Set(),
  selectedGenres: new Set(),
  query: '',
  currentItem: null,
  profileId: localStorage.getItem(PROFILE_KEY) || crypto.randomUUID(),
  deviceId: localStorage.getItem(DEVICE_KEY) || crypto.randomUUID()
};

localStorage.setItem(PROFILE_KEY, state.profileId);
localStorage.setItem(DEVICE_KEY, state.deviceId);

const watched = JSON.parse(localStorage.getItem(WATCH_KEY) || '{}');
const finished = JSON.parse(localStorage.getItem(FINISH_KEY) || '{}');

let hls;
let heartbeatTimer;

function setStreamStatus(text) {
  streamStatus.textContent = text;
}

function persistLocal() {
  localStorage.setItem(WATCH_KEY, JSON.stringify(watched));
  localStorage.setItem(FINISH_KEY, JSON.stringify(finished));
}

async function syncPlaybackState(payload) {
  try {
    await fetch('/api/playback-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    // non-fatal offline state
  }
}

async function loadPlaybackState() {
  try {
    const res = await fetch(`/api/playback-state?profileId=${encodeURIComponent(state.profileId)}`);
    if (!res.ok) return;
    const rows = await res.json();
    if (!Array.isArray(rows)) return;

    for (const row of rows) {
      watched[row.metadata_id] = {
        season: row.season || 1,
        episode: row.episode || 1,
        minutes: Math.floor((row.position_seconds || 0) / 60)
      };
      if (row.status === 'finished') finished[row.metadata_id] = true;
    }

    persistLocal();
  } catch {
    // ignore sync errors in offline mode
  }
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    if (!state.currentItem || video.paused) return;

    const payload = {
      profile_id: state.profileId,
      device_id: state.deviceId,
      metadata_id: state.currentItem.id,
      season: watched[state.currentItem.id]?.season || 1,
      episode: watched[state.currentItem.id]?.episode || 1,
      position_seconds: Math.floor(video.currentTime || 0),
      status: 'watching'
    };

    await fetch('/api/playback-heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }, 30_000);
}

function chip(label, set, root, rerender) {
  const button = document.createElement('button');
  button.className = 'chip';
  button.textContent = label;
  button.addEventListener('click', () => {
    if (set.has(label)) set.delete(label); else set.add(label);
    button.classList.toggle('active', set.has(label));
    rerender();
  });
  root.appendChild(button);
}

function currentItems() {
  if (state.activeTab === 'watching') {
    return state.items.filter((item) => watched[item.id] && !finished[item.id]);
  }
  if (state.activeTab === 'finished') {
    return state.items.filter((item) => finished[item.id]);
  }

  return state.items.filter((item) => {
    const q = state.query.toLowerCase();
    const queryMatch = !q || [item.title, ...item.genres, ...item.platforms].join(' ').toLowerCase().includes(q);
    const platformMatch = !state.selectedPlatforms.size || item.platforms.some((p) => state.selectedPlatforms.has(p));
    const genreMatch = !state.selectedGenres.size || item.genres.some((g) => state.selectedGenres.has(g));
    return queryMatch && platformMatch && genreMatch;
  });
}

function progressText(item) {
  const pos = watched[item.id];
  if (!pos) return 'Not started';
  return `Resume: S${pos.season}E${pos.episode} @ ${pos.minutes}m`;
}

async function playRemote(item) {
  try {
    state.currentItem = item;
    setStreamStatus(`Resolving remote source for ${item.title}...`);
    const res = await fetch(`/api/resolve?id=${encodeURIComponent(item.id)}`);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      setStreamStatus(`Resolver failed: ${detail.error || `HTTP ${res.status}`}`);
      return;
    }

    const data = await res.json();
    const source = data.proxyUrl;
    if (hls) {
      hls.destroy();
      hls = undefined;
    }

    if (window.Hls?.isSupported()) {
      hls = new window.Hls({
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        maxBufferLength: 20
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        setStreamStatus(`Now playing via source: ${data.source}`);
        video.play().catch(() => {});
        startHeartbeat();
      });
      hls.on(window.Hls.Events.ERROR, (_, event) => {
        setStreamStatus(`HLS error: ${event.type} / ${event.details}`);
      });
    } else {
      video.src = source;
      video.play().catch(() => {});
      setStreamStatus(`Native playback via source: ${data.source}`);
      startHeartbeat();
    }
  } catch (err) {
    setStreamStatus(`Resolver request error: ${err.message}`);
  }
}

function render() {
  content.innerHTML = '';
  const template = document.getElementById('card-template');

  for (const item of currentItems()) {
    const node = template.content.cloneNode(true);
    node.querySelector('img').src = item.poster;
    node.querySelector('img').alt = item.title;
    node.querySelector('h4').textContent = item.title;
    node.querySelector('.sub').textContent = `${item.year} • ${item.type.toUpperCase()} • ${item.platforms.join(', ')}`;
    node.querySelector('.overview').textContent = item.overview;
    node.querySelector('.resume').textContent = progressText(item);

    node.querySelector('[data-action="play"]').onclick = () => playRemote(item);

    node.querySelector('[data-action="resume"]').onclick = async () => {
      const base = watched[item.id] || { season: 1, episode: 1, minutes: 0 };
      watched[item.id] = {
        season: base.season,
        episode: base.episode,
        minutes: Math.min(base.minutes + 12, 58)
      };
      persistLocal();
      await syncPlaybackState({
        profile_id: state.profileId,
        device_id: state.deviceId,
        metadata_id: item.id,
        season: watched[item.id].season,
        episode: watched[item.id].episode,
        position_seconds: watched[item.id].minutes * 60,
        status: 'watching'
      });
      render();
    };

    node.querySelector('[data-action="finish"]').onclick = async () => {
      finished[item.id] = true;
      if (!watched[item.id]) watched[item.id] = { season: 1, episode: 1, minutes: 58 };
      persistLocal();
      await syncPlaybackState({
        profile_id: state.profileId,
        device_id: state.deviceId,
        metadata_id: item.id,
        season: watched[item.id].season,
        episode: watched[item.id].episode,
        position_seconds: watched[item.id].minutes * 60,
        status: 'finished'
      });
      render();
    };

    node.querySelector('[data-action="download"]').onclick = () => {
      if (!cloudDownload.checked) {
        alert('Enable cloud download request from filters first.');
        return;
      }
      alert(`Queued cloud download request for ${item.title} (placeholder flow).`);
    };

    content.appendChild(node);
  }
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.tab;
      render();
    });
  });
}

async function init() {
  const res = await fetch('/api/catalog');
  const data = await res.json();
  state.items = data.items;
  state.platforms = data.platforms;
  state.genres = data.genres;

  state.platforms.forEach((name) => chip(name, state.selectedPlatforms, platformFilters, render));
  state.genres.forEach((name) => chip(name, state.selectedGenres, genreFilters, render));

  await loadPlaybackState();
  setupTabs();
  render();
}

function openSearch() {
  searchIsland.classList.add('open');
  searchIsland.animate(
    [
      { transform: 'translate3d(0,-18px,0) scale(0.86)', opacity: 0 },
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 }
    ],
    { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
  );
  searchInput.focus();
}

searchToggle.addEventListener('click', () => {
  if (searchIsland.classList.contains('open')) searchIsland.classList.remove('open');
  else openSearch();
});

window.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== searchInput) {
    event.preventDefault();
    openSearch();
  }
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value.trim();
  render();
});

reportIssueBtn.addEventListener('click', async () => {
  if (!state.currentItem) {
    alert('Play a title first, then report an issue.');
    return;
  }

  await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadataId: state.currentItem.id, reason: 'dead_link' })
  });
  setStreamStatus(`Issue reported for ${state.currentItem.title}. Refresh queued.`);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

init();
