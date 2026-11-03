// nucleo/gemini.js — chamada à API do Gemini (REST generateContent) e "corrida" entre dois modelos.
// Script clássico: funciona no service worker (importScripts), no painel via file:// e no Node (testes).
(function (raiz) {
  'use strict';

  const API_PADRAO = 'https://generativelanguage.googleapis.com';
  const FORMAS = { vermelho: 'triângulo', azul: 'losango', amarelo: 'círculo', verde: 'quadrado' };

  const INSTRUCAO = [
    'Você responde perguntas de Kahoot (quiz de múltipla escolha) em português do Brasil.',
    'Você recebe o texto da pergunta e das alternativas extraído da página e, quando há imagem na pergunta, o print da tela.',
    'O texto extraído é exato: prefira-o ao que ler no print. Use o print (quando vier) para imagens, gráficos, tabelas, código e fórmulas.',
    'O texto da página pode trazer lixo da interface (nome do jogador, pontuação, timer, "Pergunta 3 de 10"): ignore.',
    'Escolha pelo CONTEÚDO das alternativas. A cor ou a posição das caixas não indica a resposta.',
    'É um quiz de AULA (nível introdutório/graduação): escolha a resposta que o PROFESSOR espera, a ideia principal ensinada,',
    'mesmo que existam exceções técnicas. Não procure casos extremos nem pegadinhas que o enunciado não pede.',
    'Em Verdadeiro/Falso, julgue pela regra geral ensinada (ex.: "lista ordenada permite busca binária" = Verdadeiro).',
    'Em "quando X é melhor que Y", prefira a situação clássica dos livros (ex.: busca linear é melhor com poucos elementos).',
    'Atenção a negações (NÃO, EXCETO, INCORRETA, FALSA) no enunciado.',
    'Se não tiver certeza, escolha a alternativa mais provável. Nunca deixe sem resposta.',
    'Responda somente com o JSON pedido.',
  ].join('\n');

  class ErroIA extends Error {
    constructor(mensagem, tipo, status) { super(mensagem); this.tipo = tipo || 'erro'; this.status = status || 0; }
  }

  // Monta o corpo do generateContent. alternativas = [{id, cor, texto}]
  //  - com texto: id = "1".."n" e a IA escolhe PELO TEXTO (a cor não importa)
  //  - sem texto (só formas na tela): id = cor e a IA lê o print
  function idDe(a) { return a.id || a.cor; }
  function montarPedido({ imagemBase64, alternativas, textoTela, nivel }) {
    const ids = alternativas.map(idDe);
    const porTexto = alternativas.every(a => a.texto);
    const linhas = alternativas.map(a => porTexto
      ? `${idDe(a)}) ${a.texto}`
      : `- ${idDe(a)} (${FORMAS[a.cor] || '?'}): leia o texto desta caixa no print`);
    const texto = [
      textoTela ? `Texto da tela (pergunta):\n"""\n${textoTela}\n"""` : 'Não foi possível ler o texto da página; leia tudo no print.',
      '',
      porTexto ? 'Alternativas:' : 'Alternativas (identificadas pela cor da caixa):',
      ...linhas,
      '',
      porTexto ? `Responda com o NÚMERO da alternativa correta (${ids.join(', ')}).` : `Responda com a cor da caixa correta (${ids.join(', ')}).`,
    ].join('\n');

    const partes = [];
    if (imagemBase64) partes.push({ inlineData: { mimeType: 'image/jpeg', data: imagemBase64 } });
    partes.push({ text: texto });

    const generationConfig = {
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: { resposta: { type: 'string', enum: ids } },
        required: ['resposta'],
      },
    };
    if (nivel) generationConfig.thinkingConfig = { thinkingLevel: String(nivel).toUpperCase() };
    return { systemInstruction: { parts: [{ text: INSTRUCAO }] }, contents: [{ role: 'user', parts: partes }], generationConfig };
  }

  // Transcrição: um modelo que enxerga só COPIA o texto/código da imagem; quem resolve é a Groq.
  function montarPedidoTranscricao({ imagemBase64, nivel }) {
    const generationConfig = { maxOutputTokens: 1200 };
    if (nivel) generationConfig.thinkingConfig = { thinkingLevel: String(nivel).toUpperCase() };
    return {
      systemInstruction: { parts: [{ text: 'Você transcreve texto de imagens com exatidão. Não resolve nada, não comenta.' }] },
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'image/jpeg', data: imagemBase64 } },
        { text: 'Transcreva EXATAMENTE todo o texto/código da imagem ou do bloco que fica ACIMA das caixas de resposta (código, tabela, gráfico: valores e rótulos). Preserve quebras de linha e indentação. Não transcreva as alternativas nem a interface. Responda só com o texto transcrito.' },
      ] }],
      generationConfig,
    };
  }
  function lerTexto(json) {
    const cand = json && (json.candidates || [])[0];
    const t = ((cand && cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim()
      .replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    if (t.length < 5) throw new ErroIA('Transcrição vazia', 'invalida');
    return t;
  }

  // Pergunta de ordenar (puzzle): a IA devolve a ordem dos ids.
  function montarPedidoOrdem({ imagemBase64, textoTela, itens, nivel }) {
    const ids = itens.map(i => i.id);
    const texto = [
      textoTela ? `Texto da tela (pergunta):\n"""\n${textoTela}\n"""` : 'Leia a pergunta no print.',
      '', 'Blocos para colocar na ordem certa (estão embaralhados):',
      ...itens.map(i => `${i.id}) ${i.texto}`), '',
      `Responda com a ORDEM CORRETA dos blocos, do primeiro ao último, usando os números (${ids.join(', ')}), cada um uma vez.`,
      'Se for código, a ordem é a de execução (definições/variáveis antes de usar).',
    ].join('\n');
    const partes = [];
    if (imagemBase64) partes.push({ inlineData: { mimeType: 'image/jpeg', data: imagemBase64 } });
    partes.push({ text: texto });
    const generationConfig = {
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { ordem: { type: 'array', items: { type: 'string', enum: ids }, minItems: ids.length, maxItems: ids.length } }, required: ['ordem'] },
    };
    if (nivel) generationConfig.thinkingConfig = { thinkingLevel: String(nivel).toUpperCase() };
    return { systemInstruction: { parts: [{ text: INSTRUCAO }] }, contents: [{ role: 'user', parts: partes }], generationConfig };
  }
  function lerOrdem(json, ids) {
    const cand = json && (json.candidates || [])[0];
    const texto = ((cand && cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
    let ordem = null;
    try { const o = JSON.parse(texto); ordem = (o.ordem || o).map(String); } catch (_) { ordem = (texto.match(/\d+/g) || []).filter(x => ids.includes(x)); }
    ordem = ordem.filter((x, i) => ids.includes(x) && ordem.indexOf(x) === i);
    if (ordem.length !== ids.length) throw new ErroIA(`Ordem inválida: ${texto.slice(0, 60)}`, 'invalida');
    return ordem;
  }

  // Pergunta de régua (slider): a IA devolve um número dentro do intervalo.
  function montarPedidoNumero({ imagemBase64, textoTela, min, max, step, nivel }) {
    const texto = [
      textoTela ? `Texto da tela (pergunta):\n"""\n${textoTela}\n"""` : 'Leia a pergunta no print.',
      '',
      `Esta pergunta se responde movendo uma régua (slider) para um NÚMERO entre ${min} e ${max} (passo ${step}).`,
      'ATENÇÃO: os números da régua (marcações como 0, 10, 20…) e o valor onde ela está agora NÃO são a resposta — são só a escala.',
      'Pense na pergunta e responda com o número correto (ex.: o ano exato, a quantidade exata).',
    ].join('\n');
    const partes = [];
    if (imagemBase64) partes.push({ inlineData: { mimeType: 'image/jpeg', data: imagemBase64 } });
    partes.push({ text: texto });
    const generationConfig = {
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { valor: { type: 'number', minimum: min, maximum: max } }, required: ['valor'] },
    };
    if (nivel) generationConfig.thinkingConfig = { thinkingLevel: String(nivel).toUpperCase() };
    return { systemInstruction: { parts: [{ text: INSTRUCAO }] }, contents: [{ role: 'user', parts: partes }], generationConfig };
  }
  function lerNumero(json, min, max, step) {
    const cand = json && (json.candidates || [])[0];
    const texto = ((cand && cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
    let v = NaN;
    try { const o = JSON.parse(texto); v = Number(o.valor); } catch (_) { const m = texto.match(/-?\d+(?:[.,]\d+)?/); if (m) v = Number(m[0].replace(',', '.')); }
    if (!isFinite(v)) throw new ErroIA(`Resposta sem número: ${texto.slice(0, 60)}`, 'invalida');
    v = Math.min(max, Math.max(min, v));
    if (step > 0) v = min + Math.round((v - min) / step) * step;
    return Math.round(v * 1e6) / 1e6;
  }

  // Extrai a cor da resposta da API. Lança ErroIA se não houver cor válida.
  function lerResposta(json, cores) {
    if (!json || typeof json !== 'object') throw new ErroIA('Resposta vazia da API', 'invalida');
    if (json.promptFeedback && json.promptFeedback.blockReason) {
      throw new ErroIA(`Pedido bloqueado pela API (${json.promptFeedback.blockReason})`, 'bloqueado');
    }
    const cand = (json.candidates || [])[0];
    if (!cand) throw new ErroIA('API não devolveu nenhuma resposta', 'invalida');
    const texto = ((cand.content && cand.content.parts) || [])
      .filter(p => typeof p.text === 'string' && !p.thought)
      .map(p => p.text).join('').trim();
    if (!texto) throw new ErroIA(`Resposta sem texto (finishReason: ${cand.finishReason || '?'})`, 'invalida');

    let cor = null;
    try {
      const obj = JSON.parse(texto);
      const v = obj && (obj.resposta !== undefined ? obj.resposta : obj.cor);
      if (v !== undefined && v !== null) cor = String(v).trim().toLowerCase();
    } catch (_) { /* tenta achar no texto livre abaixo */ }
    if (!cores.includes(cor)) {
      const achadas = cores.filter(c => new RegExp(`(^|[^\\w])${c}([^\\w]|$)`, 'i').test(texto));
      cor = achadas.length === 1 ? achadas[0] : null;
    }
    if (!cor) throw new ErroIA(`Resposta fora das opções: ${texto.slice(0, 80)}`, 'invalida');
    return cor;
  }

  function descreverErroHttp(status, corpo) {
    const msg = (corpo && corpo.error && corpo.error.message) || '';
    if (status === 400 && /api key/i.test(msg)) return ['Chave da API inválida', 'chave'];
    if (status === 401 || status === 403) return [`Sem permissão (${status}): ${msg || 'confira a chave'}`, 'chave'];
    if (status === 404) return [`Modelo não encontrado (404) — troque o id do modelo nas opções`, 'modelo'];
    if (status === 429) return ['Limite de requisições da API atingido (429) — espere um pouco', 'limite'];
    if (status === 503) return ['Modelo sobrecarregado no Google (503)', 'servidor'];
    if (status >= 500) return [`Erro no servidor do Google (${status})`, 'servidor'];
    return [`Erro HTTP ${status}: ${msg.slice(0, 120)}`, 'http'];
  }

  // ------------------------------------------------------------------ Groq (grátis, só texto, muito rápido)
  const GROQ_API = 'https://api.groq.com/openai/v1';
  function paraGroq(corpo, modelo, nivel, comImagem) {
    const sistema = ((corpo.systemInstruction && corpo.systemInstruction.parts) || []).map(p => p.text).join('\n');
    const usuario = (((corpo.contents || [])[0] || {}).parts || []).filter(p => typeof p.text === 'string').map(p => p.text).join('\n');
    const props = (corpo.generationConfig && corpo.generationConfig.responseJsonSchema && corpo.generationConfig.responseJsonSchema.properties) || {};
    let formato = '';
    if (props.resposta) formato = `\n\nResponda SOMENTE com JSON no formato {"resposta": "X"}, onde X é um destes: ${props.resposta.enum.join(', ')}.`;
    else if (props.valor) formato = '\n\nResponda SOMENTE com JSON no formato {"valor": N}, onde N é o número.';
    else if (props.ordem) formato = `\n\nResponda SOMENTE com JSON no formato {"ordem": ["…"]}, usando cada um destes uma vez: ${props.ordem.items.enum.join(', ')}.`;
    const img = ((((corpo.contents || [])[0] || {}).parts) || []).find(p => p.inlineData);
    const conteudo = (comImagem && img)
      ? [{ type: 'text', text: usuario + formato }, { type: 'image_url', image_url: { url: `data:${img.inlineData.mimeType};base64,${img.inlineData.data}` } }]
      : usuario + formato;
    const req = { model: modelo, messages: [{ role: 'system', content: sistema }, { role: 'user', content: conteudo }], temperature: 0.2, max_completion_tokens: 1024 };
    if (nivel) req.reasoning_effort = String(nivel).toLowerCase();
    return req;
  }
  const deGroq = (json) => ({ candidates: [{ content: { parts: [{ text: (((json || {}).choices || [])[0] || {}).message ? json.choices[0].message.content || '' : '' }] }, finishReason: 'STOP' }] });

  // Uma chamada a um modelo. Retorna {cor, ms, modelo}. Lança ErroIA (com .ms) em qualquer falha.
  async function chamarModelo({ apiBase, chave, modelo, corpo, cores, timeoutMs, fetchFn, sinal, ler, provedor, nivel, groqBase, visao }) {
    const f = fetchFn || fetch;
    const t0 = Date.now();
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), timeoutMs || 8000);
    if (sinal) sinal.addEventListener('abort', () => controle.abort(), { once: true });
    try {
      let resp;
      try {
        resp = provedor === 'groq'
          ? await f(`${groqBase || GROQ_API}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
            body: JSON.stringify(paraGroq(corpo, modelo, visao ? '' : nivel, visao)), signal: controle.signal,
          })
          : await f(`${apiBase || API_PADRAO}/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
            body: JSON.stringify(corpo),
            signal: controle.signal,
          });
      } catch (e) {
        if (controle.signal.aborted && !(sinal && sinal.aborted)) throw new ErroIA(`Tempo esgotado (${timeoutMs} ms)`, 'timeout');
        if (sinal && sinal.aborted) throw new ErroIA('Cancelado', 'cancelado');
        throw new ErroIA(`Falha de conexão: ${e.message || e}`, 'rede');
      }
      let json = null;
      try { json = await resp.json(); } catch (_) {
        if (controle.signal.aborted) throw new ErroIA(`Tempo esgotado (${timeoutMs} ms)`, 'timeout');
      }
      if (!resp.ok) { const [m, tipo] = descreverErroHttp(resp.status, json); throw new ErroIA(m, tipo, resp.status); }
      if (provedor === 'groq') json = deGroq(json);
      return { cor: ler ? ler(json) : lerResposta(json, cores), ms: Date.now() - t0, modelo };
    } catch (e) {
      const erro = e instanceof ErroIA ? e : new ErroIA(String(e.message || e), 'erro');
      erro.ms = Date.now() - t0; erro.modelo = modelo;
      throw erro;
    } finally {
      clearTimeout(timer);
    }
  }

  // Estratégia de 2 modelos: dispara os dois juntos; usa o preciso se ele responder até o prazo,
  // senão o primeiro que responder. Com usarCorrida=false, só o preciso.
  // chamar(modelo, nivel) -> Promise<{cor, ms, modelo}>
  async function corrida({ chamar, preciso, rapido, prazoMs, usarCorrida }) {
    const detalhes = [];
    const anotar = (p) => p.then(r => { detalhes.push({ modelo: r.modelo, ms: r.ms, ok: true, cor: r.cor }); return r; },
      e => { detalhes.push({ modelo: e.modelo, ms: e.ms, ok: false, erro: e.message, tipo: e.tipo }); throw e; });

    const pPreciso = anotar(chamar(preciso.modelo, preciso.nivel));
    pPreciso.catch(() => {});
    if (!usarCorrida || !rapido || !rapido.modelo) {
      const r = await pPreciso.catch(e => { throw Object.assign(e, { detalhes }); });
      return { cor: r.cor, modelo: r.modelo, ms: r.ms, detalhes, motivo: 'unico' };
    }
    const pRapido = anotar(chamar(rapido.modelo, rapido.nivel));
    pRapido.catch(() => {});

    let timer;
    const prazo = new Promise(res => { timer = setTimeout(() => res(null), Math.max(0, prazoMs)); });
    const primeiro = await Promise.race([pPreciso.then(r => r, () => null), prazo]);
    clearTimeout(timer);
    if (primeiro) return { cor: primeiro.cor, modelo: primeiro.modelo, ms: primeiro.ms, detalhes, motivo: 'preciso' };

    try {
      const r = await Promise.any([pRapido, pPreciso]);
      return { cor: r.cor, modelo: r.modelo, ms: r.ms, detalhes, motivo: r.modelo === preciso.modelo ? 'preciso-atrasado' : 'rapido' };
    } catch (_) {
      const erro = new ErroIA(detalhes.map(d => `${d.modelo}: ${d.erro}`).join(' | ') || 'Os dois modelos falharam', 'falhou');
      erro.detalhes = detalhes;
      throw erro;
    }
  }

  // Pedido mínimo para validar chave/modelo e já abrir a conexão (a 1ª chamada é a mais lenta).
  function pedidoAquecimento(nivel) {
    const g = { maxOutputTokens: 16 };
    if (nivel) g.thinkingConfig = { thinkingLevel: String(nivel).toUpperCase() };
    return { contents: [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }], generationConfig: g };
  }

  async function aquecerModelo({ apiBase, chave, modelo, nivel, timeoutMs, fetchFn, provedor, groqBase }) {
    const t0 = Date.now();
    try {
      const corpo = pedidoAquecimento(provedor === 'groq' ? '' : nivel);
      await chamarModelo({ apiBase, chave, modelo, corpo, cores: [], timeoutMs: timeoutMs || 10000, fetchFn, provedor, nivel, groqBase, ler: () => 'ok' });
      return { modelo, ok: true, ms: Date.now() - t0 };
    } catch (e) {
      return { modelo, ok: false, ms: Date.now() - t0, erro: e.tipo === 'timeout' ? 'Tempo esgotado' : e.message, tipo: e.tipo };
    }
  }

  // ------------------------------------------------------------------ gerenciador de modelos
  // Recebe uma lista ordenada de modelos (preferência) e escolhe, a cada pergunta, os que estão respondendo:
  //  - "preciso" = o 1º da lista que está saudável; "rápido" = o saudável mais rápido entre os outros;
  //  - modelo que dá 503/timeout/erro de rede fica de castigo por alguns minutos (depois é testado de novo);
  //  - se a corrida falhar inteira, tenta mais um modelo ainda não usado naquela pergunta.
  const FALHAS_DE_SAUDE = ['servidor', 'timeout', 'rede', 'limite', 'modelo'];

  function normalizarModelos(cfg) {
    let lista = Array.isArray(cfg.modelos) && cfg.modelos.length ? cfg.modelos : null;
    if (!lista) lista = [{ modelo: cfg.modeloPreciso, nivel: cfg.nivelPreciso }, { modelo: cfg.modeloRapido, nivel: cfg.nivelRapido }];
    const vistos = new Set();
    return lista.map(m => (typeof m === 'string' ? { modelo: m, nivel: '' } : { modelo: m.modelo, nivel: m.nivel || '', provedor: m.provedor || 'gemini', visao: m.visao }))
      .map(m => Object.assign({ provedor: 'gemini' }, m, { visao: (m.provedor || 'gemini') === 'gemini' || m.visao === true }))
      .filter(m => m.modelo && !vistos.has(m.modelo) && vistos.add(m.modelo));
  }

  function criarGerenciador(op) {
    const agora = op.agora || Date.now;
    const castigoMs = op.castigoMs || 60 * 1000;
    const chaves = Object.assign({ gemini: op.chave }, op.chaves || {});
    const saude = normalizarModelos(op).filter(m => chaves[m.provedor]).map((m, i) => Object.assign({ ordem: i, estado: 'desconhecido', ms: null, falhouEm: 0, erro: '' }, m));
    const ctx = (s) => ({ apiBase: op.apiBase, groqBase: op.groqBase, chave: chaves[s.provedor], provedor: s.provedor, nivel: s.nivel, visao: s.provedor === 'groq' && s.visao, fetchFn: op.fetchFn });
    const porNome = (n) => saude.find(s => s.modelo === n);

    function marcar(modelo, ok, ms, erro) {
      const s = porNome(modelo); if (!s) return;
      if (ok) Object.assign(s, { estado: 'ok', ms: s.ms == null ? ms : Math.round(s.ms * 0.6 + ms * 0.4), erro: '' });
      else Object.assign(s, { estado: 'falhou', falhouEm: agora(), erro: erro || '' });
    }
    function disponiveis(excluir) {
      const t = agora();
      return saude.filter(s => !(excluir || []).includes(s.modelo) && (s.estado !== 'falhou' || t - s.falhouEm > castigoMs));
    }
    function escolher(excluir) {
      let d = disponiveis(excluir);
      // nunca fica sem modelo: se todos estão "de castigo", usa os que falharam há mais tempo
      if (!d.length) d = saude.filter(s => !(excluir || []).includes(s.modelo)).sort((a, b) => a.falhouEm - b.falhouEm).slice(0, 2);
      // preferido = 1º da lista entre os que respondem DENTRO do prazo; se nenhum, o mais rápido que responde
      const limite = (op.prazoMs || 3000) * 1.3;
      const oks = d.filter(s => s.estado === 'ok');
      const rapidosOk = oks.filter(s => s.ms <= limite);
      const porVelocidade = [...oks].sort((a, b) => a.ms - b.ms);
      const ordenados = [...rapidosOk, ...porVelocidade.filter(s => !rapidosOk.includes(s)), ...d.filter(s => s.estado !== 'ok')];
      const preciso = ordenados[0] || null;
      let rapido = null;
      if (op.usarCorrida === true && preciso) {
        const outros = d.filter(s => s !== preciso);
        rapido = outros.sort((a, b) => (a.estado === 'ok' ? a.ms : 1e9) - (b.estado === 'ok' ? b.ms : 1e9) || a.ordem - b.ordem)[0] || null;
      }
      return { preciso, rapido };
    }

    async function aquecer(soFalhos) {
      const alvo = saude.filter(s => (!soFalhos || s.estado === 'falhou') && (op.aquecerGemini || s.provedor !== 'gemini' || !saude.some(x => x.provedor !== 'gemini')));
      const lista = await Promise.all(alvo.map(s => aquecerModelo(Object.assign(ctx(s), { modelo: s.modelo, timeoutMs: op.timeoutAquecimentoMs || 15000 }))
        .then(r => { if (r.ok) marcar(s.modelo, true, r.ms); else if (FALHAS_DE_SAUDE.includes(r.tipo)) marcar(s.modelo, false, r.ms, r.erro); return r; })));
      const e = escolher();
      return { ok: lista.some(r => r.ok), modelos: lista, preciso: e.preciso && e.preciso.modelo, rapido: e.rapido && e.rapido.modelo };
    }

    // Ordem de tentativa: rápidos/saudáveis primeiro, depois desconhecidos, por último os que falharam há mais tempo.
    function fila(temImagem) {
      const temVisao = saude.some(s => s.visao);
      const pode = (s) => !temImagem || s.visao || !temVisao;   // sem nenhum modelo com visão, vai só com o texto
      let { preciso } = escolher(saude.filter(s => !pode(s)).map(s => s.modelo));
      const resto = saude.filter(s => s !== preciso && pode(s));
      const t = agora();
      const ok = resto.filter(s => s.estado === 'ok').sort((a, b) => a.ms - b.ms);
      const desc = resto.filter(s => s.estado === 'desconhecido');
      const castigo = resto.filter(s => s.estado === 'falhou' && t - s.falhouEm > castigoMs);
      const falhos = resto.filter(s => s.estado === 'falhou' && t - s.falhouEm <= castigoMs).sort((a, b) => a.falhouEm - b.falhouEm);
      return [preciso, ...ok, ...desc, ...castigo, ...falhos].filter(Boolean);
    }

    // Uma chamada por pergunta. Se ela demorar mais que reforcoMs (ou falhar), chama o próximo modelo EM PARALELO
    // e fica com a primeira resposta válida. Assim só gasta mais requisições quando a IA está lenta.
    // Pergunta com imagem: Gemini (enxerga) e Groq (só texto, rápida) juntos; vale o Gemini se chegar até o prazo.
    function responder({ montarCorpo, cores, decorridoMs, ler, temImagem, nivelGroq, apenasVisao }) {
      const chamar = (modelo, nivel) => { const s = porNome(modelo); const c = ctx(s); if (nivelGroq && s.provedor === 'groq') c.nivel = nivelGroq;
        return chamarModelo(Object.assign(c, { modelo, corpo: montarCorpo(s.provedor === 'groq' ? '' : nivel), cores, ler, timeoutMs: op.timeoutMs })); };
      // (no aquecimento, modelos de visão da Groq também são testados só com texto)
      const chamarMarcando = (modelo, nivel) => chamar(modelo, nivel)
        .then(r => { marcar(modelo, true, r.ms); return r; },
          e => { if (FALHAS_DE_SAUDE.includes(e.tipo)) marcar(modelo, false, e.ms, e.message); throw e; });

      function executarFila(candidatos) {
        if (!candidatos.length) return Promise.reject(new ErroIA('Nenhum modelo configurado — veja config.json', 'falhou'));
        const reforcoMs = op.reforcoMs || 2500, maxParalelo = op.maxParalelo || 3;
        return new Promise((resolve, reject) => {
          let idx = 0, ativos = 0, fim = false, timer = null;
          const detalhes = [];
          const acabar = (fn, v) => { if (fim) return; fim = true; clearTimeout(timer); fn(v); };
          const lancar = () => {
            if (fim || idx >= candidatos.length || ativos >= maxParalelo) return false;
            const m = candidatos[idx++]; ativos++;
            chamarMarcando(m.modelo, m.nivel).then(
              (r) => { detalhes.push({ modelo: r.modelo, ms: r.ms, ok: true, cor: r.cor }); acabar(resolve, { cor: r.cor, modelo: r.modelo, ms: r.ms, detalhes, motivo: idx > 1 ? 'reforco' : 'unico' }); },
              (e) => {
                ativos--; detalhes.push({ modelo: m.modelo, ms: e.ms, ok: false, erro: e.message, tipo: e.tipo });
                if (fim) return;
                if (e.tipo === 'chave') return acabar(reject, e);
                if (!lancar() && ativos === 0) {
                  const erro = new ErroIA(detalhes.map(d => `${d.modelo}: ${d.erro}`).join(' | '), 'falhou');
                  erro.detalhes = detalhes; acabar(reject, erro);
                }
              });
            return true;
          };
          const reforcar = () => { if (fim) return; lancar(); if (idx < candidatos.length) timer = setTimeout(reforcar, reforcoMs); };
          lancar();
          if (op.usarCorrida === true) lancar();
          if (idx < candidatos.length) timer = setTimeout(reforcar, reforcoMs);
        });
      }

      if (apenasVisao) return executarFila(fila(true).filter(s => s.visao));
      if (temImagem) {
        const comVisao = fila(true).filter(s => s.visao);
        const semVisao = saude.filter(s => !s.visao && (s.estado !== 'falhou' || agora() - s.falhouEm > castigoMs))[0];
        // (modelos de visão, inclusive os da Groq, entram em comVisao)
        if (comVisao.length && semVisao) {
          // modelos que ENXERGAM a imagem têm prioridade; a Groq (só texto) é a rede de segurança
          const prazo = Math.max(500, (op.prazoImagemMs || 4000) - (decorridoMs || 0));
          const pVis = executarFila(comVisao);
          const pTxt = chamarMarcando(semVisao.modelo, semVisao.nivel).then(r => Object.assign(r, { detalhes: [{ modelo: r.modelo, ms: r.ms, ok: true }] }));
          pVis.catch(() => {}); pTxt.catch(() => {});
          return new Promise((resolve, reject) => {
            let feito = false;
            const timer = setTimeout(() => { if (feito) return; Promise.any([pVis, pTxt]).then(r => { feito = true; resolve(r); }, reject); }, prazo);
            pVis.then(r => { if (!feito) { feito = true; clearTimeout(timer); resolve(r); } },
              () => { if (!feito) { clearTimeout(timer); pTxt.then(r => { feito = true; resolve(r); }, reject); } });
          });
        }
      }
      return executarFila(fila(temImagem));
    }

    const resumo = () => saude.map(s => ({ modelo: s.modelo, estado: s.estado, ms: s.ms, erro: s.erro }));
    return { aquecer, responder, escolher, marcar, resumo, saude };
  }

  const api = { API_PADRAO, GROQ_API, INSTRUCAO, ErroIA, paraGroq, deGroq, montarPedido, lerResposta, descreverErroHttp, chamarModelo, corrida, aquecerModelo, normalizarModelos, criarGerenciador, montarPedidoNumero, lerNumero, montarPedidoOrdem, lerOrdem, montarPedidoTranscricao, lerTexto };
  raiz.KBGemini = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
