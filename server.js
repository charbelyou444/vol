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

// ===== API =====
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

// ===== Inline Frontend =====
const html = `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ratings (minimal)</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:2rem;}
.card{border:1px solid #ddd;border-radius:12px;padding:1rem;margin-bottom:1rem}
.row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
button{cursor:pointer}
label{margin-right:.25rem}
.table{border-collapse:collapse;width:100%}
.table th,.table td{border:1px solid #eee;padding:8px;text-align:left}
.badge{display:inline-block;padding:.15rem .5rem;border:1px solid #999;border-radius:999px;font-size:.8rem}
</style>
</head><body>
<h1>Rating Platform – Minimal</h1>
<p class="badge">No DB · Flat file · Single server.js</p>
<div class="card"><h2>Login</h2><div class="row">
<select id="playerSelect"></select>
<button id="loginBtn">Log in</button>
<span id="whoami"></span>
<button id="logoutBtn" style="display:none">Log out</button>
</div></div>
<div class="card" id="voteCard" style="display:none"><h2>Vote</h2><div id="voteList"></div></div>
<div class="card"><h2>Ratings</h2><div id="ratings"></div></div>
<script>
async function api(path, opts){
  const res = await fetch(path, Object.assign({ headers:{'Content-Type':'application/json'}, credentials:'same-origin' }, opts));
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
async function refreshPlayers(){
  const { players } = await api('/api/players');
  playerSelect.innerHTML = players.map(p=>` + "`" + `<option value="\${p}">\${p}</option>` + "`" + `).join('');
}
async function refreshMe(){
  const { player } = await api('/api/me');
  whoami.textContent = player ? 'Logged in as: ' + player : 'Not logged in';
  logoutBtn.style.display = player ? '' : 'none';
  voteCard.style.display = player ? '' : 'none';
  if(player) buildVoteList(player); else voteList.innerHTML='';
}
async function buildVoteList(current){
  const { players } = await api('/api/players');
  const others = players.filter(p=>p!==current);
  voteList.innerHTML = '';
  for(const p of others){
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<strong style="width:120px;display:inline-block">' + p + '</strong>' +
      Array.from({length:10}, (_,i)=>i+1).map(n=>` + "`" + `<label><input type="radio" name="rate_\${p}" value="\${n}"> \${n}</label>` + "`" + `).join('') +
      ` + "`" + ` <button data-to="\${p}">Submit</button>` + "`" + `;
    voteList.appendChild(row);
  }
  voteList.onclick = async (e) => {
    if(e.target.tagName === 'BUTTON'){
      const to = e.target.getAttribute('data-to');
      const inp = document.querySelector('input[name="rate_' + to + '"]:checked');
      if(!inp){ alert('Pick a score 1-10 first.'); return; }
      const score = parseInt(inp.value, 10);
      try{
        await api('/api/vote', { method:'POST', body: JSON.stringify({ to, score }) });
        await refreshRatings();
        alert('Voted ' + score + ' for ' + to);
      }catch(err){
        alert('Vote failed: ' + err.message);
      }
    }
  };
}
async function refreshRatings(){
  const { summary } = await api('/api/ratings');
  const rows = Object.entries(summary).map(([p,s])=>'<tr><td>'+p+'</td><td>'+s.average+'</td><td>'+s.count+'</td></tr>').join('');
  ratings.innerHTML = '<table class="table"><thead><tr><th>Player</th><th>Average</th><th>#Votes</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
loginBtn.onclick = async ()=>{
  const player = playerSelect.value;
  try{
    await api('/api/login', { method:'POST', body: JSON.stringify({ player }) });
    await refreshMe();
  }catch(err){ alert('Login failed: ' + err.message); }
};
logoutBtn.onclick = async ()=>{ await api('/api/logout', { method:'POST' }); await refreshMe(); };
(async function init(){ await refreshPlayers(); await refreshMe(); await refreshRatings(); })();
</script>
</body></html>`;

app.get('/', (_req,res) => res.type('html').send(html));

app.listen(PORT, () => {
  console.log('Rating platform running on http://localhost:' + PORT);
});
