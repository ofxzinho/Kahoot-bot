// testes/servidor-mock.js — servidor local que imita (1) as telas do Kahoot e (2) a API do Gemini.
// Usado pelos testes simulados. NÃO é o Kahoot nem o Gemini de verdade.
'use strict';
const http = require('http');
const { paginaKahoot } = require('./paginas-mock');

// largura/altura de um JPEG (marcador SOF) — para conferir o tamanho do print enviado
function tamanhoJpeg(b64) {
  const b = Buffer.from(b64, 'base64');
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xC3) return { largura: b.readUInt16BE(i + 7), altura: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function criarServidor() {
  const estado = {
    eventos: [],              // relatórios enviados pela página (mostrou / clicou / resultado)
    pedidosIA: [],            // pedidos recebidos pela "API Gemini"
    corretaAtual: null,       // cor correta da pergunta que está na tela
    modelos: {},              // comportamento por modelo: {atraso, modo}
    padrao: { atraso: 300, modo: 'ok' },
  };

  function json(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  }
  function lerCorpo(req) {
    return new Promise(res => { const p = []; req.on('data', d => p.push(d)); req.on('end', () => res(Buffer.concat(p).toString('utf8'))); });
  }

  async function gemini(req, res, modelo) {
    const corpo = JSON.parse(await lerCorpo(req) || '{}');
    const gc = corpo.generationConfig || {};
    const partes = ((corpo.contents || [])[0] || {}).parts || [];
    const img = partes.find(p => p.inlineData);
    const texto = partes.filter(p => p.text).map(p => p.text).join('\n');
    const props = (gc.responseJsonSchema && gc.responseJsonSchema.properties) || {};
    let enumCores = (props.resposta || props.cor || {}).enum;
    const ehNumero = !!props.valor;
    if (ehNumero) enumCores = ['x'];
    const ehAquecimento = !enumCores;
    const reg = {
      modelo, t: Date.now(), aquecimento: ehAquecimento, chave: req.headers['x-goog-api-key'],
      nivel: gc.thinkingConfig && gc.thinkingConfig.thinkingLevel, temImagem: !!img,
      bytesImagem: img ? Math.round(img.inlineData.data.length * 3 / 4) : 0, enum: enumCores || null,
      dimImagem: img ? tamanhoJpeg(img.inlineData.data) : null,
      temSystem: !!corpo.systemInstruction, texto: texto.slice(0, 4000), corretaNaHora: estado.corretaAtual,
    };
    estado.pedidosIA.push(reg);
    const comp = Object.assign({}, estado.padrao, estado.modelos[modelo] || {});
    if (comp.modo === 'travar') return; // nunca responde (testa timeout)
    if (comp.modo === '503') { await new Promise(r => setTimeout(r, ehAquecimento ? Math.min(comp.atraso, 200) : comp.atraso)); return json(res, 503, { error: { code: 503, message: 'This model is currently experiencing high demand.' } }); }
    await new Promise(r => setTimeout(r, ehAquecimento ? Math.min(comp.atraso, 200) : comp.atraso));
    if (/Transcreva EXATAMENTE/.test(texto)) {
      await new Promise(r => setTimeout(r, 0));
      return json(res, 200, { candidates: [{ content: { parts: [{ text: 'let x = null;\nconsole.log(typeof x);' }] }, finishReason: 'STOP' }] });
    }
    if (ehAquecimento) {
      if (comp.modo === 'chave') return json(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } });
      if (comp.modo === '404') return json(res, 404, { error: { code: 404, message: `models/${modelo} is not found` } });
      return json(res, 200, { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] });
    }
    let cor = estado.corretaAtual && enumCores.includes(estado.corretaAtual) ? estado.corretaAtual : enumCores[0];
    // modo "por número": acha o número da alternativa com o texto certo
    const linhaCerta = estado.corretaTexto && texto.split('\n').map(l => l.match(/^(\d+)\) (.*)$/)).find(m => m && m[2] === estado.corretaTexto);
    if (linhaCerta) cor = linhaCerta[1];
    if (comp.modo === 'errar') cor = enumCores.find(c => c !== cor);
    if (ehNumero) return json(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ valor: estado.corretaNumero }) }] }, finishReason: 'STOP' }] });
    const ok = (t) => json(res, 200, { candidates: [{ content: { parts: [{ text: t }], role: 'model' }, finishReason: 'STOP' }] });
    switch (comp.modo) {
      case 'ok': case 'errar': return ok(JSON.stringify({ resposta: cor }));
      case 'texto-livre': return ok(`A resposta correta é a ${cor}.`);
      case 'json-invalido': return ok('{"cor": ');
      case 'enum-invalido': return ok('{"resposta":"roxo"}');
      case 'vazio': return json(res, 200, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] });
      case 'bloqueado': return json(res, 200, { promptFeedback: { blockReason: 'OTHER' } });
      case '500': return json(res, 500, { error: { code: 500, message: 'Internal error' } });
      case '429': return json(res, 429, { error: { code: 429, message: 'Resource has been exhausted' } });
      case 'chave': return json(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } });
      case 'nao-json': res.writeHead(502, { 'Content-Type': 'text/html' }); return res.end('<html>Bad gateway</html>');
      default: return ok(JSON.stringify({ resposta: cor }));
    }
  }

  const servidor = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Private-Network': 'true' });
      return res.end();
    }
    if (u.pathname === '/openai/v1/chat/completions' && req.method === 'POST') {
      const corpo = JSON.parse(await lerCorpo(req) || '{}');
      const usuario = (corpo.messages || []).filter(m => m.role === 'user').map(m => Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n') : m.content).join('\n');
      const comp = Object.assign({}, estado.padrao, estado.modelos['groq:' + corpo.model] || {});
      if (comp.modo === '404') return json(res, 404, { error: { message: `The model ${corpo.model} does not exist` } });
      estado.pedidosIA.push({ modelo: 'groq:' + corpo.model, t: Date.now(), aquecimento: !/Responda SOMENTE/.test(usuario), temImagem: false, texto: usuario.slice(0, 2000) });
      if (comp.modo === 'travar') return;
      await new Promise(r => setTimeout(r, comp.atraso));
      if (comp.modo === '503') return json(res, 503, { error: { message: 'over capacity' } });
      let resposta = 'ok';
      if (/"ordem"/.test(usuario) && estado.corretaOrdem) {
        const linhas = usuario.split('\n').map(x => x.match(/^(\d+)\) (.*)$/)).filter(Boolean);
        resposta = JSON.stringify({ ordem: estado.corretaOrdem.map(t => (linhas.find(l => l[2] === t) || [])[1]) });
      } else if (/"valor"/.test(usuario)) resposta = JSON.stringify({ valor: estado.corretaNumero });
      else if (/Responda SOMENTE/.test(usuario)) {
        const l = estado.corretaTexto && usuario.split('\n').map(x => x.match(/^(\d+)\) (.*)$/)).find(x => x && x[2] === estado.corretaTexto);
        resposta = JSON.stringify({ resposta: l ? l[1] : (estado.corretaAtual || '1') });
      }
      return json(res, 200, { choices: [{ message: { role: 'assistant', content: resposta } }] });
    }
    const m = u.pathname.match(/^\/v1beta\/models\/([^/:]+):generateContent$/);
    if (m && req.method === 'POST') return gemini(req, res, decodeURIComponent(m[1]));
    if (u.pathname === '/v1beta/models' && req.method === 'GET') return json(res, 200, { models: Object.keys(estado.modelos).map(m => ({ name: 'models/' + m })) });
    if (u.pathname === '/__relatorio' && req.method === 'POST') {
      const ev = JSON.parse(await lerCorpo(req) || '{}');
      ev.recebido = Date.now();
      estado.eventos.push(ev);
      if (ev.tipo === 'mostrou') { estado.corretaAtual = ev.correta; estado.corretaTexto = ev.corretaTexto; estado.corretaNumero = ev.corretaNumero; estado.corretaOrdem = ev.corretaOrdem; }
      if (ev.tipo === 'saiu') estado.corretaAtual = null;
      return json(res, 200, { ok: true });
    }
    if (u.pathname.startsWith('/kahoot/')) {
      const cenario = u.pathname.slice('/kahoot/'.length);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(paginaKahoot(cenario, Object.fromEntries(u.searchParams)));
    }
    json(res, 404, { erro: 'não encontrado' });
  });

  return {
    estado,
    iniciar: () => new Promise(r => servidor.listen(0, '127.0.0.1', () => r(servidor.address().port))),
    parar: () => new Promise(r => { servidor.closeAllConnections && servidor.closeAllConnections(); servidor.close(() => r()); }),
    configurar(modelos, padrao) { estado.modelos = modelos || {}; if (padrao) estado.padrao = padrao; },
    limpar() { estado.eventos = []; estado.pedidosIA = []; estado.corretaAtual = null; },
  };
}

module.exports = { criarServidor, tamanhoJpeg };
