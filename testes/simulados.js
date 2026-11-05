// testes/simulados.js — testes PONTA A PONTA SIMULADOS: roda o bot de verdade (bot/bot.js), num Chrome de verdade,
// contra telas que imitam o Kahoot e uma API que imita o Gemini (testes/servidor-mock.js).
// Mede detecção, clique, tempos do próprio bot e o comportamento em falhas. NÃO mede o acerto do Gemini real
// (o Gemini simulado sempre sabe a resposta) — para isso use bot/testar-gemini.js.
//
// Uso: node testes/simulados.js            (precisa do Playwright só para achar um Chromium)
//      KB_ELECTRON=/caminho/electron node testes/simulados.js   → roda também no runtime do VS Code
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { criarServidor } = require('./servidor-mock');

const RAIZ = path.resolve(__dirname, '..');
let NAVEGADOR = process.env.KB_NAVEGADOR;
if (!NAVEGADOR) { try { NAVEGADOR = require('playwright').chromium.executablePath(); } catch (_) {} }
if (!NAVEGADOR) { console.error('Defina KB_NAVEGADOR com o caminho de um Chrome/Chromium'); process.exit(1); }

const RUNTIMES = [{ id: 'node', nome: `Node ${process.version}`, exe: process.execPath, env: {} }];
if (process.env.KB_ELECTRON) RUNTIMES.unshift({ id: 'vscode', nome: 'Electron 43 como Node (= VS Code)', exe: process.env.KB_ELECTRON, env: { ELECTRON_RUN_AS_NODE: '1' } });

const OK = { atraso: 800, modo: 'ok' }, RAP = { atraso: 300, modo: 'ok' };
const M = (p, r) => ({ 'gemini-3.8-flash': p, 'gemini-3.5-flash-lite': r });
const NORMAL = M(OK, RAP);

const cliques = r => r.eventos.filter(e => e.tipo === 'clicou');
const pedidos = r => r.pedidosIA.filter(p => !p.aquecimento);
function esperaCliquesCertos(n) {
  return (r) => {
    const f = [], c = cliques(r);
    if (c.length !== n) f.push(`esperava ${n} clique(s), houve ${c.length}`);
    if (c.some(x => !x.acertou)) f.push('clicou na cor errada');
    if (c.some(x => !x.trusted)) f.push('clique não foi "real" (isTrusted=false)');
    return f;
  };
}
const tudo = (...fs_) => (r) => fs_.flatMap(f => f(r));
const pedidosPorPergunta = (n) => (r) => pedidos(r).length === n ? [] : [`esperava ${n} chamada(s) à IA, houve ${pedidos(r).length}`];
const semCliques = (r) => cliques(r).length ? [`não devia clicar, clicou ${cliques(r).length}x`] : [];
const historicoTem = (campo, valor) => (r) => r.historico.some(h => h[campo] === valor) ? [] : [`histórico sem ${campo}=${valor}`];
const saidaTem = (re) => (r) => re.test(r.saida) ? [] : [`saída do terminal não mostra ${re}`];
const tempoMax = (ms) => (r) => cliques(r).filter(c => c.ms > ms).map(c => `clique levou ${c.ms} ms (> ${ms})`);
const imagemAte = (larg) => (r) => pedidos(r).filter(p => !p.dimImagem || p.dimImagem.largura > larg).map(p => `print com ${p.dimImagem ? p.dimImagem.largura : '?'} px (> ${larg})`);

const CASOS = [
  // ------------------------------------------------ detecção e fluxo
  { g: 'Detecção', n: '4 alternativas', c: 'quatro', v: tudo(esperaCliquesCertos(1), pedidosPorPergunta(2)) },
  { g: 'Detecção', n: '3 alternativas', c: 'tres', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: 'Verdadeiro ou falso', c: 'vf', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: 'Gráfico com barras nas cores do Kahoot', c: 'grafico', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: 'Pergunta com imagem colorida', c: 'foto', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: 'Tabela', c: 'tabela', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: 'Texto longo', c: 'longo', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: '3 perguntas seguidas (com telas de transição)', c: 'sequencia', v: tudo(esperaCliquesCertos(3), pedidosPorPergunta(6)) },
  { g: 'Detecção', n: 'Pergunta nova sem a tela "limpar" entre elas (3 perguntas)', c: 'sequencia', params: 'transicao=0', v: tudo(esperaCliquesCertos(3), pedidosPorPergunta(6)) },
  { g: 'Detecção', n: 'Pergunta só com texto → envia só texto (sem print)', c: 'quatro', v: tudo(esperaCliquesCertos(1), (r) => pedidos(r).every(p => !p.temImagem) ? [] : ['mandou print sem precisar']) },
  { g: 'Detecção', n: 'Pergunta com imagem → envia o print', c: 'foto', v: tudo(esperaCliquesCertos(1), (r) => pedidos(r).every(p => p.temImagem) ? [] : ['não mandou o print']) },
  { g: 'Detecção', n: 'Layout diferente (cor via gradiente → detecção pelo print)', c: 'gradiente', v: tudo(esperaCliquesCertos(1), historicoTem('viaPrint', true)) },
  { g: 'Detecção', n: 'Layout diferente (caixas que não parecem clicáveis)', c: 'divs', v: esperaCliquesCertos(1) },
  { g: 'Detecção', n: 'Só formas, sem texto na tela', c: 'formas', v: tudo(esperaCliquesCertos(1), historicoTem('semTexto', true)) },
  // ------------------------------------------------ resoluções
  { g: 'Resolução', n: '1366×768 (notebook)', c: 'foto', janela: '1366,768', v: tudo(esperaCliquesCertos(1), imagemAte(1280)) },
  { g: 'Resolução', n: '1280×720 com zoom do Windows 150%', c: 'foto', janela: '1280,720', dpr: 1.5, v: tudo(esperaCliquesCertos(1), imagemAte(1280)) },
  { g: 'Resolução', n: '2560×1440', c: 'foto', janela: '2560,1440', v: tudo(esperaCliquesCertos(1), imagemAte(1280)) },
  { g: 'Resolução', n: 'Janela estreita (layout de celular)', c: 'quatro', janela: '480,900', v: esperaCliquesCertos(1) },
  { g: 'Resolução', n: '1920×1080, V/F, zoom 125%', c: 'vf', dpr: 1.25, v: esperaCliquesCertos(1) },
  // ------------------------------------------------ falhas da API
  { g: 'Falhas', n: 'Modelo preciso com erro 500 → usa o rápido', c: 'quatro', m: M({ atraso: 100, modo: '500' }, RAP), v: tudo(esperaCliquesCertos(1), historicoTem('modelo', 'gemini-3.5-flash-lite')) },
  { g: 'Falhas', n: 'Modelo preciso lento (6 s) → rápido no prazo', c: 'quatro', m: M({ atraso: 6000, modo: 'ok' }, RAP), v: tudo(esperaCliquesCertos(1), tempoMax(3600), historicoTem('modelo', 'gemini-3.5-flash-lite')) },
  { g: 'Falhas', n: 'JSON inválido do preciso → rápido', c: 'quatro', m: M({ atraso: 200, modo: 'json-invalido' }, RAP), v: tudo(esperaCliquesCertos(1), historicoTem('modelo', 'gemini-3.5-flash-lite')) },
  { g: 'Falhas', n: 'Cor fora das opções ("roxo") → rápido', c: 'quatro', m: M({ atraso: 200, modo: 'enum-invalido' }, RAP), v: tudo(esperaCliquesCertos(1), historicoTem('modelo', 'gemini-3.5-flash-lite')) },
  { g: 'Falhas', n: 'Resposta em texto livre ("A resposta é azul")', c: 'quatro', m: M({ atraso: 200, modo: 'texto-livre' }, { atraso: 2500, modo: 'ok' }), v: tudo(esperaCliquesCertos(1), historicoTem('modelo', 'gemini-3.8-flash')) },
  { g: 'Falhas', n: 'Resposta bloqueada e vazia nos dois → não clica e avisa', c: 'quatro', m: M({ atraso: 100, modo: 'bloqueado' }, { atraso: 300, modo: 'vazio' }), params: 'limite=4000', v: tudo(semCliques, saidaTem(/sem resposta/)) },
  { g: 'Falhas', n: 'Os dois modelos com erro 500 (3 perguntas)', c: 'sequencia', m: M({ atraso: 100, modo: '500' }, { atraso: 100, modo: '500' }), params: 'limite=3000', v: tudo(semCliques, (r) => r.historico.filter(h => !h.ok).length === 3 ? [] : [`esperava 3 falhas registradas, houve ${r.historico.filter(h => !h.ok).length}`]) },
  { g: 'Falhas', n: 'API travada (timeout de 1,5 s)', c: 'quatro', m: M({ modo: 'travar' }, { modo: 'travar' }), cfg: { timeoutMs: 1500 }, params: 'limite=5000', v: tudo(semCliques, saidaTem(/Tempo esgotado/)) },
  { g: 'Falhas', n: 'Limite da API (429)', c: 'quatro', m: M({ atraso: 50, modo: '429' }, { atraso: 50, modo: '429' }), params: 'limite=4000', v: tudo(semCliques, saidaTem(/Limite de requisições/)) },
  { g: 'Falhas', n: 'Sem internet (conexão recusada)', c: 'quatro', cfg: { apiBase: 'http://127.0.0.1:9' }, params: 'limite=4000', v: tudo(semCliques, saidaTem(/Falha de conexão/)) },
  { g: 'Falhas', n: 'Chave inválida', c: 'quatro', m: M({ atraso: 50, modo: 'chave' }, { atraso: 50, modo: 'chave' }), params: 'limite=4000', v: tudo(semCliques, saidaTem(/Chave da API inválida/)) },
  { g: 'Falhas', n: 'Proxy da rede devolvendo HTML (502)', c: 'quatro', m: M({ atraso: 50, modo: 'nao-json' }, { atraso: 50, modo: 'nao-json' }), params: 'limite=4000', v: tudo(semCliques, saidaTem(/Erro no servidor do Google \(502\)/)) },
  { g: 'Falhas', n: 'Situação real de 03/11: 3.8 e 3.6 com 503, 3.5-lite travado → usa o 3.1-lite', c: 'sequencia',
    m: { 'gemini-3.8-flash': { atraso: 1500, modo: '503' }, 'gemini-3.6-flash': { atraso: 1500, modo: '503' }, 'gemini-3.5-flash-lite': { modo: 'travar' }, 'gemini-3.1-flash-lite': { atraso: 1200, modo: 'ok' } },
    cfg: { modelos: [{ modelo: 'gemini-3.8-flash', nivel: 'low' }, { modelo: 'gemini-3.6-flash', nivel: 'low' }, { modelo: 'gemini-3.1-flash-lite', nivel: '' }, { modelo: 'gemini-3.5-flash-lite', nivel: 'minimal' }] },
    v: tudo(esperaCliquesCertos(3), tempoMax(3200), (r) => r.historico.every(h => h.modelo === 'gemini-3.1-flash-lite') ? [] : ['não usou o 3.1-flash-lite em todas']) },
  // ------------------------------------------------ velocidade e chamadas
  { g: 'Velocidade', n: 'IA instantânea: custo do próprio bot (3 perguntas)', c: 'sequencia', m: M({ atraso: 0, modo: 'ok' }, { atraso: 0, modo: 'ok' }), v: esperaCliquesCertos(3), medir: true },
  { g: 'Velocidade', n: 'IA realista simulada (preciso 1,5 s; rápido 0,6 s)', c: 'sequencia', m: M({ atraso: 1500, modo: 'ok' }, { atraso: 600, modo: 'ok' }), v: tudo(esperaCliquesCertos(3), tempoMax(3000)), medir: true },
  { g: 'Velocidade', n: 'Um modelo só (sem corrida): 1 chamada por pergunta', c: 'sequencia', cfg: { usarCorrida: false }, v: tudo(esperaCliquesCertos(3), pedidosPorPergunta(3)) },
];

async function rodarCaso(srv, porta, rt, caso) {
  srv.limpar();
  srv.configurar(caso.m || NORMAL, { atraso: 300, modo: 'ok' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-e2e-'));
  const arqCfg = path.join(tmp, 'config.json');
  fs.writeFileSync(arqCfg, JSON.stringify(Object.assign({
    modelos: [{ modelo: 'gemini-3.8-flash', nivel: 'low' }, { modelo: 'gemini-3.5-flash-lite', nivel: 'minimal' }],
    apiBase: `http://127.0.0.1:${porta}`, sites: ['127.0.0.1'],
    urlInicial: `http://127.0.0.1:${porta}/kahoot/${caso.c}?lobby=700${caso.params ? '&' + caso.params : ''}`,
  }, caso.cfg || {})));
  const env = Object.assign({}, process.env, rt.env, {
    KB_CONFIG: arqCfg, KB_HEADLESS: '1', KB_JANELA: caso.janela || '1920,1080', GEMINI_API_KEY: 'chave-de-teste',
    KB_NAVEGADOR: NAVEGADOR, KB_PERFIL: path.join(tmp, 'perfil'), KB_RESULTADOS: path.join(tmp, 'res'), KB_SEM_PERGUNTA: '1',
    KB_ARGS_EXTRA: ['--no-sandbox', caso.dpr ? `--force-device-scale-factor=${caso.dpr}` : ''].join(' '),
  });
  const t0 = Date.now();
  const proc = spawn(rt.exe, [path.join(RAIZ, 'bot', 'bot.js')], { env });
  let saida = '';
  proc.stdout.on('data', d => { saida += d; }); proc.stderr.on('data', d => { saida += d; });
  let saiu = false; proc.on('exit', () => { saiu = true; });
  const limite = Date.now() + 40000;
  while (Date.now() < limite && !saiu && !srv.estado.eventos.some(e => e.tipo === 'fim')) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  const caiu = saiu;
  proc.kill('SIGINT');
  for (let i = 0; i < 30 && !saiu; i++) await new Promise(r => setTimeout(r, 100));
  if (!saiu) proc.kill('SIGKILL');
  let historico = [];
  try {
    const d = path.join(tmp, 'res');
    for (const f of fs.readdirSync(d)) historico.push(...fs.readFileSync(path.join(d, f), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
  } catch (_) {}
  fs.rmSync(tmp, { recursive: true, force: true });
  const r = { eventos: [...srv.estado.eventos], pedidosIA: [...srv.estado.pedidosIA], historico, saida: saida.replace(/\x1b\[[0-9;]*m/g, ''), duracaoMs: Date.now() - t0 };
  const falhas = caso.v(r);
  if (caiu) falhas.push('o bot encerrou sozinho (travou/caiu)');
  if (!r.eventos.some(e => e.tipo === 'fim')) falhas.push('a partida simulada não terminou');
  return { r, falhas };
}

(async () => {
  const srv = criarServidor(); const porta = await srv.iniciar();
  const saida = { quando: new Date().toISOString(), navegador: NAVEGADOR, plataforma: `${os.platform()} ${os.release()}`, runtimes: [] };
  for (const rt of RUNTIMES) {
    console.log(`\n=== Runtime: ${rt.nome}`);
    const res = { runtime: rt.nome, casos: [] };
    for (const caso of CASOS) {
      const { r, falhas } = await rodarCaso(srv, porta, rt, caso);
      const cl = cliques(r);
      const linha = {
        grupo: caso.g, nome: caso.n, ok: falhas.length === 0, falhas,
        cliques: cl.length, acertos: cl.filter(c => c.acertou).length,
        msClique: cl.map(c => c.ms), msIA: r.historico.filter(h => h.ok).map(h => h.msIA),
        modelos: r.historico.filter(h => h.ok).map(h => h.modelo), chamadasIA: pedidos(r).length,
        print: pedidos(r)[0] && pedidos(r)[0].dimImagem, erros: r.historico.filter(h => !h.ok && h.erro).map(h => h.erro.slice(0, 90)),
      };
      res.casos.push(linha);
      console.log(`${linha.ok ? 'PASSOU' : 'FALHOU'}  [${caso.g}] ${caso.n}  ${linha.msClique.length ? '· clique em ' + linha.msClique.join('/') + ' ms' : ''}${linha.falhas.length ? '  → ' + linha.falhas.join('; ') : ''}`);
      if (!linha.ok && process.env.KB_MOSTRAR_SAIDA) console.log(r.saida.split('\n').slice(-25).join('\n'));
    }
    saida.runtimes.push(res);
  }
  await srv.parar();

  // ---------------- relatório
  const md = [`# Testes simulados — ${new Date().toLocaleString('pt-BR')}`, '',
    '> **Simulado:** Kahoot e Gemini são imitações locais (`testes/servidor-mock.js`). O bot, o Chrome, a detecção, o print e o clique são reais.',
    '> O Gemini simulado sempre sabe a resposta e responde com o atraso configurado, então estes testes **não medem o acerto da IA**.', '',
    `Plataforma: ${saida.plataforma} · Chrome: ${path.basename(path.dirname(NAVEGADOR))}`, ''];
  for (const rt of saida.runtimes) {
    const p = rt.casos.filter(c => c.ok).length;
    md.push(`## ${rt.runtime} — ${p}/${rt.casos.length} passaram`, '', '| Grupo | Caso | Resultado | Clique (ms após as alternativas aparecerem) | IA simulada (ms) | Modelo usado | Chamadas à IA | Print enviado |', '|---|---|---|---|---|---|---|---|');
    for (const c of rt.casos) {
      md.push(`| ${c.grupo} | ${c.nome} | ${c.ok ? '✅' : '❌ ' + c.falhas.join('; ')} | ${c.msClique.join(' / ') || '—'} | ${c.msIA.join(' / ') || (c.erros.length ? 'erro: ' + c.erros[0] : '—')} | ${[...new Set(c.modelos)].join(', ').replace(/gemini-/g, '') || '—'} | ${c.chamadasIA} | ${c.print ? c.print.largura + '×' + c.print.altura : '—'} |`);
    }
    const custo = rt.casos.find(c => c.nome.startsWith('IA instantânea'));
    if (custo && custo.msClique.length) md.push('', `Custo do próprio bot (IA instantânea): ${custo.msClique.join(', ')} ms do aparecimento das alternativas até o clique — inclui ~350 ms de animação de entrada da tela simulada.`);
    md.push('');
  }
  const dir = path.join(__dirname, 'resultados'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'simulados.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'simulados.json'), JSON.stringify(saida, null, 2));
  const total = saida.runtimes.flatMap(r => r.casos), passou = total.filter(c => c.ok).length;
  console.log(`\n${passou}/${total.length} casos passaram. Relatório: testes/resultados/simulados.md`);
  process.exit(passou === total.length ? 0 : 1);
})();
