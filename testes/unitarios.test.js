// testes/unitarios.test.js — testes de unidade (node --test testes/). Não usam rede nem navegador.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const V = require('../nucleo/visao');
const G = require('../nucleo/gemini');

// ---------------------------------------------------------------- visão
test('classifica as 4 cores do Kahoot e ignora o roxo do fundo', () => {
  assert.equal(V.classificarRGB(226, 27, 60), 'vermelho');
  assert.equal(V.classificarRGB(19, 104, 206), 'azul');
  assert.equal(V.classificarRGB(216, 158, 0), 'amarelo');
  assert.equal(V.classificarRGB(38, 137, 12), 'verde');
  assert.equal(V.classificarRGB(70, 23, 143), null);   // roxo #46178F
  assert.equal(V.classificarRGB(134, 76, 191), null);  // timer #864CBF
  assert.equal(V.classificarRGB(255, 255, 255), null);
  assert.equal(V.classificarRGB(242, 242, 242), null);
});

test('aceita variações de hover/sombra (mais escuro/claro)', () => {
  assert.equal(V.classificarRGB(190, 20, 50), 'vermelho');
  assert.equal(V.classificarRGB(16, 88, 175), 'azul');
  assert.equal(V.classificarRGB(240, 175, 10), 'amarelo');
  assert.equal(V.classificarRGB(32, 115, 10), 'verde');
});

test('lê cores CSS em vários formatos', () => {
  assert.equal(V.classificarCss('rgb(226, 27, 60)'), 'vermelho');
  assert.equal(V.classificarCss('rgba(19, 104, 206, 1)'), 'azul');
  assert.equal(V.classificarCss('rgb(216 158 0 / 90%)'), 'amarelo');
  assert.equal(V.classificarCss('rgba(38, 137, 12, 0.2)'), null);   // quase transparente
  assert.equal(V.classificarCss('rgba(0, 0, 0, 0)'), null);
  assert.equal(V.classificarCss(''), null);
});

function imagem(larg, alt, fundo, retangulos) {
  const d = new Uint8ClampedArray(larg * alt * 4);
  for (let i = 0; i < larg * alt; i++) d.set([...fundo, 255], i * 4);
  for (const [x0, y0, w, h, cor, buracos] of retangulos) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const buraco = buracos && (x - x0) % 7 < 2 && (y - y0) > h * 0.4 && (y - y0) < h * 0.6; // "texto" branco
      d.set(buraco ? [255, 255, 255, 255] : [...cor, 255], (y * larg + x) * 4);
    }
  }
  return d;
}
const RGB = { vermelho: [226, 27, 60], azul: [19, 104, 206], amarelo: [216, 158, 0], verde: [38, 137, 12] };

test('detecta 4 caixas num print (com "texto" branco dentro)', () => {
  const W = 320, H = 180;
  const d = imagem(W, H, [242, 242, 242], [
    [2, 110, 155, 30, RGB.vermelho, true], [163, 110, 155, 30, RGB.azul, true],
    [2, 145, 155, 30, RGB.amarelo, true], [163, 145, 155, 30, RGB.verde, true]]);
  const b = V.detectarBlocos(d, W, H);
  assert.deepEqual(b.map(x => x.cor).sort(), ['amarelo', 'azul', 'verde', 'vermelho']);
  const az = b.find(x => x.cor === 'azul');
  assert.ok(Math.abs(az.cx - 240.5) < 2 && Math.abs(az.cy - 125) < 2);
});

test('ignora tela inteira verde/vermelha (correto/incorreto) e enfeites pequenos', () => {
  const W = 320, H = 180;
  assert.equal(V.detectarBlocos(imagem(W, H, RGB.verde, []), W, H).length, 0);
  assert.equal(V.detectarBlocos(imagem(W, H, [70, 23, 143], [[10, 10, 6, 6, RGB.vermelho], [20, 10, 6, 6, RGB.azul]]), W, H).length, 0);
});

test('verdadeiro/falso: 2 caixas', () => {
  const W = 320, H = 180;
  const b = V.detectarBlocos(imagem(W, H, [242, 242, 242], [[2, 100, 155, 75, RGB.azul, true], [163, 100, 155, 75, RGB.vermelho, true]]), W, H);
  assert.deepEqual(b.map(x => x.cor).sort(), ['azul', 'vermelho']);
});

test('descarta bloco de tamanho muito diferente das outras caixas', () => {
  const r = V.filtrarParecidos([{ cor: 'azul', w: 100, h: 40 }, { cor: 'vermelho', w: 100, h: 40 }, { cor: 'verde', w: 30, h: 150 }]);
  assert.deepEqual(r.map(x => x.cor), ['azul', 'vermelho']);
});

// ---------------------------------------------------------------- pedido e resposta
const ALTS = [{ cor: 'vermelho', texto: 'Sydney' }, { cor: 'azul', texto: 'Canberra' }];

test('monta o pedido com imagem, texto exato, enum de cores e nível de raciocínio', () => {
  const p = G.montarPedido({ imagemBase64: 'QUJD', alternativas: ALTS, textoTela: 'Qual é a capital?', nivel: 'low' });
  assert.equal(p.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
  assert.match(p.contents[0].parts[1].text, /Canberra/);
  assert.deepEqual(p.generationConfig.responseJsonSchema.properties.resposta.enum, ['vermelho', 'azul']);
  const q = G.montarPedido({ imagemBase64: null, alternativas: [{ id: '1', cor: 'azul', texto: 'Pilha' }, { id: '2', cor: 'verde', texto: 'Fila' }], textoTela: 'LIFO?', nivel: '' });
  assert.match(q.contents[0].parts[0].text, /1\) Pilha\n2\) Fila/);
  assert.deepEqual(q.generationConfig.responseJsonSchema.properties.resposta.enum, ['1', '2']);
  assert.equal(p.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(p.generationConfig.responseMimeType, 'application/json');
  assert.ok(p.systemInstruction.parts[0].text.includes('Kahoot'));
});

test('sem imagem e sem texto: pedido continua válido', () => {
  const p = G.montarPedido({ imagemBase64: null, alternativas: [{ cor: 'azul', texto: '' }, { cor: 'verde', texto: '' }], textoTela: '', nivel: 'minimal' });
  assert.equal(p.contents[0].parts.length, 1);
  assert.match(p.contents[0].parts[0].text, /print/);
});

const resp = (texto, extra) => Object.assign({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }] }, extra);
test('lê respostas válidas e "quase válidas"', () => {
  assert.equal(G.lerResposta(resp('{"cor":"azul"}'), ['vermelho', 'azul']), 'azul');
  assert.equal(G.lerResposta(resp('{"cor":" Azul "}'), ['vermelho', 'azul']), 'azul');
  assert.equal(G.lerResposta(resp('A resposta é vermelho.'), ['vermelho', 'azul']), 'vermelho');
  const comPensamento = { candidates: [{ content: { parts: [{ text: 'pensando em vermelho', thought: true }, { text: '{"cor":"azul"}' }] } }] };
  assert.equal(G.lerResposta(comPensamento, ['vermelho', 'azul']), 'azul');
});

test('rejeita respostas inválidas da API', () => {
  const cores = ['vermelho', 'azul'];
  for (const r of [resp('{"cor":"roxo"}'), resp('{"cor": '), resp('vermelho ou azul'), resp(''),
    { candidates: [] }, { promptFeedback: { blockReason: 'OTHER' } }, null, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }]) {
    assert.throws(() => G.lerResposta(r, cores), G.ErroIA);
  }
});

// ---------------------------------------------------------------- chamada HTTP (servidor local)
function servidor(handler) {
  return new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
}
const corpoPadrao = G.montarPedido({ imagemBase64: null, alternativas: ALTS, textoTela: 'x', nivel: 'low' });
const chamar = (porta, extra) => G.chamarModelo(Object.assign({ apiBase: `http://127.0.0.1:${porta}`, chave: 'k', modelo: 'm', corpo: corpoPadrao, cores: ['vermelho', 'azul'], timeoutMs: 2000 }, extra));

test('chamarModelo: sucesso, cabeçalho da chave e URL corretos', async () => {
  let visto;
  const s = await servidor((req, res) => { visto = { url: req.url, chave: req.headers['x-goog-api-key'] }; res.end(JSON.stringify(resp('{"cor":"azul"}'))); });
  const r = await chamar(s.address().port);
  assert.equal(r.cor, 'azul');
  assert.equal(visto.url, '/v1beta/models/m:generateContent');
  assert.equal(visto.chave, 'k');
  s.close();
});

test('chamarModelo: erros HTTP viram mensagens claras', async () => {
  const casos = [[400, 'API key not valid', 'chave'], [404, 'not found', 'modelo'], [429, 'exhausted', 'limite'], [500, 'x', 'servidor']];
  for (const [status, msg, tipo] of casos) {
    const s = await servidor((req, res) => { res.statusCode = status; res.end(JSON.stringify({ error: { message: msg } })); });
    await assert.rejects(chamar(s.address().port), (e) => e.tipo === tipo);
    s.close();
  }
});

test('chamarModelo: timeout e falha de conexão', async () => {
  const s = await servidor(() => {});  // nunca responde
  const t0 = Date.now();
  await assert.rejects(chamar(s.address().port, { timeoutMs: 300 }), (e) => e.tipo === 'timeout');
  assert.ok(Date.now() - t0 < 1500);
  s.closeAllConnections(); s.close();
  await assert.rejects(chamar(1, {}), (e) => e.tipo === 'rede');  // porta fechada
});

test('chamarModelo: corpo que não é JSON (proxy da rede devolvendo HTML)', async () => {
  const s = await servidor((req, res) => { res.statusCode = 502; res.setHeader('Content-Type', 'text/html'); res.end('<html>bad gateway</html>'); });
  await assert.rejects(chamar(s.address().port), (e) => e.tipo === 'servidor');
  s.close();
});

// ---------------------------------------------------------------- corrida entre os 2 modelos
const falso = (atrasos, falhas = {}) => (modelo) => new Promise((res, rej) => setTimeout(() => {
  if (falhas[modelo]) rej(Object.assign(new G.ErroIA('falhou', 'servidor'), { modelo, ms: atrasos[modelo] }));
  else res({ cor: modelo === 'P' ? 'azul' : 'vermelho', ms: atrasos[modelo], modelo });
}, atrasos[modelo]));
const P = { modelo: 'P', nivel: 'low' }, Rp = { modelo: 'R', nivel: 'minimal' };

test('corrida: preciso dentro do prazo vence mesmo chegando depois do rápido', async () => {
  const r = await G.corrida({ chamar: falso({ P: 300, R: 50 }), preciso: P, rapido: Rp, prazoMs: 1000, usarCorrida: true });
  assert.equal(r.modelo, 'P');
});

test('corrida: preciso atrasado → usa o rápido no prazo', async () => {
  const t0 = Date.now();
  const r = await G.corrida({ chamar: falso({ P: 3000, R: 50 }), preciso: P, rapido: Rp, prazoMs: 400, usarCorrida: true });
  assert.equal(r.modelo, 'R');
  assert.ok(Date.now() - t0 < 700, `demorou ${Date.now() - t0} ms`);
});

test('corrida: preciso falha cedo → usa o rápido sem esperar o prazo', async () => {
  const t0 = Date.now();
  const r = await G.corrida({ chamar: falso({ P: 20, R: 100 }, { P: true }), preciso: P, rapido: Rp, prazoMs: 2000, usarCorrida: true });
  assert.equal(r.modelo, 'R');
  assert.ok(Date.now() - t0 < 500);
});

test('corrida: os dois atrasados → o primeiro que chegar', async () => {
  const r = await G.corrida({ chamar: falso({ P: 500, R: 300 }), preciso: P, rapido: Rp, prazoMs: 100, usarCorrida: true });
  assert.equal(r.modelo, 'R');
});

test('corrida: os dois falham → erro com detalhes', async () => {
  await assert.rejects(G.corrida({ chamar: falso({ P: 20, R: 30 }, { P: true, R: true }), preciso: P, rapido: Rp, prazoMs: 1000, usarCorrida: true }),
    (e) => e.detalhes.length === 2);
});

test('modo de um modelo só', async () => {
  const r = await G.corrida({ chamar: falso({ P: 50, R: 10 }), preciso: P, rapido: Rp, prazoMs: 10, usarCorrida: false });
  assert.equal(r.modelo, 'P');
});

// ---------------------------------------------------------------- gerenciador de modelos (lista + saúde + reserva)
function apiFalsa(comportamento) {
  // comportamento: modelo -> { status, atraso, cor }
  return async (url, init) => {
    const modelo = decodeURIComponent(url.match(/models\/([^:]+):/)[1]);
    const c = comportamento[modelo] || { status: 200, atraso: 10 };
    await new Promise((res, rej) => {
      const t = setTimeout(res, c.atraso || 0);
      init.signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    });
    const corpo = JSON.parse(init.body);
    const ehPergunta = !!corpo.generationConfig.responseJsonSchema;
    if (c.status !== 200) return { ok: false, status: c.status, json: async () => ({ error: { message: 'high demand' } }) };
    return { ok: true, status: 200, json: async () => resp(ehPergunta ? JSON.stringify({ resposta: c.cor || 'azul' }) : 'ok') };
  };
}
const LISTA = [{ modelo: 'A', nivel: 'low' }, { modelo: 'B', nivel: '' }, { modelo: 'C', nivel: 'minimal' }];
const montarCorpo = (nivel) => G.montarPedido({ imagemBase64: null, alternativas: ALTS, textoTela: 'x', nivel });

test('normaliza a lista de modelos (e aceita o config antigo)', () => {
  assert.deepEqual(G.normalizarModelos({ modelos: ['x', { modelo: 'y', nivel: 'low' }, 'x'] }).map(m => [m.modelo, m.nivel, m.provedor]), [['x', '', 'gemini'], ['y', 'low', 'gemini']]);
  const g = G.normalizarModelos({ modelos: [{ provedor: 'groq', modelo: 'openai/gpt-oss-120b' }] })[0];
  assert.equal(g.provedor, 'groq'); assert.equal(g.visao, false);
  assert.deepEqual(G.normalizarModelos({ modeloPreciso: 'p', nivelPreciso: 'low', modeloRapido: 'r' }).map(m => m.modelo), ['p', 'r']);
});

test('nível vazio não envia thinkingConfig', () => {
  assert.equal(montarCorpo('').generationConfig.thinkingConfig, undefined);
  assert.equal(montarCorpo('low').generationConfig.thinkingConfig.thinkingLevel, 'LOW');
});

test('aquecimento descarta modelos com 503 e escolhe os que respondem', async () => {
  const g = G.criarGerenciador({ usarCorrida: true, modelos: LISTA, chave: 'k', apiBase: 'http://x', fetchFn: apiFalsa({ A: { status: 503, atraso: 5 }, B: { status: 200, atraso: 30 }, C: { status: 200, atraso: 5 } }) });
  const r = await g.aquecer();
  assert.equal(r.preciso, 'B');            // 1º saudável (e dentro do prazo) na ordem de preferência
  assert.equal(r.rapido, 'C');             // saudável mais rápido entre os outros
  assert.equal(g.resumo().find(m => m.modelo === 'A').estado, 'falhou');
});

test('na pergunta, 503 nos dois primeiros → tenta o terceiro', async () => {
  const g = G.criarGerenciador({ modelos: LISTA, chave: 'k', apiBase: 'http://x', prazoMs: 2000, timeoutMs: 1000,
    fetchFn: apiFalsa({ A: { status: 503 }, B: { status: 503 }, C: { status: 200, atraso: 10, cor: 'vermelho' } }) });
  const r = await g.responder({ montarCorpo, cores: ['vermelho', 'azul'], decorridoMs: 0 });
  assert.equal(r.modelo, 'C'); assert.equal(r.cor, 'vermelho'); assert.equal(r.motivo, 'reforco');
  // na próxima pergunta os que falharam ficam de fora
  assert.equal(g.escolher().preciso.modelo, 'C');
});

test('modelo travado (timeout) fica de castigo e volta depois do tempo', async () => {
  let t = 1000;
  const g = G.criarGerenciador({ usarCorrida: true, modelos: LISTA.slice(0, 2), chave: 'k', apiBase: 'http://x', timeoutMs: 100, prazoMs: 2000, castigoMs: 60000, agora: () => t,
    fetchFn: apiFalsa({ A: { status: 200, atraso: 5000 }, B: { status: 200, atraso: 10 } }) });
  const r = await g.responder({ montarCorpo, cores: ['vermelho', 'azul'], decorridoMs: 0 });
  assert.equal(r.modelo, 'B');
  assert.equal(g.escolher().preciso.modelo, 'B');
  t += 61000;
  assert.equal(g.escolher().preciso.modelo, 'B');  // B já está "ok"; A voltou à lista mas como reserva
  assert.equal(g.escolher().rapido.modelo, 'A');
});

test('todos falhando → erro claro, sem travar', async () => {
  const g = G.criarGerenciador({ modelos: LISTA, chave: 'k', apiBase: 'http://x', prazoMs: 500, timeoutMs: 300,
    fetchFn: apiFalsa({ A: { status: 503 }, B: { status: 503 }, C: { status: 503 } }) });
  await assert.rejects(g.responder({ montarCorpo, cores: ['vermelho', 'azul'], decorridoMs: 0 }), /503/);
  // mesmo com todos "de castigo", a pergunta seguinte ainda tenta (nunca fica sem modelo)
  await assert.rejects(g.responder({ montarCorpo, cores: ['vermelho', 'azul'], decorridoMs: 0 }), /503/);
});

test('só um modelo funcionando e ele falha uma vez → a próxima pergunta usa ele de novo', async () => {
  let falhar = true;
  const base = apiFalsa({ A: { status: 503 }, B: { status: 503 }, C: { status: 200, atraso: 10 } });
  const fetchFn = (url, init) => (falhar && url.includes('/C:')) ? Promise.resolve({ ok: false, status: 503, json: async () => ({}) }) : base(url, init);
  const g = G.criarGerenciador({ modelos: LISTA, chave: 'k', apiBase: 'http://x', prazoMs: 500, timeoutMs: 300, fetchFn });
  await assert.rejects(g.responder({ montarCorpo, cores: ['vermelho', 'azul'], decorridoMs: 0 }));
  falhar = false;
  const r = await g.responder({ montarCorpo, cores: ['vermelho', 'azul'], decorridoMs: 0 });
  assert.equal(r.modelo, 'C');
});

test('modelo preferido lento (11 s no teste) perde a vez para um rápido (situação real de 03/11)', () => {
  const g = G.criarGerenciador({ usarCorrida: true, modelos: LISTA, chave: 'k', apiBase: 'http://x', prazoMs: 3000 });
  g.marcar('A', false, 100, '503'); g.marcar('B', true, 11081); g.marcar('C', true, 2906);
  const e = g.escolher();
  assert.equal(e.preciso.modelo, 'C');
  assert.equal(e.rapido.modelo, 'B');
});

test('Groq: converte o pedido (sem imagem, com formato JSON) e a resposta', () => {
  const corpo = G.montarPedido({ imagemBase64: null, alternativas: [{ id: '1', cor: 'azul', texto: 'Pilha' }, { id: '2', cor: 'verde', texto: 'Fila' }], textoTela: 'LIFO?', nivel: '' });
  const req = G.paraGroq(corpo, 'openai/gpt-oss-120b', 'low');
  assert.equal(req.model, 'openai/gpt-oss-120b'); assert.equal(req.reasoning_effort, 'low');
  assert.match(req.messages[1].content, /1\) Pilha/); assert.match(req.messages[1].content, /\{"resposta": "X"\}/);
  assert.equal(G.lerResposta(G.deGroq({ choices: [{ message: { content: '{"resposta": "1"}' } }] }), ['1', '2']), '1');
});

test('pergunta com imagem: Gemini e Groq juntos; vale o Gemini se chegar no prazo', async () => {
  const usados = [];
  const fetchFn = async (url, init) => { usados.push(url.includes('groq') || url.includes('chat/completions') ? 'groq' : 'gemini');
    return { ok: true, status: 200, json: async () => url.includes('chat/completions') ? { choices: [{ message: { content: '{"resposta":"1"}' } }] } : resp('{"resposta":"1"}') }; };
  const g = G.criarGerenciador({ modelos: [{ provedor: 'groq', modelo: 'q' }, { modelo: 'A' }], chave: 'k', chaves: { groq: 'g' }, apiBase: 'http://x', groqBase: 'http://groq', fetchFn });
  await g.aquecer(); usados.length = 0;
  const corpo = () => G.montarPedido({ imagemBase64: 'QUJD', alternativas: [{ id: '1', cor: 'azul', texto: 'a' }, { id: '2', cor: 'verde', texto: 'b' }], textoTela: 'x', nivel: '' });
  const r = await g.responder({ montarCorpo: corpo, cores: ['1', '2'], temImagem: true });
  assert.equal(r.modelo, 'A'); assert.deepEqual(usados.sort(), ['gemini', 'groq']);
  const r2 = await g.responder({ montarCorpo: corpo, cores: ['1', '2'], temImagem: false });
  assert.equal(r2.modelo, 'q');
});
