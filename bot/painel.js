// bot/painel.js — painel local (http://127.0.0.1:porta) para colar as chaves, pausar e ver o placar/log.
// Só escuta no próprio PC e exige um token aleatório, para nenhum site da internet conseguir mexer nele.
'use strict';
const http = require('http');
const crypto = require('crypto');

const semCores = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');

function iniciarPainel(acoes) {
  const token = crypto.randomBytes(16).toString('hex');
  const clientes = new Set();
  const linhas = [];
  let estado = {};

  const enviar = (tipo, dados) => {
    const msg = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
    for (const c of clientes) { try { c.write(msg); } catch (_) {} }
  };

  const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const lerCorpo = (req) => new Promise((ok) => { const p = []; let n = 0;
    req.on('data', d => { n += d.length; if (n < 64 * 1024) p.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(p).toString('utf8') || '{}')); } catch (_) { ok({}); } }); });

  const servidor = http.createServer(async (req, res) => {
    // proteção contra sites externos (DNS rebinding / pedidos de outra origem)
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (host !== '127.0.0.1' && host !== 'localhost') { res.writeHead(403); return res.end(); }
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.searchParams.get('t') !== token && req.headers['x-kb-token'] !== token) { res.writeHead(403); return res.end('acesso negado'); }

    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(HTML.replace('__TOKEN__', token));
    }
    if (req.method === 'GET' && u.pathname === '/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: estado\ndata: ${JSON.stringify(estado)}\n\n`);
      res.write(`event: log\ndata: ${JSON.stringify(linhas)}\n\n`);
      clientes.add(res);
      const vivo = setInterval(() => { try { res.write(': ok\n\n'); } catch (_) {} }, 15000);
      req.on('close', () => { clearInterval(vivo); clientes.delete(res); });
      return;
    }
    if (req.method === 'POST' && acoes[u.pathname.slice(1)]) {
      try { return json(res, 200, await acoes[u.pathname.slice(1)](await lerCorpo(req))); }
      catch (e) { return json(res, 200, { ok: false, erro: e.message }); }
    }
    res.writeHead(404); res.end();
  });

  return new Promise((ok, falha) => {
    servidor.once('error', falha);
    servidor.listen(0, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${servidor.address().port}/?t=${token}`;
      ok({
        url,
        log(texto) {
          const l = semCores(texto);
          linhas.push(l); if (linhas.length > 300) linhas.shift();
          enviar('log', [l]);
        },
        atualizar(parcial) { estado = Object.assign({}, estado, parcial); enviar('estado', estado); },
        fechar() { for (const c of clientes) { try { c.end(); } catch (_) {} } servidor.close(); },
      });
    });
  });
}

const HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kahoot Bot</title>
<style>
:root{--bg:#14121c;--card:#1e1b29;--borda:#2f2b40;--txt:#ece9f5;--fraco:#9a94b0;--roxo:#8b5cf6;--verde:#22c55e;--verm:#ef4444;--amar:#eab308}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:880px;margin:0 auto;padding:20px 16px 40px}
header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
h1{font-size:22px;margin:0;flex:1}h2{font-size:15px;margin:0 0 12px;color:var(--fraco);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.pilula{padding:5px 12px;border-radius:99px;font-size:13px;font-weight:600;background:var(--borda)}
.pilula.ok{background:#14532d;color:#bbf7d0}.pilula.esp{background:#713f12;color:#fef08a}.pilula.pausa{background:#3f3f46}
.grade{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:700px){.grade{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--borda);border-radius:12px;padding:16px}
label{display:block;font-size:13px;color:var(--fraco);margin:10px 0 4px}label a{color:#c4b5fd}
.campo{display:flex;gap:6px}input[type=password],input[type=text]{flex:1;min-width:0;background:#110f18;border:1px solid var(--borda);color:var(--txt);border-radius:8px;padding:9px 10px;font:inherit}
input:focus{outline:2px solid var(--roxo);border-color:transparent}
button{background:var(--roxo);color:#fff;border:0;border-radius:8px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}
button.sec{background:var(--borda);color:var(--txt)}button:disabled{opacity:.5;cursor:default}
.linha{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.marca{font-size:13px;margin-top:4px;min-height:18px}.marca.ok{color:var(--verde)}.marca.erro{color:var(--verm)}
.check{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--fraco);margin-top:10px}
.placar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center}
.placar b{display:block;font-size:26px}.placar span{font-size:12px;color:var(--fraco)}
.v{color:var(--verde)}.x{color:var(--verm)}
#modelos{font-size:13px;color:var(--fraco);margin-top:12px}
#log{background:#0d0b13;border:1px solid var(--borda);border-radius:10px;height:320px;overflow:auto;padding:10px;font:12.5px/1.5 Consolas,ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}
#log .ok{color:#86efac}#log .erro{color:#fca5a5}#log .dim{color:#7c7790}
.dica{font-size:13px;color:var(--fraco);margin:10px 0 0}
</style></head><body><main>
<header><h1>🤖 Kahoot Bot</h1><span id="status" class="pilula">conectando…</span></header>
<div class="grade">
  <section class="card">
    <h2>Chaves da IA</h2>
    <label for="groq">Groq — rápida, para perguntas de texto · <a href="https://console.groq.com/keys" target="_blank">pegar chave grátis</a></label>
    <div class="campo"><input id="groq" type="password" placeholder="gsk_…" autocomplete="off"><button class="sec" data-ver="groq" type="button">👁</button></div>
    <div id="mGroq" class="marca"></div>
    <label for="gemini">Gemini — reserva, para imagens/fotos · <a href="https://aistudio.google.com/apikey" target="_blank">pegar chave grátis</a></label>
    <div class="campo"><input id="gemini" type="password" placeholder="AIza… ou AQ.…" autocomplete="off"><button class="sec" data-ver="gemini" type="button">👁</button></div>
    <div id="mGemini" class="marca"></div>
    <label class="check"><input id="lembrar" type="checkbox"> Lembrar neste PC (não marque em computador da faculdade)</label>
    <div class="linha"><button id="salvar">Salvar e testar</button><button id="esquecer" class="sec">Apagar chaves salvas</button></div>
    <p class="dica">Basta uma das duas. Com as duas, o bot fica mais rápido e lê melhor imagens.</p>
  </section>
  <section class="card">
    <h2>Jogo</h2>
    <div class="placar">
      <div><b id="pC" class="v">0</b><span>corretas</span></div>
      <div><b id="pI" class="x">0</b><span>incorretas</span></div>
      <div><b id="pR">0</b><span>respondidas</span></div>
      <div><b id="pT">–</b><span>tempo médio</span></div>
    </div>
    <div class="linha"><button id="kahoot">Ir para o Kahoot</button><button id="pausar" class="sec">Pausar</button></div>
    <div id="modelos"></div>
    <p class="dica">Jogue na aba do Kahoot desta mesma janela. Alt+Shift+K também pausa. Fechar esta janela encerra o bot.</p>
  </section>
</div>
<section class="card" style="margin-top:14px"><h2>Registro</h2><div id="log"></div></section>
</main>
<script>
const T='__TOKEN__';const $=id=>document.getElementById(id);
const post=(a,d)=>fetch('/'+a,{method:'POST',headers:{'Content-Type':'application/json','X-KB-Token':T},body:JSON.stringify(d||{})}).then(r=>r.json());
document.querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>{const i=$(b.dataset.ver);i.type=i.type==='password'?'text':'password'});
function marca(el,r){el.className='marca '+(r?(r.ok?'ok':'erro'):'');el.textContent=r?(r.ok?'✓ '+(r.msg||'funcionando'):'✗ '+r.erro):''}
function render(e){
  const s=$('status');
  if(!e.temChave){s.className='pilula esp';s.textContent='cole uma chave'}
  else if(e.ativo===false){s.className='pilula pausa';s.textContent='pausado'}
  else{s.className='pilula ok';s.textContent='respondendo'}
  $('pausar').textContent=e.ativo===false?'Retomar':'Pausar';
  const p=e.placar||{};$('pC').textContent=p.corretas||0;$('pI').textContent=p.incorretas||0;$('pR').textContent=p.respondidas||0;
  $('pT').textContent=p.mediaMs?(p.mediaMs/1000).toFixed(1)+' s':'–';
  if(e.chaves){
    $('groq').placeholder=e.chaves.groq?'salva (…'+e.chaves.groq+') — cole outra para trocar':'gsk_…';
    $('gemini').placeholder=e.chaves.gemini?'salva (…'+e.chaves.gemini+') — cole outra para trocar':'AIza… ou AQ.…';
  }
  $('modelos').textContent=e.modelos?('IA: '+e.modelos):'';
}
const log=$('log');
function addLog(ls){const fim=log.scrollTop+log.clientHeight>=log.scrollHeight-30;
  for(const l of ls){const d=document.createElement('div');d.textContent=l;
    if(/✓|CORRETO|Pronto/.test(l)&&!/INCORRETO/.test(l))d.className='ok';else if(/✗|INCORRETO|erro|falh/i.test(l))d.className='erro';else if(/^\\S+\\s{3}/.test(l))d.className='dim';
    log.appendChild(d)}
  while(log.childNodes.length>300)log.removeChild(log.firstChild);if(fim)log.scrollTop=log.scrollHeight}
function conectar(){const es=new EventSource('/eventos?t='+T);
  es.addEventListener('estado',ev=>render(JSON.parse(ev.data)));
  es.addEventListener('log',ev=>addLog(JSON.parse(ev.data)));
  es.onerror=()=>{const s=$('status');s.className='pilula';s.textContent='bot encerrado'}}
conectar();
$('salvar').onclick=async()=>{const b=$('salvar');b.disabled=true;b.textContent='Testando…';marca($('mGroq'));marca($('mGemini'));
  try{const r=await post('chaves',{groq:$('groq').value,gemini:$('gemini').value,lembrar:$('lembrar').checked});
    if(r.erro&&!r.groq&&!r.gemini)marca($('mGroq'),{ok:false,erro:r.erro});
    marca($('mGroq'),r.groq);marca($('mGemini'),r.gemini);
    if(r.groq&&r.groq.ok)$('groq').value='';if(r.gemini&&r.gemini.ok)$('gemini').value='';
  }finally{b.disabled=false;b.textContent='Salvar e testar'}};
$('esquecer').onclick=async()=>{const r=await post('esquecer');marca($('mGroq'),{ok:true,msg:r.msg||'apagadas deste PC'});};
$('pausar').onclick=()=>post('alternar');
$('kahoot').onclick=()=>post('kahoot');
</script></body></html>`;

module.exports = { iniciarPainel, semCores };
