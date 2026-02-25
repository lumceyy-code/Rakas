const pwdInput = document.getElementById('admin-password');
const saveBtn = document.getElementById('save-admin-password');
const statusPre = document.getElementById('resolver-status');
const trafficDiv = document.getElementById('traffic-stats');
const refreshButton = document.getElementById('refresh-button');
const refreshId = document.getElementById('refresh-id');
const refreshSeason = document.getElementById('refresh-season');
const refreshEpisode = document.getElementById('refresh-episode');
const refreshOutput = document.getElementById('refresh-output');
const canvas = document.getElementById('bandwidth-chart');
const ctx = canvas.getContext('2d');

const KEY = 'rakas.admin.password';
pwdInput.value = localStorage.getItem(KEY) || '';

saveBtn.onclick = () => {
  localStorage.setItem(KEY, pwdInput.value.trim());
};

function authHeaders() {
  return { 'X-Admin-Password': localStorage.getItem(KEY) || '' };
}

function fmtBytes(bytes) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes} B`;
}

function drawChart(buckets = []) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#8ad1ff';
  if (!buckets.length) return;
  const max = Math.max(...buckets.map((b) => b.bytes), 1);
  const barW = Math.max(2, Math.floor(canvas.width / buckets.length));

  buckets.forEach((bucket, i) => {
    const h = Math.round((bucket.bytes / max) * (canvas.height - 20));
    const x = i * barW;
    const y = canvas.height - h - 10;
    ctx.fillRect(x, y, barW - 1, h);
  });
}

async function loadStatus() {
  const res = await fetch('/api/admin/status', { headers: authHeaders() });
  if (!res.ok) {
    statusPre.textContent = `Admin API error: ${res.status}`;
    return;
  }
  const data = await res.json();
  trafficDiv.textContent = `Active Streams: ${data.traffic.activeStreams} | Active Viewers ~ ${data.traffic.activeViewers} | Total Egress: ${fmtBytes(data.traffic.totalBytes)}`;
  statusPre.textContent = JSON.stringify({ connectors: data.connectors, endpoints: data.endpoints }, null, 2);
  drawChart(data.traffic.buckets || []);
}

refreshButton.onclick = async () => {
  const payload = {
    metadataId: refreshId.value.trim(),
    season: Number(refreshSeason.value || 1),
    episode: Number(refreshEpisode.value || 1)
  };
  const res = await fetch('/api/admin/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  refreshOutput.textContent = JSON.stringify(data, null, 2);
};

setInterval(loadStatus, 5000);
loadStatus();
