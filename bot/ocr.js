// bot/ocr.js — OCR LOCAL (Tesseract em WebAssembly, já incluído na pasta bot/ocr). Sem internet, sem limite, ~50–250 ms.
// Usado para ler o texto/código das imagens das perguntas antes de mandar para a Groq resolver.
'use strict';
const path = require('path');
const DIR = path.join(__dirname, 'ocr');
let pronto = null, worker = null;

function iniciar() {
  if (!pronto) {
    pronto = (async () => {
      const { createWorker, PSM } = require(path.join(DIR, 'node_modules', 'tesseract.js'));
      const w = await createWorker('eng', 1, { langPath: DIR, cachePath: DIR, cacheMethod: 'none', gzip: false });
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
      worker = w;
      return w;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

async function ler(base64) {
  const w = await iniciar();
  const r = await w.recognize(Buffer.from(base64, 'base64'));
  const texto = (r.data.text || '').replace(/\n{3,}/g, '\n\n').trim();
  return { texto, confianca: Math.round(r.data.confidence || 0) };
}

async function encerrar() { try { if (worker) await worker.terminate(); } catch (_) {} }

module.exports = { iniciar, ler, encerrar };
