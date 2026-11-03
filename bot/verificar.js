// bot/verificar.js — confere se ESTE computador consegue rodar o bot (rode na faculdade antes do jogo).
// Testa: runtime Node, módulos usados, Chrome/Edge com controle remoto liberado, acesso à API do Gemini e a chave.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CDP } = require('./cdp');
const { acharNavegador, abrirNavegador } = require('./navegador');
const { lerConfig, limparChave, ARQ_CHAVE, obterChaveGroq } = require('./config');
const G = require('../nucleo/gemini');

const R = '\x1b[0m', VERDE = '\x1b[32m', VERM = '\x1b[31m', AMAR = '\x1b[33m', NEG = '\x1b[1m', CINZA = '\x1b[90m';
const falhas = [];
const ok = (t) => console.log(`  ${VERDE}✓${R} ${t}`);
const ruim = (t, dica) => { console.log(`  ${VERM}✗ ${t}${R}`); if (dica) console.log(`    ${CINZA}→ ${dica}${R}`); falhas.push(t); };
const aviso = (t) => console.log(`  ${AMAR}!${R} ${t}`);

async function comTempo(ms, p) {
  let t; const lim = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`demorou mais de ${ms / 1000} s`)), ms); });
  try { return await Promise.race([p, lim]); } finally { clearTimeout(t); }
}

(async () => {
  const cfg = lerConfig();
  console.log(`\n${NEG}🩺 Verificando este computador${R}\n`);

  console.log(`${NEG}1. Runtime${R}`);
  const maior = parseInt(process.versions.node.split('.')[0], 10);
  const rt = process.versions.electron ? `Node ${process.version} embutido no VS Code (Electron ${process.versions.electron})` : `Node ${process.version}`;
  if (maior >= 18) ok(rt); else ruim(`${rt} — precisa de Node 18 ou mais novo`, 'atualize o VS Code ou use o Node portátil (README)');
  const apis = ['fetch', 'AbortController', 'Blob', 'TextDecoder'].filter(k => typeof globalThis[k] !== 'function');
  if (apis.length) ruim(`APIs ausentes: ${apis.join(', ')}`, 'use o Node portátil (README)'); else ok('fetch, AbortController, Blob e TextDecoder disponíveis');
  try { ['http', 'crypto', 'child_process', 'fs', 'os', 'readline'].forEach(m => require(m)); ok('módulos http, crypto, child_process, fs, os, readline'); }
  catch (e) { ruim(`módulo ausente: ${e.message}`, 'use o Node portátil (README)'); }
  try { const f = path.join(os.tmpdir(), `kb-teste-${process.pid}`); fs.writeFileSync(f, 'x'); fs.unlinkSync(f); ok(`pasta temporária gravável (${os.tmpdir()})`); }
  catch (e) { ruim(`não consegui gravar na pasta temporária: ${e.message}`); }

  console.log(`\n${NEG}2. Navegador com controle remoto${R}`);
  const exe = acharNavegador(cfg.navegador);
  if (!exe) ruim('Chrome/Edge não encontrado', 'coloque o caminho do chrome.exe em "navegador" no config.json');
  else {
    ok(`encontrado: ${exe}`);
    let aberto = null, cdp = null;
    try {
      process.env.KB_HEADLESS = process.env.KB_HEADLESS || '1';      // teste invisível
      process.env.KB_PERFIL = path.join(os.tmpdir(), 'kahoot-bot-verificacao');
      const t0 = Date.now();
      aberto = await comTempo(25000, abrirNavegador(exe));
      cdp = await CDP.conectar(aberto.url);
      const v = await cdp.enviar('Browser.getVersion');
      ok(`controle remoto (DevTools) liberado — ${v.product} em ${Date.now() - t0} ms`);
      const { targetInfos } = await cdp.enviar('Target.getTargets');
      const pg = targetInfos.find(t => t.type === 'page');
      const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId: pg.targetId, flatten: true });
      await cdp.enviar('Runtime.enable', {}, sessionId);
      const r = await cdp.enviar('Runtime.evaluate', { expression: '1+1', returnByValue: true }, sessionId);
      const shot = await cdp.enviar('Page.captureScreenshot', { format: 'jpeg', quality: 50 }, sessionId);
      if (r.result.value === 2 && shot.data) ok('executar código na página e tirar print: funcionando');
    } catch (e) {
      ruim(e.message, 'o computador pode bloquear o controle remoto do navegador por política; tente o Edge ("navegador" no config.json)');
    } finally {
      // fecha com calma (sair com o Chrome ainda fechando causava "Assertion failed ... async.c" no Windows)
      if (aberto) {
        const saiu = new Promise(res => { if (aberto.proc.exitCode !== null) res(); else aberto.proc.once('exit', res); });
        if (cdp) cdp.enviar('Browser.close').catch(() => {});
        await Promise.race([saiu, new Promise(r => setTimeout(r, 3000))]);
        if (aberto.proc.exitCode === null) { try { aberto.proc.kill(); } catch (_) {} await Promise.race([saiu, new Promise(r => setTimeout(r, 1500))]); }
        if (cdp) cdp.fechar();
        try { fs.rmSync(path.join(os.tmpdir(), 'kahoot-bot-verificacao'), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }

  console.log(`\n${NEG}3. Internet e Gemini${R}`);
  let chave = limparChave(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (!chave) { try { chave = limparChave(fs.readFileSync(ARQ_CHAVE, 'utf8')); } catch (_) {} }
  try {
    const t0 = Date.now();
    const r = await comTempo(15000, fetch(`${cfg.apiBase}/v1beta/models`, { headers: chave ? { 'x-goog-api-key': chave } : {} }));
    ok(`API do Gemini alcançável (${Date.now() - t0} ms)`);
    if (!chave) aviso('sem chave salva — o bot vai pedir a chave quando você iniciar (ou crie chave-gemini.txt)');
    else if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      ruim(`API recusou a chave (HTTP ${r.status}): ${(corpo.error && corpo.error.message || '').slice(0, 120)}`, 'gere outra chave em aistudio.google.com/apikey');
    } else {
      // pergunta de verdade para cada modelo (é o que importa: a lista pode mostrar um modelo que está sobrecarregado)
      const chaveGroq = obterChaveGroq();
      const chaves = { gemini: chave, groq: chaveGroq };
      if (!chaveGroq) aviso('sem chave da Groq (opcional): crie chave-groq.txt para respostas mais rápidas — console.groq.com/keys');
      const modelos = G.normalizarModelos(cfg).filter(m => chaves[m.provedor]);
      console.log(`  ${CINZA}testando ${modelos.length} modelos (até 15 s)…${R}`);
      const res = await Promise.all(modelos.map(m => G.aquecerModelo({ apiBase: cfg.apiBase, groqBase: cfg.groqBase, provedor: m.provedor, chave: chaves[m.provedor], modelo: m.modelo, nivel: m.nivel, timeoutMs: 15000 })));
      for (const m of res) {
        if (m.ok) ok(`${m.modelo} respondeu em ${m.ms} ms${m.ms > 3000 ? `  ${AMAR}(lento agora)${R}` : ''}`);
        else aviso(`${m.modelo}: ${m.erro} (${m.ms} ms)`);
      }
      const bons = res.filter(m => m.ok);
      if (!bons.length) ruim('nenhum modelo respondeu agora', 'o Google pode estar sobrecarregado; tente de novo em alguns minutos ou adicione outros modelos no config.json');
      else ok(`o bot vai usar: ${bons.sort((a, b) => a.ms - b.ms).map(m => m.modelo).join(', ')}`);
    }
  } catch (e) {
    ruim(`não consegui falar com a API do Gemini: ${e.message}`, 'a rede pode bloquear generativelanguage.googleapis.com; teste no roteador do celular');
  }

  console.log('');
  if (falhas.length) console.log(`${VERM}${NEG}${falhas.length} problema(s) encontrado(s).${R} Veja as dicas acima.\n`);
  else console.log(`${VERDE}${NEG}Tudo certo!${R} Pode iniciar o bot (Ctrl+Shift+B).\n`);
  process.exitCode = falhas.length ? 1 : 0;
})();
