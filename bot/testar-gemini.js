// bot/testar-gemini.js — mede ACERTO e TEMPO do Gemini REAL nas 27 amostras de testes/amostras.
// Cada amostra é o print + textos exatamente como o bot envia durante o jogo.
// Uso: Terminal → Executar Tarefa… → "🧪 Testar com o Gemini real"  (ou: node bot/testar-gemini.js [modelo|bot ...])
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('../nucleo/gemini');
const { RAIZ, lerConfig, obterChaves } = require('./config');

const R = '\x1b[0m', VERDE = '\x1b[32m', VERM = '\x1b[31m', NEG = '\x1b[1m', CINZA = '\x1b[90m';
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : '-';
function quantil(v, q) { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

(async () => {
  const cfg = lerConfig();
  const { gemini: chave, groq: chaveGroq } = await obterChaves();
  const DIR = path.join(RAIZ, 'testes', 'amostras');
  const gabarito = JSON.parse(fs.readFileSync(path.join(DIR, 'gabarito.json'), 'utf8'));
  // testa cada modelo que está respondendo agora + "bot" (exatamente a estratégia usada no jogo)
  const chaves = { gemini: chave, groq: chaveGroq };
  const gerente = G.criarGerenciador(Object.assign({}, cfg, { chave, chaves }));
  console.log(`${CINZA}Verificando quais modelos estão respondendo…${R}`);
  const saude = await gerente.aquecer();
  for (const m of saude.modelos) console.log(`  ${m.ok ? VERDE + '✓' : VERM + '✗'}${R} ${m.modelo} ${m.ok ? m.ms + ' ms' : m.erro}`);
  const CONFIGS = {};
  for (const m of G.normalizarModelos(cfg)) {
    if (saude.modelos.some(x => x.modelo === m.modelo && x.ok)) CONFIGS[m.modelo] = { nome: `${m.modelo}${m.nivel ? ` (${m.nivel})` : ''}`, tipo: 'unico', m };
  }
  CONFIGS.bot = { nome: `Bot (escolha automática + reserva, prazo ${cfg.prazoMs} ms)`, tipo: 'bot' };
  const escolhidas = process.argv.slice(2).filter(a => CONFIGS[a]);
  const usar = escolhidas.length ? escolhidas : Object.keys(CONFIGS);
  const ESPERA_ENTRE = Number(process.env.KB_ESPERA_MS || 1500); // respeita o limite por minuto do plano grátis

  console.log(`\n${NEG}🧪 Teste com o Gemini REAL${R} — ${gabarito.length} amostras × ${usar.length} configurações\n`);
  const resultados = [];
  for (const id of usar) {
    const c = CONFIGS[id];
    console.log(`${NEG}${c.nome}${R}`);
    const linhas = [];
    for (const a of gabarito) {
      // como no jogo: o print só vai quando a pergunta tem imagem/gráfico/código desenhado (ou sem texto)
      const usaPrint = a.soVisao || ['grafico', 'foto', 'codigo'].includes(a.tipo);
      const imagem = usaPrint ? fs.readFileSync(path.join(DIR, a.arquivo)).toString('base64') : null;
      if (c.tipo === 'unico' && c.m.provedor === 'groq' && usaPrint) { console.log(`  ${CINZA}–  ${a.id.padEnd(20)} (tem imagem: vai pro Gemini)${R}`); continue; }
      // como no jogo: com texto, a IA escolhe pelo número da alternativa; sem texto, pela cor
      const alts = a.alternativas.map((x, i) => Object.assign({}, x, { id: a.alternativas.every(y => y.texto) ? String(i + 1) : x.cor }));
      const cores = alts.map(x => x.id);
      const certa = alts.find(x => x.cor === a.correta).id;
      const chamar = (modelo, nivel) => G.chamarModelo({
        apiBase: cfg.apiBase, groqBase: cfg.groqBase, provedor: c.m ? c.m.provedor : 'gemini', nivel, chave: chaves[c.m ? c.m.provedor : 'gemini'], modelo, cores, timeoutMs: cfg.timeoutMs,
        corpo: G.montarPedido({ imagemBase64: imagem, alternativas: alts, textoTela: a.textoTela, nivel }),
      });
      let linha;
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        const t0 = Date.now();
        try {
          let r;
          if (c.tipo === 'bot') {
            // simula o momento real: o bot gasta ~300 ms detectando + estabilizando antes de chamar a IA
            r = await gerente.responder({ montarCorpo: (nivel) => G.montarPedido({ imagemBase64: imagem, alternativas: alts, textoTela: a.textoTela, nivel }), cores, decorridoMs: 300, temImagem: !!imagem });
          } else {
            r = await chamar(c.m.modelo, c.m.nivel);
          }
          linha = { id: a.id, tipo: a.tipo, tela: a.tela, soVisao: a.soVisao, correta: a.correta, cor: (alts.find(x => x.id === r.cor) || {}).cor || r.cor, acertou: r.cor === certa, ms: Date.now() - t0, modelo: r.modelo };
        } catch (e) {
          linha = { id: a.id, tipo: a.tipo, tela: a.tela, soVisao: a.soVisao, correta: a.correta, cor: null, acertou: false, ms: Date.now() - t0, erro: e.message, tipoErro: e.tipo };
          if (e.tipo === 'limite' || /429/.test(e.message)) { console.log(`  ${CINZA}limite por minuto atingido — esperando 30 s (tentativa ${tentativa}/3)${R}`); await dormir(30000); continue; }
          if (e.tipo === 'chave' || e.tipo === 'modelo') { console.log(`  ${VERM}${e.message}${R}`); process.exit(1); }
        }
        break;
      }
      linhas.push(linha);
      const marca = linha.acertou ? `${VERDE}✓${R}` : `${VERM}✗${R}`;
      console.log(`  ${marca} ${a.id.padEnd(20)} ${String(linha.ms).padStart(5)} ms  ${linha.cor || linha.erro}${linha.acertou ? '' : `  (certa: ${a.correta})`}${linha.modelo && c.tipo === 'bot' ? CINZA + '  ' + linha.modelo + R : ''}`);
      await dormir(ESPERA_ENTRE);
    }
    const ms = linhas.filter(l => !l.erro).map(l => l.ms);
    const resumo = {
      config: id, nome: c.nome, total: linhas.length, acertos: linhas.filter(l => l.acertou).length, erros: linhas.filter(l => l.erro).length,
      msMediana: quantil(ms, 0.5), msP90: quantil(ms, 0.9), msMax: ms.length ? Math.max(...ms) : null,
      acima3s: ms.filter(x => x > 3000).length, acima5s: ms.filter(x => x > 5000).length,
      porTipo: Object.fromEntries([...new Set(linhas.map(l => l.soVisao ? 'só-visão' : l.tipo))].map(t => {
        const g = linhas.filter(l => (l.soVisao ? 'só-visão' : l.tipo) === t); return [t, `${g.filter(l => l.acertou).length}/${g.length}`];
      })),
      linhas,
    };
    resultados.push(resumo);
    console.log(`  ${NEG}→ acerto ${pct(resumo.acertos, resumo.total)} (${resumo.acertos}/${resumo.total}) · mediana ${resumo.msMediana} ms · p90 ${resumo.msP90} ms · máx ${resumo.msMax} ms${R}\n`);
  }

  const dir = path.join(RAIZ, 'resultados'); fs.mkdirSync(dir, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const md = [
    `# Teste com o Gemini real — ${new Date().toLocaleString('pt-BR')}`, '',
    `Tempo medido só na chamada da IA (o bot soma ~0,3–0,5 s de detecção + print). Rede: a deste computador.`, '',
    '| Configuração | Acerto | Mediana | p90 | Máx | > 3 s | > 5 s | Erros de API |', '|---|---|---|---|---|---|---|---|',
    ...resultados.map(r => `| ${r.nome} | ${pct(r.acertos, r.total)} (${r.acertos}/${r.total}) | ${r.msMediana} ms | ${r.msP90} ms | ${r.msMax} ms | ${r.acima3s} | ${r.acima5s} | ${r.erros} |`),
    '', '## Acerto por tipo de pergunta', '',
    `| Tipo | ${resultados.map(r => r.config).join(' | ')} |`, `|---|${resultados.map(() => '---').join('|')}|`,
    ...[...new Set(resultados.flatMap(r => Object.keys(r.porTipo)))].map(t => `| ${t} | ${resultados.map(r => r.porTipo[t] || '-').join(' | ')} |`),
  ].join('\n');
  fs.writeFileSync(path.join(dir, `teste-gemini-${carimbo}.json`), JSON.stringify({ quando: new Date().toISOString(), config: { ...cfg }, resultados }, null, 2));
  fs.writeFileSync(path.join(dir, `teste-gemini-${carimbo}.md`), md + '\n');
  console.log(md);
  console.log(`\n${CINZA}Salvo em resultados/teste-gemini-${carimbo}.md (e .json)${R}\n`);
})().catch(e => { console.error(`${VERM}${e.message}${R}`); process.exit(1); });
