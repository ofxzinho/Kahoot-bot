// bot/config.js — lê config.json e a chave do Gemini (variável de ambiente, arquivo ou pergunta no terminal).
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RAIZ = path.resolve(__dirname, '..');
const ARQ_CHAVE = path.join(RAIZ, 'chave-gemini.txt');
const ARQ_CHAVE_GROQ = path.join(RAIZ, 'chave-groq.txt');

const PADRAO = {
  modelos: [
    { provedor: 'groq', modelo: 'openai/gpt-oss-120b', nivel: 'medium' },
    { modelo: 'gemini-3.1-flash-lite', nivel: '' },
    { modelo: 'gemini-3.5-flash-lite', nivel: 'minimal' },
    { modelo: 'gemini-3.6-flash', nivel: 'low' },
  ],
  usarCorrida: false, prazoMs: 2500, prazoImagemMs: 4000, prazoTranscricaoMs: 3300, timeoutMs: 15000, reforcoMs: 2500,
  larguraImagem: 1280, qualidadeImagem: 80,
  cliqueAutomatico: true, mostrarOverlay: true,
  navegador: 'auto', urlInicial: 'https://kahoot.it/', sites: ['kahoot.it', 'create.kahoot.it'],
  apiBase: 'https://generativelanguage.googleapis.com',
};

function lerConfig() {
  const arq = process.env.KB_CONFIG ? path.resolve(process.env.KB_CONFIG) : path.join(RAIZ, 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[aviso] config.json inválido (${e.message}) — usando padrões`);
  }
  // config antigo (modeloPreciso/modeloRapido) continua valendo
  if (!cfg.modelos && (cfg.modeloPreciso || cfg.modeloRapido)) {
    cfg.modelos = [{ modelo: cfg.modeloPreciso, nivel: cfg.nivelPreciso }, { modelo: cfg.modeloRapido, nivel: cfg.nivelRapido }].filter(m => m.modelo);
  }
  return Object.assign({}, PADRAO, cfg);
}

const limparChave = (s) => (s || '').trim().replace(/^["']|["']$/g, '').trim();

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(texto, (r) => { rl.close(); res(r); }));
}

async function obterChave() {
  const doAmbiente = limparChave(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (doAmbiente) return { chave: doAmbiente, origem: 'variável de ambiente' };
  try {
    const doArquivo = limparChave(fs.readFileSync(ARQ_CHAVE, 'utf8'));
    if (doArquivo) return { chave: doArquivo, origem: 'chave-gemini.txt' };
  } catch (_) {}
  if (process.env.KB_SEM_PERGUNTA) throw new Error('Nenhuma chave do Gemini encontrada (GEMINI_API_KEY ou chave-gemini.txt).');
  console.log('\nCole a chave da API do Gemini (https://aistudio.google.com/apikey).');
  console.log('No terminal do VS Code: Ctrl+V ou botão direito → Colar.');
  const chave = limparChave(await perguntar('Chave: '));
  if (!chave) throw new Error('Nenhuma chave informada.');
  const salvar = (await perguntar('Salvar a chave neste computador (arquivo chave-gemini.txt)? [s/N] ')).trim().toLowerCase();
  if (salvar === 's' || salvar === 'sim') {
    fs.writeFileSync(ARQ_CHAVE, chave + '\n');
    console.log('Salva. Apague o arquivo chave-gemini.txt antes de sair de um computador compartilhado.');
  }
  return { chave, origem: 'digitada' };
}

// Chave da Groq: opcional (variável GROQ_API_KEY ou arquivo chave-groq.txt). Sem ela, só o Gemini é usado.
function obterChaveGroq() {
  const amb = limparChave(process.env.GROQ_API_KEY);
  if (amb) return amb;
  try { return limparChave(fs.readFileSync(ARQ_CHAVE_GROQ, 'utf8')); } catch (_) { return ''; }
}
function chaveGeminiSalva() {
  const amb = limparChave(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (amb) return amb;
  try { return limparChave(fs.readFileSync(ARQ_CHAVE, 'utf8')); } catch (_) { return ''; }
}

// Lê as duas chaves; pede no terminal a que faltar (Enter pula). Precisa de pelo menos uma.
async function obterChaves() {
  let groq = obterChaveGroq(), gemini = chaveGeminiSalva();
  const pedir = async (nome, site, arq, dica) => {
    console.log(`\nChave ${nome} (${site}) — ${dica}`);
    console.log('Cole com Ctrl+V (ou botão direito) e aperte Enter. Só Enter = pular.');
    const c = limparChave(await perguntar('Chave: '));
    if (!c) return '';
    const sv = (await perguntar(`Salvar neste computador (${path.basename(arq)})? [s/N] `)).trim().toLowerCase();
    if (sv === 's' || sv === 'sim') { fs.writeFileSync(arq, c + '\n'); console.log(`Salva. Apague ${path.basename(arq)} antes de sair de um PC compartilhado.`); }
    return c;
  };
  if (!process.env.KB_SEM_PERGUNTA) {
    if (!groq) groq = await pedir('da Groq', 'console.groq.com/keys', ARQ_CHAVE_GROQ, 'grátis e MUITO mais rápida para perguntas de texto');
    if (!gemini) gemini = await pedir('do Gemini', 'aistudio.google.com/apikey', ARQ_CHAVE, 'necessária para perguntas com imagem/gráfico');
  }
  if (!groq && !gemini) throw new Error('Nenhuma chave informada. Crie chave-groq.txt e/ou chave-gemini.txt na pasta do projeto.');
  return { groq, gemini };
}

module.exports = { RAIZ, ARQ_CHAVE, ARQ_CHAVE_GROQ, PADRAO, lerConfig, obterChave, obterChaves, obterChaveGroq, limparChave };
