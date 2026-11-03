// testes/gerar-amostras.js — gera os prints (e o gabarito) usados pelo teste com o Gemini REAL (bot/testar-gemini.js).
// Os prints vêm das telas simuladas, no mesmo formato que o bot envia (JPEG, até 1280 px de largura).
// Uso: node testes/gerar-amostras.js   (precisa do Playwright; só para quem mantém o projeto)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { criarServidor } = require('./servidor-mock');
const { Q } = require('./paginas-mock');

const DIR = path.join(__dirname, 'amostras');
const TELAS = {
  'pc-1080p': { viewport: { width: 1920, height: 1080 } },
  'notebook-768p': { viewport: { width: 1366, height: 768 } },
  'monitor-1440p': { viewport: { width: 2560, height: 1440 } },
  'celular': { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

const itens = [];
for (const k of Object.keys(Q)) itens.push({ id: k, pergunta: k, tela: 'pc-1080p' });
itens.push({ id: 'capital-768p', pergunta: 'capital', tela: 'notebook-768p' });
itens.push({ id: 'grafico-1440p', pergunta: 'grafico', tela: 'monitor-1440p' });
itens.push({ id: 'http404-celular', pergunta: 'http404', tela: 'celular' });
itens.push({ id: 'patch-celular', pergunta: 'patch', tela: 'celular' });
// "só visão": simula falha ao ler o texto da página — a IA só tem o print
for (const k of ['porcento', 'naoHttp', 'vf2', 'git']) itens.push({ id: `${k}-so-visao`, pergunta: k, tela: 'pc-1080p', soVisao: true });

(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  const srv = criarServidor(); const porta = await srv.iniciar();
  const nav = await chromium.launch();
  const gabarito = [];
  for (const it of itens) {
    const q = Q[it.pergunta];
    const ctx = await nav.newContext(TELAS[it.tela]);
    const pg = await ctx.newPage();
    srv.limpar();
    await pg.goto(`http://127.0.0.1:${porta}/kahoot/q-${it.pergunta}?lobby=100&limite=60000`);
    while (!srv.estado.eventos.some(e => e.tipo === 'mostrou')) await pg.waitForTimeout(50);
    await pg.waitForTimeout(700); // fim da animação
    const png = path.join(DIR, it.id + '.png');
    await pg.screenshot({ path: png });
    const lido = await pg.evaluate(() => {
      const limpa = s => (s || '').replace(/\s+/g, ' ').trim();
      const alts = [...document.querySelectorAll('.resp')].map(b => ({ cor: b.dataset.cor, texto: limpa(b.innerText) }));
      const linhas = document.body.innerText.split('\n').map(limpa).filter(Boolean);
      const tela = linhas.filter(l => !alts.some(a => a.texto && (a.texto === l || a.texto.includes(l)))).join('\n');
      return { alts, tela };
    });
    // reduz para no máximo 1280 px de largura, JPEG 80 — igual ao que o bot envia
    const jpg = path.join(DIR, it.id + '.jpg');
    execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(png)}).convert('RGB'); w,h=im.size; s=min(1,1280/w); im=im.resize((round(w*s),round(h*s)), Image.LANCZOS); im.save(${JSON.stringify(jpg)}, quality=80)`]);
    fs.unlinkSync(png);
    gabarito.push({
      id: it.id, arquivo: it.id + '.jpg', tela: it.tela, soVisao: !!it.soVisao,
      tipo: q.imagem || (q.alts.length === 2 ? 'verdadeiro-falso' : q.texto.length > 150 ? 'texto-longo' : 'texto'),
      alternativas: lido.alts.map(a => ({ cor: a.cor, texto: it.soVisao ? '' : a.texto })),
      textoTela: it.soVisao ? '' : lido.tela,
      correta: q.correta, respostaCorreta: q.alts.find(a => a[0] === q.correta)[1],
    });
    await ctx.close();
    process.stdout.write('.');
  }
  fs.writeFileSync(path.join(DIR, 'gabarito.json'), JSON.stringify(gabarito, null, 2));
  console.log(`\n${gabarito.length} amostras em ${DIR}`);
  await nav.close(); await srv.parar();
})();
