// bot/bot.js — abre um Chrome (ou Edge) controlado e responde o Kahoot sozinho.
// No VS Code: Ctrl+Shift+B (roda no Node embutido do próprio VS Code). Fora dele: `node bot/bot.js`.
'use strict';
const fs = require('fs');
const path = require('path');
const { CDP } = require('./cdp');
const { acharNavegador, abrirNavegador } = require('./navegador');
const { RAIZ, lerConfig, obterChaves } = require('./config');
const G = require('../nucleo/gemini');

const COR_TERM = { vermelho: '\x1b[41m', azul: '\x1b[44m', amarelo: '\x1b[43m\x1b[30m', verde: '\x1b[42m' };
const R = '\x1b[0m', CINZA = '\x1b[90m', VERDE = '\x1b[32m', VERM = '\x1b[31m', NEG = '\x1b[1m';
const hora = () => new Date().toLocaleTimeString('pt-BR');
const log = (...a) => console.log(`${CINZA}${hora()}${R}`, ...a);

// ------------------------------------------------------------------ código injetado na página
function montarPacote(cfg) {
  const ler = (f) => fs.readFileSync(path.join(RAIZ, 'nucleo', f), 'utf8');
  const ponte = `
  (function () {
    const pend = new Map(); let seq = 0; const ouvCfg = [];
    globalThis.__kbResposta = (id, r) => { const p = pend.get(id); if (!p) return; pend.delete(id);
      if (r && r.__erro) p.rej(new Error(r.__erro)); else p.res(r); };
    globalThis.__kbConfigMudou = () => ouvCfg.forEach(f => { try { f(); } catch (_) {} });
    const pedir = (tipo, dados) => new Promise((res, rej) => {
      const id = ++seq; pend.set(id, { res, rej });
      try { globalThis.__kbPonte(JSON.stringify({ id, tipo, dados: dados || null })); }
      catch (e) { pend.delete(id); return rej(e); }
      setTimeout(() => { if (pend.delete(id)) rej(new Error('o bot não respondeu (' + tipo + ')')); }, 30000);
    });
    const comecar = () => KBAgente.iniciar({
      nome: 'bot', intervaloPrintMs: 1500, larguraImagem: ${cfg.larguraImagem}, qualidadeImagem: ${cfg.qualidadeImagem}, pedir, debug: ${!!process.env.KB_DEBUG},
      clicar: (alvo, x, y) => pedir('clicar', { x, y }),
      aoMudarConfig: (f) => ouvCfg.push(f),
    }, { sites: ${JSON.stringify(cfg.sites)} });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comecar, { once: true }); else comecar();
  })();`;
  return `${ler('visao.js')}\n${ler('agente.js')}\n${ponte}\n//# sourceURL=kahoot-bot-agente.js`;
}

// ------------------------------------------------------------------ principal
async function principal() {
  const cfg = lerConfig();
  console.log(`\n${NEG}🤖 Kahoot Bot${R}`);
  const rt = process.versions.electron ? `Node ${process.version} embutido no VS Code (Electron ${process.versions.electron})` : `Node ${process.version}`;
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
    throw new Error(`Este runtime (${rt}) é antigo demais: precisa de Node 18+. Atualize o VS Code ou use o Node portátil (veja o README).`);
  }
  log(`Runtime: ${rt}`);
  const { gemini: chave, groq: chaveGroq } = await obterChaves();
  log(chaveGroq ? `Groq: ok (…${chaveGroq.slice(-4)}) — perguntas de texto vão pela Groq` : `${CINZA}Groq: sem chave (perguntas de texto vão pelo Gemini, mais lento)${R}`);
  log(chave ? `Gemini: ok (…${chave.slice(-4)}) — usado em perguntas com imagem` : `${CINZA}Gemini: sem chave (perguntas com imagem vão pela Groq, só pelo texto)${R}`);

  const exe = acharNavegador(cfg.navegador);
  if (!exe) throw new Error('Não achei Chrome nem Edge. Coloque o caminho do executável em "navegador" no config.json.');
  log(`Navegador: ${exe}`);

  const gerente = G.criarGerenciador(Object.assign({}, cfg, { chave, chaves: { groq: chaveGroq } }));
  log(`Modelos (ordem de preferência): ${gerente.saude.map(s => s.modelo).join(', ')}`);
  const mostrarSaude = (r) => {
    for (const m of r.modelos) log(m.ok ? `${VERDE}✓${R} ${m.modelo} respondeu em ${m.ms} ms` : `${VERM}✗ ${m.modelo}: ${m.erro}${R}`);
    if (r.preciso) log(`Usando: ${NEG}${r.preciso}${R}${r.rapido ? ` + ${r.rapido} (corrida)` : ` (se demorar mais de ${(cfg.reforcoMs || 2500) / 1000} s, chama o próximo em paralelo)`}`);
    else log(`${VERM}Nenhum modelo respondeu. O bot vai continuar tentando.${R}`);
  };
  // aquece o Gemini enquanto o navegador abre (valida chave/modelos, mede o tempo e abre a conexão)
  const aquecimento = gerente.aquecer().then((r) => { mostrarSaude(r); return r; });

  const { proc, url, perfil } = await abrirNavegador(exe);
  const cdp = await CDP.conectar(url);
  const pacote = montarPacote(cfg);
  const sessoes = new Map(); // sessionId -> {targetId}
  let ativo = true, infoMostrada = false;
  const historico = [];
  const dirResult = process.env.KB_RESULTADOS || path.join(RAIZ, 'resultados');
  const arqHist = path.join(dirResult, `historico-${new Date().toISOString().slice(0, 10)}.jsonl`);

  async function responderPonte(sessionId, contextId, id, resposta) {
    try {
      await cdp.enviar('Runtime.evaluate', {
        expression: `globalThis.__kbResposta(${id}, ${JSON.stringify(resposta)})`, contextId,
      }, sessionId);
    } catch (_) { /* página navegou no meio */ }
  }

  // Print da área visível, sem recorte/escala (recorte com escala faz a página piscar no Chrome com janela).
  // A redução para no máximo 1280 px é feita na própria página (nucleo/agente.js).
  async function capturar(sessionId, dados) {
    const r = await cdp.enviar('Page.captureScreenshot', {
      format: 'jpeg', quality: (dados && dados.qualidade) || cfg.qualidadeImagem, optimizeForSpeed: true,
    }, sessionId, 8000);
    return { ok: true, base64: r.data };
  }

  async function tratar(sessionId, tipo, dados) {
    if (process.env.KB_DEBUG) log(`${CINZA}[ponte] ${tipo}${R}`);
    switch (tipo) {
      case 'config':
        return { ativo, cliqueAutomatico: cfg.cliqueAutomatico, mostrarOverlay: cfg.mostrarOverlay, temChave: true };
      case 'aquecer':
        return aquecimento;
      case 'alternar':
        ativo = !ativo;
        log(ativo ? `${VERDE}▶ Bot retomado${R}` : '⏸ Bot pausado (Alt+Shift+K para retomar)');
        for (const s of sessoes.keys()) if (s !== sessionId) avisarConfig(s);
        return { ativo };
      case 'capturar':
        return capturar(sessionId, dados);
      case 'clicar': {
        const base = { x: dados.x, y: dados.y, button: 'left', clickCount: 1 };
        await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dados.x, y: dados.y }, sessionId);
        await cdp.enviar('Input.dispatchMouseEvent', Object.assign({ type: 'mousePressed', buttons: 1 }, base), sessionId);
        await cdp.enviar('Input.dispatchMouseEvent', Object.assign({ type: 'mouseReleased', buttons: 0 }, base), sessionId);
        return { ok: true };
      }
      case 'teclas': {
        const VK = { Home: 36, End: 35, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, PageUp: 33, PageDown: 34, ' ': 32, Enter: 13 };
        for (const k of dados.teclas || []) {
          const base = { key: k, code: k === ' ' ? 'Space' : k, windowsVirtualKeyCode: VK[k] || 0, nativeVirtualKeyCode: VK[k] || 0 };
          if (k === ' ') base.text = ' ';
          await cdp.enviar('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base), sessionId);
          await cdp.enviar('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base), sessionId);
        }
        return { ok: true };
      }
      case 'arrastar': {
        const { x1, y1, x2, y2 } = dados;
        const mv = (x, y, extra) => cdp.enviar('Input.dispatchMouseEvent', Object.assign({ type: 'mouseMoved', x, y, button: 'left', buttons: 1 }, extra || {}), sessionId);
        await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 }, sessionId);
        await cdp.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 }, sessionId);
        await new Promise(r => setTimeout(r, 120));
        await mv(x1, y1 + (y2 > y1 ? 8 : -8));                       // passa do limite de "arraste" das bibliotecas
        await new Promise(r => setTimeout(r, 60));
        const passos = 14;
        for (let i = 1; i <= passos; i++) { await mv(x1 + (x2 - x1) * i / passos, y1 + (y2 - y1) * i / passos); await new Promise(r => setTimeout(r, 18)); }
        await new Promise(r => setTimeout(r, 150));
        await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 }, sessionId);
        return { ok: true };
      }
      case 'responderOrdem': {
        const ids = dados.itens.map(i => i.id);
        try {
          const r = await gerente.responder({
            montarCorpo: (nivel) => G.montarPedidoOrdem({ imagemBase64: dados.imagem, textoTela: dados.textoTela, itens: dados.itens, nivel }),
            ler: (json) => G.lerOrdem(json, ids), decorridoMs: dados.decorridoMs || 0, temImagem: !!dados.imagem, nivelGroq: 'high',
          });
          return { ok: true, ordem: r.cor, modelo: r.modelo, msIA: r.ms };
        } catch (e) { return { ok: false, erro: e.message }; }
      }
      case 'responderNumero': {
        const { min, max, step } = dados;
        try {
          const r = await gerente.responder({
            montarCorpo: (nivel) => G.montarPedidoNumero({ imagemBase64: dados.imagem, textoTela: dados.textoTela, min, max, step, nivel }),
            ler: (json) => G.lerNumero(json, min, max, step), decorridoMs: dados.decorridoMs || 0, temImagem: !!dados.imagem, nivelGroq: 'high',
          });
          return { ok: true, valor: r.cor, modelo: r.modelo, msIA: r.ms };
        } catch (e) { return { ok: false, erro: e.message }; }
      }
      case 'responder': {
        const cores = dados.alternativas.map(a => a.id || a.cor);
        let textoTela = dados.textoTela, temImagem = !!dados.imagem && !dados.ocr, nivelGroq = dados.ocr ? 'medium' : undefined, transcritoPor = '';
        // Pergunta com imagem: um modelo que enxerga TRANSCREVE o código/texto da imagem e a Groq resolve (rápido e certeiro).
        if (temImagem && chaveGroq) {
          const limite = Math.max(800, (cfg.prazoTranscricaoMs || 3200) - (dados.decorridoMs || 0));
          try {
            const tr = await Promise.race([
              gerente.responder({ montarCorpo: (nivel) => G.montarPedidoTranscricao({ imagemBase64: dados.imagem, nivel: '' }), ler: G.lerTexto, apenasVisao: true, decorridoMs: dados.decorridoMs || 0 }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('transcrição demorou')), limite)),
            ]);
            if (tr && typeof tr.cor === 'string' && tr.cor.length >= 5) {
              textoTela += `\n\nTEXTO/CÓDIGO DA IMAGEM DA PERGUNTA (transcrito):\n"""\n${tr.cor.slice(0, 3000)}\n"""`;
              temImagem = false; nivelGroq = 'medium'; transcritoPor = `${tr.modelo} ${tr.ms} ms`;
            }
          } catch (e) { if (process.env.KB_DEBUG) log(`${CINZA}transcrição falhou: ${e.message}${R}`); }
        }
        const montarCorpo = (nivel) => G.montarPedido({ imagemBase64: dados.imagem, alternativas: dados.alternativas, textoTela, nivel });
        try {
          const r = await gerente.responder({ montarCorpo, cores, decorridoMs: dados.decorridoMs || 0, temImagem, nivelGroq });
          return { ok: true, cor: r.cor, modelo: r.modelo, msIA: r.ms, detalhes: r.detalhes, transcritoPor };
        } catch (e) {
          return { ok: false, erro: e.message, detalhes: e.detalhes };
        }
      }
      case 'registrar': {
        const d = dados || {};
        historico.push(d);
        const perg = (d.pergunta || '').slice(0, 70);
        if (d.ok && d.ordem) {
          log(`${NEG}ordem → ${d.ordem.join(' · ').slice(0, 120)}${R} ${NEG}${(d.msTotal / 1000).toFixed(2)}s${R} ${CINZA}(IA ${d.msIA} ms, ${d.modelo}${d.conferido ? '' : ', ⚠ ordem final diferente'})${R}`);
          if (perg) log(`${CINZA}   ${perg}${R}`);
        } else if (d.ok && d.slider) {
          log(`${NEG}régua → ${d.valor}${R} ${NEG}${(d.msTotal / 1000).toFixed(2)}s${R} ${CINZA}(IA ${d.msIA} ms, ${d.modelo}${d.conferido ? '' : ', ⚠ não conferiu o valor'})${R}`);
          if (perg) log(`${CINZA}   ${perg}${R}`);
        } else if (d.ok) {
          const t = (d.msTotal / 1000).toFixed(2);
          log(`${COR_TERM[d.cor] || ''} ${d.texto ? d.texto.slice(0, 50) : d.cor.toUpperCase()} ${R} ${NEG}${t}s${R} ${CINZA}(IA ${d.msIA} ms, ${d.modelo}${d.clicou ? '' : ', sem clique'}, ${d.cores.length} alternativas${d.comPrint ? ', com print' : ''}${d.ocr ? ', código lido por OCR' : ''}${d.transcritoPor ? `, imagem lida por ${d.transcritoPor}` : ''})${R}`);
          if (perg) log(`${CINZA}   ${perg}${R}`);
          if (d.lista) log(`${CINZA}   alternativas: ${d.lista.map((t, i) => `${i + 1}) ${String(t).slice(0, 25)}`).join(' · ')} → clicou na ${d.escolhaIdx}${d.pontoOk === false ? ` ${VERM}(⚠ ponto do clique fora da alternativa; sob o clique: "${(d.sobClique || '').slice(0, 25)}")` : ''}${R}`);
        } else {
          log(`${VERM}✗ sem resposta: ${d.erro}${R}`);
        }
        try { fs.mkdirSync(dirResult, { recursive: true }); fs.appendFileSync(arqHist, JSON.stringify(d) + '\n'); } catch (_) {}
        return { ok: true };
      }
      case 'veredito': {
        const v = dados.veredito;
        if (!['correto', 'incorreto', 'tempo'].includes(v)) return { ok: true };
        const marca = v === 'correto' ? `${VERDE}✓ Kahoot: CORRETO${R}` : v === 'incorreto' ? `${VERM}✗ Kahoot: INCORRETO${R}` : `${CINZA}Kahoot: ${v}${R}`;
        log(`   ${marca} ${CINZA}(${(dados.pergunta || '').slice(0, 50)} → ${(dados.escolha || '').slice(0, 40)})${R}`);
        historico.push({ veredito: v, pergunta: dados.pergunta, escolha: dados.escolha });
        try { fs.mkdirSync(dirResult, { recursive: true }); fs.appendFileSync(arqHist, JSON.stringify({ veredito: v, pergunta: dados.pergunta, escolha: dados.escolha }) + '\n'); } catch (_) {}
        return { ok: true };
      }
      case 'info': {
        if (!infoMostrada) { infoMostrada = true; log(dados.ocr ? `${VERDE}OCR do Chrome: disponível${R} — código em imagem é lido e resolvido pela Groq` : `${CINZA}OCR do Chrome: indisponível neste PC — código em imagem vai pro Gemini${R}`); }
        return { ok: true };
      }
      case 'ping':
        return { ok: true };
      default:
        return { __erro: `tipo desconhecido: ${tipo}` };
    }
  }

  function avisarConfig(sessionId) {
    const s = sessoes.get(sessionId);
    if (s && s.contextId) cdp.enviar('Runtime.evaluate', { expression: 'globalThis.__kbConfigMudou && globalThis.__kbConfigMudou()', contextId: s.contextId }, sessionId).catch(() => {});
  }

  if (process.env.KB_DEBUG) {
    cdp.on('Runtime.exceptionThrown', (p) => log(`${VERM}[página] ${(p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text}${R}`));
    cdp.on('Runtime.consoleAPICalled', (p) => log(`${CINZA}[console] ${p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ')}${R}`));
  }
  cdp.on('Runtime.bindingCalled', async (p, sessionId) => {
    if (p.name !== '__kbPonte') return;
    let msg; try { msg = JSON.parse(p.payload); } catch (_) { return; }
    const s = sessoes.get(sessionId); if (s) s.contextId = p.executionContextId;
    let resp; const t0 = Date.now();
    try { resp = await tratar(sessionId, msg.tipo, msg.dados); } catch (e) { resp = { __erro: e.message }; }
    if (process.env.KB_DEBUG) log(`${CINZA}[ponte] ${msg.tipo} ← ${Date.now() - t0} ms ${resp && resp.__erro ? 'ERRO ' + resp.__erro : ''}${R}`);
    responderPonte(sessionId, p.executionContextId, msg.id, resp);
  });

  const anexos = new Map(); // targetId -> Promise<sessionId|null>
  function anexar(targetId) {
    if (anexos.has(targetId)) return anexos.get(targetId);
    const p = (async () => {
      try {
        const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
        sessoes.set(sessionId, { targetId });
        await cdp.enviar('Runtime.enable', {}, sessionId);   // sem isso o Chrome não avisa as chamadas da ponte
        await cdp.enviar('Runtime.addBinding', { name: '__kbPonte', executionContextName: 'kahootbot' }, sessionId);
        await cdp.enviar('Page.enable', {}, sessionId);
        await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: pacote, worldName: 'kahootbot' }, sessionId);
        return sessionId;
      } catch (e) {
        if (!/No target with given id|Target closed/i.test(e.message)) log(`${VERM}Falha ao preparar aba: ${e.message}${R}`);
        return null;
      }
    })();
    anexos.set(targetId, p);
    return p;
  }

  cdp.on('Target.targetCreated', ({ targetInfo }) => { if (targetInfo.type === 'page') anexar(targetInfo.targetId); });
  cdp.on('Target.detachedFromTarget', ({ sessionId }) => sessoes.delete(sessionId));
  await cdp.enviar('Target.setDiscoverTargets', { discover: true });

  // a aba inicial (about:blank) é preparada antes de navegar até o Kahoot
  const { targetInfos } = await cdp.enviar('Target.getTargets');
  const paginas = targetInfos.filter(t => t.type === 'page');
  const tA = Date.now();
  paginas.slice(1).forEach(t => anexar(t.targetId));
  const primeira = paginas[0] && await anexar(paginas[0].targetId);
  if (process.env.KB_DEBUG) log(`${CINZA}aba preparada em ${Date.now() - tA} ms (${paginas.length} abas)${R}`);
  if (primeira) {
    await cdp.enviar('Page.bringToFront', {}, primeira).catch(() => {});
    await cdp.enviar('Page.navigate', { url: cfg.urlInicial }, primeira);
  }
  if (process.env.KB_DEBUG) log(`${CINZA}navegou em ${Date.now() - tA} ms${R}`);

  log(`${VERDE}Pronto!${R} Entre no jogo pela janela que abriu. ${CINZA}(Alt+Shift+K pausa · Ctrl+C aqui encerra)${R}`);

  let saindo = false;
  const sair = (codigo) => {
    if (saindo) return; saindo = true;
    const ok = historico.filter(h => h.ok);
    const vs = historico.filter(h => h.veredito);
    if (vs.length) log(`Kahoot: ${vs.filter(h => h.veredito === 'correto').length} corretas · ${vs.filter(h => h.veredito === 'incorreto').length} incorretas · ${vs.filter(h => !['correto', 'incorreto'].includes(h.veredito)).length} sem veredito`);
    if (ok.length) {
      const ts = ok.map(h => h.msTotal).sort((a, b) => a - b);
      log(`Resumo: ${ok.length} respondidas · mediana ${(ts[ts.length >> 1] / 1000).toFixed(2)}s · pior ${(ts[ts.length - 1] / 1000).toFixed(2)}s · histórico em resultados/`);
    }
    const fim = () => { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (_) {} process.exitCode = codigo; setTimeout(() => process.exit(codigo), 300).unref(); };
    if (proc.exitCode !== null) return fim();
    proc.once('exit', () => setTimeout(fim, 200));
    cdp.enviar('Browser.close').catch(() => {});
    setTimeout(() => { try { proc.kill(); } catch (_) {} }, 1500).unref();
    setTimeout(fim, 4000).unref();
  };
  cdp.aoFechar(() => { log('Navegador fechado. Encerrando.'); sair(0); });
  process.on('SIGINT', () => { log('Encerrando…'); sair(0); });
  process.on('SIGTERM', () => sair(0));
}

principal().catch((e) => {
  console.error(`\n${VERM}✗ ${e.message}${R}\n`);
  process.exit(1);
});
