import express from 'express';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== CONFIG =====
// Set players via env: PLAYERS="player1,player2,player3"
const PLAYERS = (process.env.PLAYERS?.split(',').map(s => s.trim()).filter(Boolean)) || ['player1','player2','player3'];
const PORT = process.env.PORT || 3000;

// Flat-file storage (no DB)
const DATA_DIR = path.join(__dirname, 'data');
const VOTES_PATH = path.join(DATA_DIR, 'votes.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(VOTES_PATH)) fs.writeFileSync(VOTES_PATH, JSON.stringify({ version:1, votes:{} }, null, 2));
const readVotes = () => JSON.parse(fs.readFileSync(VOTES_PATH, 'utf8'));
const writeVotes = (data) => fs.writeFileSync(VOTES_PATH, JSON.stringify(data, null, 2));

// votes schema: { version:1, votes: { from: { to: score } } }
const app = express();
app.use(express.json());
app.use(cookieParser());

// ===== API (unchanged) =====
app.get('/api/players', (_req,res) => res.json({ players: PLAYERS }));

app.post('/api/login', (req,res) => {
  const { player } = req.body || {};
  if (!player || !PLAYERS.includes(player)) return res.status(400).json({ error:'invalid_player' });
  res.cookie('player', player, { httpOnly:true, sameSite:'lax' });
  res.json({ ok:true, player });
});

app.post('/api/logout', (_req,res) => { res.clearCookie('player'); res.json({ ok:true }); });

app.get('/api/me', (req,res) => res.json({ player: req.cookies.player || null }));

app.post('/api/vote', (req,res) => {
  const from = req.cookies.player;
  const { to, score } = req.body || {};
  if (!from) return res.status(401).json({ error:'not_logged_in' });
  if (!to || !PLAYERS.includes(to)) return res.status(400).json({ error:'invalid_to' });
  if (from === to) return res.status(400).json({ error:'self_vote_forbidden' });
  const n = Number(score);
  if (!Number.isInteger(n) || n < 1 || n > 10) return res.status(400).json({ error:'invalid_score' });
  const data = readVotes();
  data.votes[from] ||= {};
  data.votes[from][to] = n; // overwrite last vote
  writeVotes(data);
  res.json({ ok:true });
});

app.get('/api/ratings', (_req,res) => {
  const { votes } = readVotes();
  const received = Object.create(null);
  for (const targets of Object.values(votes)) {
    for (const [to, sc] of Object.entries(targets)) {
      (received[to] ||= []).push(sc);
    }
  }
  const summary = {};
  for (const p of PLAYERS) {
    const arr = received[p] || [];
    const count = arr.length;
    const avg = count ? arr.reduce((a,b)=>a+b,0)/count : 0;
    summary[p] = { average: Number(avg.toFixed(2)), count };
  }
  res.json({ summary });
});

// ===== Inline Pro UI (replaces your old minimal HTML) =====
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Ratings • Pro</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <script defer src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <style>
    :root{
      --bg:#0b0f14; --panel:#121822; --panel-2:#0f141d; --muted:#9aa4b2;
      --text:#e7edf5; --primary:#6aa0ff; --primary-2:#3b82f6; --ring: rgba(106,160,255,0.35);
      --card:#111827;
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0; font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif; color:var(--text);
      background: radial-gradient(1200px 800px at 80% -10%, #1b2a44 0%, #0b0f14 60%), var(--bg);
    }
    .app-shell{display:grid;grid-template-columns:300px 1fr;gap:24px;min-height:100vh;padding:24px}
    .sidebar{position:sticky;top:24px;height:calc(100vh - 48px)}
    .brand{font-weight:800;font-size:22px;letter-spacing:.3px;margin-bottom:16px}
    .brand .dot{color:var(--primary)}
    .card{
      background: linear-gradient(180deg, var(--panel) 0%, var(--panel-2) 100%);
      border:1px solid rgba(255,255,255,0.06); border-radius:16px; padding:16px;
      box-shadow:0 10px 30px rgba(0,0,0,.25)
    }
    .card + .card{margin-top:16px}
    .card-title{font-weight:700;margin-bottom:8px;opacity:.95}
    .field{display:flex;flex-direction:column;gap:6px;margin:8px 0}
    .select,.slider,.btn,.input{
      outline:none;border:1px solid rgba(255,255,255,.1); background:#0d131c;color:var(--text);
      border-radius:12px;padding:10px 12px;
    }
    .select:focus,.input:focus{box-shadow:0 0 0 4px var(--ring)}
    .actions{display:flex;gap:8px;margin-top:8px}
    .btn{cursor:pointer;font-weight:600}
    .btn.primary{background:linear-gradient(180deg, var(--primary) 0%, var(--primary-2) 100%);border:none}
    .btn.ghost{background:transparent}
    .whoami{margin-top:8px}
    .tip{margin-top:12px;font-size:12px;color:var(--muted)}
    .content{display:flex;flex-direction:column;gap:24px}
    .top-cards{display:grid;grid-template-columns:1.1fr .9fr;gap:24px}
    .highlight{background:linear-gradient(180deg,#172033 0%,#111827 100%),var(--card)}
    .leaderboard{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center}
    .leaderboard .row{display:contents}
    .badge{display:inline-flex;align-items:center;gap:8px}
    .avatar{width:28px;height:28px;border-radius:999px;background:#1f2937;display:grid;place-items:center;font-weight:700}
    .score{font-variant-numeric:tabular-nums}
    .muted{color:var(--muted)}
    .vote-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
    .vote-card{padding:12px;border-radius:14px;background:linear-gradient(180deg,#151b27 0%,#0f141d 100%);border:1px solid rgba(255,255,255,.06)}
    .vote-card .row{display:flex;gap:10px;align-items:center;justify-content:space-between}
    .vote-card .name{display:flex;align-items:center;gap:10px;font-weight:700}
    .slider{width:100%}
    .vote-btn{margin-top:8px;width:100%}
    .table{width:100%;border-collapse:collapse}
    .table th,.table td{border-bottom:1px solid rgba(255,255,255,.07);padding:10px;text-align:left}
    .footer{padding:12px 24px;opacity:.7;color:var(--muted)}
    @media (max-width: 900px){
      .app-shell{grid-template-columns:1fr}
      .sidebar{position:static;height:auto}
      .top-cards{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">Rateboard<span class="dot">•</span></div>
      <div class="login-card card">
        <div class="card-title">Session</div>
        <div class="field">
          <label>Player</label>
          <select id="playerSelect" class="select"></select>
        </div>
        <div class="actions">
          <button id="loginBtn" class="btn primary">Log in</button>
          <button id="logoutBtn" class="btn ghost" style="display:none">Log out</button>
        </div>
        <div id="whoami" class="whoami muted">Not logged in</div>
      </div>
      <div class="tip">Self-votes are blocked. Voting overwrites your previous vote for the same player.</div>
    </aside>

    <main class="content">
      <section class="top-cards">
        <div class="card highlight">
          <div class="card-title">Leaderboard</div>
          <div id="leaderboard" class="leaderboard"></div>
        </div>
        <div class="card">
          <div class="card-title">Averages</div>
          <canvas id="avgChart"></canvas>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Cast Your Votes</div>
        <div id="voteGrid" class="vote-grid"></div>
      </section>

      <section class="card">
        <div class="card-title">Live Table</div>
        <div id="ratingsTableWrap"></div>
      </section>
    </main>
  </div>

  <footer class="footer">Flat-file demo • No DB • © Rateboard</footer>

  <script>
    // ===== Helpers =====
    const $ = sel => document.querySelector(sel);
    const playerSelect = $('#playerSelect');
    const whoami = $('#whoami');
    const loginBtn = $('#loginBtn');
    const logoutBtn = $('#logoutBtn');
    const leaderboard = $('#leaderboard');
    const voteGrid = $('#voteGrid');
    const ratingsTableWrap = $('#ratingsTableWrap');
    let avgChart;

    // ===== API =====
    async function api(path, opts) {
      const res = await fetch(path, Object.assign({
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      }, opts));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    // ===== UI logic =====
    function initialAvatar(name){
      const letters = name.split(/\\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();
      return '<span class="avatar">' + letters + '</span>';
    }

    async function refreshPlayers() {
      const { players } = await api('/api/players');
      playerSelect.innerHTML = players.map(p => '<option value="'+p+'">'+p+'</option>').join('');
    }

    async function refreshMe() {
      const { player } = await api('/api/me');
      whoami.textContent = player ? 'Logged in as: ' + player : 'Not logged in';
      logoutBtn.style.display = player ? '' : 'none';
      if (player) {
        await buildVoteGrid(player);
      } else {
        voteGrid.innerHTML = '<div class="muted">Log in to vote.</div>';
      }
    }

    async function buildVoteGrid(current) {
      const { players } = await api('/api/players');
      const others = players.filter(p => p !== current);
      voteGrid.innerHTML = others.map(p => \`
        <div class="vote-card">
          <div class="row">
            <div class="name">\${initialAvatar(p)} \${p}</div>
            <div class="score muted"><span id="value-\${p}">5</span>/10</div>
          </div>
          <input type="range" min="1" max="10" value="5" class="slider" id="slider-\${p}">
          <button class="btn primary vote-btn" data-to="\${p}">Submit</button>
        </div>
      \`).join('');

      others.forEach(p => {
        const slider = document.getElementById('slider-' + p);
        const value = document.getElementById('value-' + p);
        slider.addEventListener('input', () => value.textContent = slider.value);
      });

      voteGrid.addEventListener('click', async (e) => {
        if (e.target.matches('button.vote-btn')) {
          const to = e.target.getAttribute('data-to');
          const slider = document.getElementById('slider-' + to);
          const score = parseInt(slider.value, 10);
          try {
            await api('/api/vote', { method: 'POST', body: JSON.stringify({ to, score }) });
            await refreshRatings();
            e.target.textContent = 'Saved ✓';
            setTimeout(()=> e.target.textContent = 'Submit', 1200);
          } catch (err) {
            alert('Vote failed: ' + err.message);
          }
        }
      }, { once: true });
    }

    function renderLeaderboard(summary){
      const arr = Object.entries(summary).map(([name, s]) => ({ name, avg: s.average, count: s.count }));
      arr.sort((a,b)=> b.avg - a.avg || b.count - a.count || a.name.localeCompare(b.name));
      leaderboard.innerHTML = \`
        <div class="row muted"><div>Player</div><div>Avg</div><div>#</div></div>
        \${arr.map((r,i)=>\`
          <div class="row">
            <div class="badge">\${initialAvatar(r.name)} \${i+1}. \${r.name}</div>
            <div class="score">\${r.avg.toFixed(2)}</div>
            <div class="muted">\${r.count}</div>
          </div>
        \`).join('')}
      \`;
    }

    function renderTable(summary){
      const rows = Object.entries(summary).map(([p,s])=>\`
        <tr><td>\${p}</td><td>\${s.average.toFixed(2)}</td><td>\${s.count}</td></tr>
      \`).join('');
      ratingsTableWrap.innerHTML = \`
        <table class="table">
          <thead><tr><th>Player</th><th>Average</th><th>#Votes</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      \`;
    }

    function renderChart(summary){
      const labels = Object.keys(summary);
      const values = labels.map(k => summary[k].average);
      if (avgChart) { avgChart.destroy(); }
      const ctx = document.getElementById('avgChart').getContext('2d');
      avgChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Average', data: values }] },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, suggestedMax: 10 } },
          plugins: { legend: { display: false } }
        }
      });
    }

    async function refreshRatings(){
      const { summary } = await api('/api/ratings');
      renderLeaderboard(summary);
      renderTable(summary);
      renderChart(summary);
    }

    loginBtn.addEventListener('click', async () => {
      const player = playerSelect.value;
      try{
        await api('/api/login', { method:'POST', body: JSON.stringify({ player }) });
        await refreshMe();
      }catch(err){ alert('Login failed: ' + err.message); }
    });

    logoutBtn.addEventListener('click', async () => {
      await api('/api/logout', { method:'POST' });
      await refreshMe();
    });

    // Poll to keep multiple clients in sync
    setInterval(refreshRatings, 3000);

    // Init
    (async function init(){
      await refreshPlayers();
      await refreshMe();
      await refreshRatings();
    })();
  </script>
</body>
</html>`;

// Serve inline HTML (same route as your current app)
app.get('/', (_req,res) => res.type('html').send(html));

app.listen(PORT, () => {
  console.log('Rating platform running on http://localhost:' + PORT);
});
