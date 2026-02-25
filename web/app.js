const cards = document.getElementById('cards');
const search = document.getElementById('search');
const playerSection = document.getElementById('player-section');
const playerTitle = document.getElementById('player-title');
const playerMeta = document.getElementById('player-meta');
const player = document.getElementById('player');

let currentList = [];

function render(list) {
  currentList = list;
  cards.innerHTML = list
    .map(
      (item) => `
      <article class="card" data-id="${item.id}">
        <img src="${item.poster}" alt="${item.title}" loading="lazy" />
        <div class="meta">
          <strong>${item.title}</strong><br />
          <small>${item.year} • ★ ${item.rating}</small>
        </div>
      </article>`
    )
    .join('');
}

async function loadTrending() {
  const res = await fetch('/api/trending');
  render(await res.json());
}

async function playTitle(id) {
  const [titleRes, streamRes] = await Promise.all([
    fetch(`/api/title/${id}`),
    fetch(`/api/stream/${id}`),
  ]);

  if (!streamRes.ok) {
    alert('No working stream right now.');
    return;
  }

  const title = await titleRes.json();
  const stream = await streamRes.json();

  playerSection.classList.remove('hidden');
  playerTitle.textContent = title.title;
  playerMeta.textContent = `Provider: ${stream.provider} • Quality: ${stream.quality.join(', ')}`;
  player.src = stream.url;
  player.play().catch(() => {});
}

cards.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  playTitle(card.dataset.id);
});

search.addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  if (!q) return render(currentList.length ? currentList : []);
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  render(await res.json());
});

document.getElementById('feedback').addEventListener('click', async () => {
  const title = prompt('Title ID with dead link (example: tt1375666)');
  if (!title) return;
  await fetch('/api/feedback', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({titleId: title, reason: 'dead_link', ts: Date.now()}),
  });
  alert('Thanks — feedback submitted.');
});

loadTrending();
