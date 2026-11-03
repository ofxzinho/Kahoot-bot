// nucleo/agente.js — roda DENTRO da página do Kahoot (mundo isolado: o site não enxerga este código).
// Detecta as alternativas, espera a tela estabilizar, pede a resposta e clica.
// Print, Gemini e clique real ficam do lado de fora (bot/bot.js, via Chrome DevTools Protocol);
// a conversa com eles passa por uma "ponte":
// ponte = { pedir(tipo, dados) -> Promise, clicar(alvo, x, y) -> Promise, aoMudarConfig(cb), intervaloPrintMs, debug }
(function (raiz) {
  'use strict';
  const V = raiz.KBVisao;

  function iniciar(ponte, opcoes) {
    if (raiz.__kbAgente) return raiz.__kbAgente;
    const sites = (opcoes && opcoes.sites) || ['kahoot.it'];
    const host = location.hostname;
    // casamento exato: "kahoot.it" é a tela do jogador; play.kahoot.it (professor) e create.kahoot.it ficam de fora
    if (!sites.some(s => s.startsWith('*.') ? (host === s.slice(2) || host.endsWith(s.slice(1))) : host === s)) return null;

    const ESPERA_SUMIR_MS = 400;     // caixas sumidas por esse tempo = pergunta acabou
    const ESTAVEL_MIN_MS = 200;      // espera mínima: todas as alternativas entrarem (algumas entram atrasadas)
    const ESTAVEL_MAX_MS = 1000;
    const RECLIQUE_MS = 1500;

    const dbg = (...a) => { if (ponte.debug) console.log('[agente]', ...a); };
    const est = {
      fase: 'ocioso', cfg: { ativo: true, cliqueAutomatico: true, mostrarOverlay: true, temChave: false },
      ocupado: false, sumiuEm: null, respondidoEm: 0, ultimaChave: '', reclicou: false, avisou: false,
      corEscolhida: null, ultimoPrint: 0, cachePrint: [], viaPrint: false, agendado: false,
    };

    // ------------------------------------------------------------------ overlay
    const hospedeiro = document.createElement('div');
    hospedeiro.id = 'kb-overlay-host';
    hospedeiro.style.cssText = 'all:initial;position:fixed;left:12px;bottom:12px;z-index:2147483647;pointer-events:none;';
    const sombra = hospedeiro.attachShadow({ mode: 'closed' });
    sombra.innerHTML = `<style>
      .c{font:600 13px/1.3 system-ui,Segoe UI,Arial,sans-serif;color:#fff;background:rgba(20,20,28,.88);
         padding:7px 11px;border-radius:9px;max-width:360px;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center}
      .p{width:12px;height:12px;border-radius:3px;flex:none;background:#888}
      .s{font-weight:400;opacity:.8;font-size:12px}
    </style><div class="c"><div class="p"></div><div><div class="t">Kahoot Bot</div><div class="s"></div></div></div>`;
    const elPonto = sombra.querySelector('.p'), elTitulo = sombra.querySelector('.t'), elSub = sombra.querySelector('.s');
    const HEX = { vermelho: '#E21B3C', azul: '#1368CE', amarelo: '#D89E00', verde: '#26890C' };
    function overlay(titulo, sub, cor) {
      elTitulo.textContent = titulo; elSub.textContent = sub || ''; elSub.style.display = sub ? '' : 'none';
      elPonto.style.background = HEX[cor] || cor || '#888';
      atualizarVisibilidade();
    }
    let overlayOculto = false;
    function atualizarVisibilidade() {
      hospedeiro.style.display = (est.cfg.mostrarOverlay && !overlayOculto) ? '' : 'none';
    }
    function montarOverlay() { if (!hospedeiro.isConnected && document.documentElement) document.documentElement.appendChild(hospedeiro); }

    // ------------------------------------------------------------------ detecção pelo DOM
    const SELETOR_CLICAVEL = 'button,[role="button"],a[href],input[type="button"],input[type="submit"]';
    function alvoClicavel(el) {
      let e = el;
      for (let i = 0; e && e !== document.body && i < 6; i++, e = e.parentElement) {
        if (e.matches && e.matches(SELETOR_CLICAVEL)) return e;
      }
      return getComputedStyle(el).cursor === 'pointer' ? el : null;
    }
    function visivelNoPonto(alvo, r) {
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2);
      const hit = document.elementFromPoint(x, y);
      return !!hit && (alvo === hit || alvo.contains(hit) || hit.contains(alvo));
    }

    function escanearDOM() {
      if (!document.body) return [];
      const vw = innerWidth, vh = innerHeight, areaTela = vw * vh;
      const porCor = {};
      const todos = document.body.getElementsByTagName('*');
      for (let i = 0; i < todos.length; i++) {
        const el = todos[i];
        if (el === hospedeiro) continue;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area < areaTela * 0.006 || area > areaTela * 0.4) continue;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
        const cs = getComputedStyle(el);
        const cor = V.classificarCss(cs.backgroundColor);
        if (!cor || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) continue;
        (porCor[cor] || (porCor[cor] = [])).push({ el, area });
      }
      // nível 1: caixa colorida que é (ou está dentro de) algo clicável — descarta gráficos e fotos
      const lista = [];
      for (const cor of V.CORES) {
        const cands = (porCor[cor] || []).sort((a, b) => b.area - a.area);
        for (const c of cands) {
          const alvo = alvoClicavel(c.el);
          if (!alvo) continue;
          const r = alvo.getBoundingClientRect();
          if (r.width * r.height > c.area * 3) continue;          // "clicável" grande demais = container
          if (!visivelNoPonto(alvo, r)) continue;                  // coberto por outra tela/animação
          lista.push({ cor, alvo, x: r.left, y: r.top, w: r.width, h: r.height });
          break;
        }
      }
      const n1 = V.filtrarParecidos(lista);
      if (n1.length >= 2) return n1;
      // nível 2 (se o site mudar e as caixas deixarem de parecer clicáveis): só caixas GRANDES,
      // de tamanhos parecidos, da metade de cima para baixo da tela. O clique do bot é por coordenada,
      // então funciona em qualquer elemento.
      const lista2 = [];
      for (const cor of V.CORES) {
        const c = (porCor[cor] || []).filter(x => x.area >= areaTela * 0.015).sort((a, b) => b.area - a.area)[0];
        if (!c) continue;
        const r = c.el.getBoundingClientRect();
        if (r.top + r.height / 2 < vh * 0.35 || !visivelNoPonto(c.el, r)) continue;
        lista2.push({ cor, alvo: c.el, x: r.left, y: r.top, w: r.width, h: r.height });
      }
      const n2 = V.filtrarParecidos(lista2);
      return n2.length >= 2 ? n2 : n1;
    }

    // ------------------------------------------------------------------ detecção pelo print (reserva)
    function base64ParaBlob(b64) {
      const bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type: 'image/jpeg' });
    }
    async function reduzirImagem(b64, largura, qualidade) {
      const bmp = await createImageBitmap(base64ParaBlob(b64));
      if (bmp.width <= largura) { bmp.close && bmp.close(); return b64; }
      const alt = Math.round(bmp.height * largura / bmp.width);
      const tela = new OffscreenCanvas(largura, alt);
      tela.getContext('2d').drawImage(bmp, 0, 0, largura, alt);
      bmp.close && bmp.close();
      const u8 = new Uint8Array(await (await tela.convertToBlob({ type: 'image/jpeg', quality: qualidade })).arrayBuffer());
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(bin);
    }

    // OCR (TextDetector do Chrome; no Windows usa o OCR do sistema). Lê o texto das imagens da pergunta (ex.: código).
    async function lerImagensOCR(base64, alts) {
      if (typeof TextDetector === 'undefined') return '';
      try {
        const bmp = await createImageBitmap(base64ParaBlob(base64));
        const fx = bmp.width / innerWidth, fy = bmp.height / innerHeight;
        const topo = alts.length ? Math.min(...alts.map(a => a.y)) : innerHeight;
        const area = innerWidth * innerHeight;
        const det = new TextDetector();
        const partes = [];
        for (const el of document.querySelectorAll('img,canvas,picture,video')) {
          const r = el.getBoundingClientRect();
          if (r.width * r.height < area * 0.008 || r.bottom > topo + 2 || r.bottom <= 0) continue;
          if (/logo|icon|icn_|avatar|emoji/i.test(el.currentSrc || el.src || el.className || '')) continue;
          const corte = await createImageBitmap(bmp, Math.max(0, r.left * fx), Math.max(0, r.top * fy), Math.min(bmp.width, r.width * fx), Math.min(bmp.height, r.height * fy));
          const blocos = await det.detect(corte);
          const linhas = blocos.map(b => ({ t: b.rawValue, y: b.boundingBox.y, x: b.boundingBox.x })).sort((p, q) => (Math.abs(p.y - q.y) > 8 ? p.y - q.y : p.x - q.x));
          // reconstrói a indentação pela posição x (útil em código)
          const x0 = Math.min(...linhas.map(l => l.x).concat([0]));
          const passo = 8 * fx;
          partes.push(linhas.map(l => ' '.repeat(Math.max(0, Math.round((l.x - x0) / passo))) + l.t).join('\n'));
        }
        bmp.close && bmp.close();
        return partes.join('\n\n').trim();
      } catch (e) { dbg('OCR indisponível', e && e.message); return ''; }
    }

    async function escanearPrint() {
      const agora = performance.now();
      if (agora - est.ultimoPrint < (ponte.intervaloPrintMs || 1500)) return est.cachePrint;
      est.ultimoPrint = agora;
      let lista = [];
      try {
        const cap = await ponte.pedir('capturar', { qualidade: 50 });
        if (!cap || !cap.ok) return (est.cachePrint = []);
        dbg('print reserva', cap.base64.length);
        const bmp = await createImageBitmap(base64ParaBlob(cap.base64));
        const lw = Math.min(480, bmp.width), lh = Math.max(1, Math.round(bmp.height * lw / bmp.width));
        const tela = new OffscreenCanvas(lw, lh);
        const g = tela.getContext('2d', { willReadFrequently: true });
        g.drawImage(bmp, 0, 0, lw, lh);
        bmp.close && bmp.close();
        const dados = g.getImageData(0, 0, lw, lh).data;
        const fx = innerWidth / lw, fy = innerHeight / lh;
        for (const b of V.detectarBlocos(dados, lw, lh)) {
          const hit = document.elementFromPoint(b.cx * fx, b.cy * fy);
          const alvo = hit && alvoClicavel(hit);
          if (!alvo) continue;                                     // foto/gráfico colorido não é clicável
          const r = alvo.getBoundingClientRect();
          lista.push({ cor: b.cor, alvo, x: r.left, y: r.top, w: r.width, h: r.height });
        }
        lista = V.filtrarParecidos(lista);
      } catch (e) { dbg('erro print reserva', e.message); lista = []; }
      dbg('print reserva achou', lista.map(a => a.cor).join(',') || 'nada');
      return (est.cachePrint = lista);
    }

    // A partir das caixas achadas pela cor, pega o "grupo" (o container comum) e todas as alternativas dele.
    // Assim nenhuma alternativa fica de fora se a cor dela não for reconhecida ou se ela entrar atrasada.
    function completarGrupo(alts) {
      if (alts.length < 2) return alts;
      let cont = alts[0].alvo.parentElement;
      while (cont && !alts.every(a => cont.contains(a.alvo))) cont = cont.parentElement;
      if (!cont || cont === document.body || cont === document.documentElement) return alts;
      const areas = alts.map(a => a.w * a.h).sort((x, y) => x - y), ref = areas[areas.length >> 1];
      const vistos = new Set(alts.map(a => a.alvo));
      const extras = [];
      for (const el of cont.querySelectorAll(SELETOR_CLICAVEL + ',[data-functional-selector^="answer"]')) {
        if (vistos.has(el) || alts.some(a => a.alvo.contains(el) || el.contains(a.alvo)) || extras.some(x => x.alvo.contains(el) || el.contains(x.alvo))) continue;
        const r = el.getBoundingClientRect();
        const ar = r.width * r.height;
        if (ar < ref * 0.4 || ar > ref * 2.5 || !visivelNoPonto(el, r)) continue;
        const cor = V.classificarCss(getComputedStyle(el).backgroundColor) || 'extra' + (extras.length + 1);
        extras.push({ cor, alvo: el, x: r.left, y: r.top, w: r.width, h: r.height });
      }
      const todas = alts.concat(extras);
      // ordem de leitura: de cima para baixo, da esquerda para a direita
      return todas.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x));
    }

    async function escanear() {
      const dom = escanearDOM();
      if (dom.length >= 2) { est.viaPrint = false; return completarGrupo(dom); }
      const pr = await escanearPrint();
      if (pr.length >= 2) { est.viaPrint = true; return pr.map(a => Object.assign({}, a, reler(a.alvo))); }
      return dom;
    }
    function reler(alvo) { const r = alvo.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }

    function pontoDentro(alvo) {
      const r = alvo.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7], [0.15, 0.5], [0.85, 0.5]]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (x < 1 || y < 1 || x > innerWidth - 2 || y > innerHeight - 2) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === alvo || alvo.contains(hit))) return { x, y, ok: true, sob: textoDe(hit.closest(SELETOR_CLICAVEL) || hit) };
      }
      const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
      return { x, y, ok: false, sob: hit ? textoDe(hit.closest(SELETOR_CLICAVEL) || hit) : '' };
    }

    // depois do clique, lê o veredito do próprio Kahoot (Correto/Incorreto) para mostrar no terminal.
    // Conta só palavras que APARECERAM depois do clique e para quando chega outra pergunta (não mistura as perguntas).
    let seqPergunta = 0;
    const contar = (txt, re) => (txt.match(re) || []).length;
    const RE_ERR = /\b(incorret[oa]s?|incorrect|errad[oa]|wrong)\b/gi, RE_OK = /\b(corret[oa]s?|correct|acertou)\b/gi, RE_TEMPO = /tempo esgotado|time'?s up/gi;
    function vigiarVeredito(pergunta, escolha) {
      const meu = ++seqPergunta, inicio = performance.now();
      const base = document.body.innerText || '';
      const b = { err: contar(base, RE_ERR), ok: contar(base, RE_OK), tempo: contar(base, RE_TEMPO) };
      const t = setInterval(() => {
        if (meu !== seqPergunta) { clearInterval(t); ponte.pedir('veredito', { pergunta, escolha, veredito: 'não apareceu a tempo' }).catch(() => {}); return; }
        const txt = document.body.innerText || '';
        let v = null;
        if (contar(txt, RE_ERR) > b.err) v = 'incorreto';
        else if (contar(txt, RE_OK) > b.ok) v = 'correto';
        else if (contar(txt, RE_TEMPO) > b.tempo) v = 'tempo';
        if (v || performance.now() - inicio > 8000) {
          clearInterval(t);
          ponte.pedir('veredito', { pergunta, escolha, veredito: v || 'não apareceu' }).catch(() => {});
        }
      }, 100);
    }

    // ------------------------------------------------------------------ texto
    const limpa = s => (s || '').replace(/\s+/g, ' ').trim();
    function textoDe(el) { return limpa(el.innerText || el.textContent).slice(0, 400); }
    // Só texto que está realmente visível na tela (o Kahoot tem textos escondidos de acessibilidade).
    function textosVisiveis() {
      const out = [];
      if (!document.body) return out;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.nodeValue.replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el || el.closest('script,style,noscript,template')) continue;
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1 || cs.clipPath === 'inset(50%)' || (cs.clip && cs.clip !== 'auto' && r.width < 3)) continue;
        out.push({ t, r });
      }
      return out;
    }
    function textoTela(textosAlternativas) {
      const linhas = textosVisiveis().map(x => x.t);
      const fora = linhas.filter(l => !textosAlternativas.some(t => t && (t === l || t.includes(l))));
      return fora.join('\n').slice(0, 3000);
    }
    // "Assinatura" da pergunta: todo texto visível ACIMA das alternativas (enunciado, código…) + imagens.
    // Ignora números soltos (timer, pontuação). Muda quando a pergunta muda, mesmo com o mesmo enunciado.
    function assinaturaAcima(alts) {
      const topo = alts && alts.length ? Math.min(...alts.map(a => a.y)) + 2 : innerHeight;
      const txt = textosVisiveis().filter(x => x.r.bottom <= topo && !/^[\d\s:./%-]+$/.test(x.t)).map(x => x.t).join(' ');
      const imgs = Array.from(document.images).filter(im => { const r = im.getBoundingClientRect(); return r.width * r.height > 2500 && r.bottom <= topo && r.bottom > 0; })
        .map(im => (im.currentSrc || im.src || '').slice(-80)).join(' ');
      return (txt + ' ' + imgs).trim();
    }
    const textosDe = alts => alts.map(a => `${a.cor}:${textoDe(a.alvo)}`).join('|');
    const linhaPergunta = (t) => (t || '').split('\n').map(l => l.replace(/\d+/g, '').trim()).sort((a, b) => b.length - a.length)[0] || '';
    const chaveDe = alts => alts.map(a => `${a.cor}:${Math.round(a.x / 3)},${Math.round(a.y / 3)},${Math.round(a.w / 3)},${Math.round(a.h / 3)}:${textoDe(a.alvo)}`).join('|');

    // Só conta imagem/gráfico/vídeo DA PERGUNTA (o Kahoot tem fundos e enfeites que não importam).
    function temMidia(alts) {
      const area = innerWidth * innerHeight;
      const topoAlts = Math.min(...alts.map(a => a.y).concat([innerHeight]));
      for (const el of document.querySelectorAll('img,canvas,video,picture')) {
        if (alts.some(a => a.alvo.contains(el))) continue;
        const r = el.getBoundingClientRect();
        const ar = r.width * r.height;
        if (ar < area * 0.008 || ar > area * 0.7) continue;          // pequeno demais = ícone; enorme = fundo da tela
        if (/logo|icon|icn_|avatar|emoji/i.test(el.currentSrc || el.src || el.className || '')) continue;
        if (r.bottom <= 0 || r.top >= topoAlts) continue;           // tem que estar acima das alternativas
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) continue;
        if (el.tagName === 'IMG' && !el.complete) continue;
        return true;
      }
      return false;
    }

    const dormir = ms => new Promise(r => setTimeout(r, ms));
    async function esperarEstabilizar(alts) {
      const inicio = performance.now();
      let anterior = chaveDe(alts) + '#' + assinaturaAcima(alts), iguais = 0;
      while (performance.now() - inicio < ESTAVEL_MAX_MS) {
        await dormir(60);
        const novo = est.viaPrint ? alts.filter(a => a.alvo.isConnected).map(a => Object.assign({}, a, reler(a.alvo))) : completarGrupo(escanearDOM());
        if (novo.length < 2) return null;
        const k = chaveDe(novo) + '#' + assinaturaAcima(novo);
        const imagensProntas = Array.from(document.images).every(im => im.complete || im.getBoundingClientRect().width < 40);
        iguais = k === anterior ? iguais + 1 : 0;
        if (iguais >= 2 && performance.now() - inicio >= ESTAVEL_MIN_MS && (imagensProntas || performance.now() - inicio > 600)) return novo;
        anterior = k; alts = novo;
      }
      return alts;
    }

    // ------------------------------------------------------------------ ciclo principal
    async function responder(alts, t0) {
      est.fase = 'respondendo';
      seqPergunta++;
      dbg('detectou', alts.map(a => a.cor).join(','), est.viaPrint ? '(print)' : '(DOM)');
      alts = await esperarEstabilizar(alts);
      dbg('estável', alts && alts.length);
      if (!alts) { est.fase = 'ocioso'; return; }

      const textos = alts.map(a => textoDe(a.alvo));
      const semTexto = textos.some(t => !t);
      // com texto: a IA escolhe pelo número/texto (a cor não importa); sem texto: pela cor no print
      const alternativas = alts.map((a, i) => ({ id: semTexto ? a.cor : String(i + 1), cor: a.cor, texto: textos[i] }));
      const acima = assinaturaAcima(alts);
      const tela = (acima ? `PERGUNTA (texto acima das alternativas): ${acima}\n\nResto da tela:\n` : '') + textoTela(textos);
      dbg('textos ok', tela.length);

      // Sem imagem/gráfico na pergunta e com o texto todo na página, manda SÓ o texto (bem mais rápido para a IA).
      const perguntaCurta = tela.replace(/\s+/g, '').length < 12;
      const precisaPrint = semTexto || perguntaCurta || est.viaPrint || temMidia(alts);
      dbg('precisa de print?', precisaPrint);
      if (!precisaPrint) {
        overlay('Pensando…', `${alternativas.length} alternativas`, '#7a5cff');
      }
      overlayOculto = precisaPrint; atualizarVisibilidade();          // o aviso não aparece no print
      dbg('esperando quadro');
      if (precisaPrint) await Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), dormir(80)]);
      dbg('quadro ok');
      let cap = null;
      if (precisaPrint) { try { cap = await ponte.pedir('capturar', { qualidade: 90 }); } catch (e) { dbg('falha no print', e.message); } }
      overlayOculto = false;
      overlay('Pensando…', `${alternativas.length} alternativas`, '#7a5cff');
      let imagem = null, ocr = '';
      if (cap && cap.ok) ocr = await lerImagensOCR(cap.base64, alts);
      if (cap && cap.ok) {
        try { imagem = await reduzirImagem(cap.base64, ponte.larguraImagem || 1280, (ponte.qualidadeImagem || 80) / 100); }
        catch (e) { dbg('falha ao reduzir print', e.message); imagem = cap.base64; }
      }
      dbg('print', cap && cap.ok);

      const tPrint = performance.now() - t0;
      let r;
      try {
        r = await ponte.pedir('responder', {
          imagem, alternativas, decorridoMs: performance.now() - t0, ocr: ocr.length >= 15,
          textoTela: ocr.length >= 15 ? `${tela}\n\nTEXTO DA IMAGEM (lido por OCR; pode ter pequenos erros de leitura):\n"""\n${ocr.slice(0, 2500)}\n"""` : tela,
        });
      } catch (e) { r = { ok: false, erro: String(e && e.message || e) }; }

      const registro = { quando: Date.now(), cores: alternativas.map(a => a.cor), pergunta: assinaturaAcima(alts).slice(0, 120) || linhaPergunta(tela), semTexto, viaPrint: est.viaPrint, comPrint: !!imagem, ocr: ocr.length >= 15, msPrint: Math.round(tPrint) };
      if (r && r.ok) {
        const idx = alternativas.findIndex(a => a.id === r.cor);
        const alt = alternativas[idx] || {};
        r.cor = alt.cor || r.cor;
        est.corEscolhida = r.cor; est.alvoEscolhido = null;
        const escolhida = alts[idx] && alts[idx].alvo.isConnected ? alts[idx] : (escanearDOM().find(a => a.cor === r.cor) || alts[idx]);
        let clicou = false;
        let pt = null;
        if (escolhida && est.cfg.cliqueAutomatico && est.cfg.ativo) {
          pt = escolhida.alvo.isConnected ? pontoDentro(escolhida.alvo) : { x: escolhida.x + escolhida.w / 2, y: escolhida.y + escolhida.h / 2, ok: false, sob: '' };
          try { await ponte.clicar(escolhida.alvo, pt.x, pt.y); clicou = true; est.alvoEscolhido = escolhida.alvo; } catch (_) {}
          vigiarVeredito((acima || linhaPergunta(tela)).slice(0, 120), alt.texto || r.cor);
        }
        const total = (performance.now() - t0) / 1000;
        const textoEsc = alt.texto;
        overlay(`${textoEsc ? textoEsc.slice(0, 40) : r.cor.toUpperCase()} · ${total.toFixed(2)} s${clicou ? '' : ' (clique você)'}`,
          `${r.modelo}${semTexto ? ' · ⚠ sem texto na tela' : ''}`, r.cor);
        Object.assign(registro, { ok: true, cor: r.cor, texto: textoEsc || '', modelo: r.modelo, transcritoPor: r.transcritoPor || '', msIA: r.msIA, msTotal: Math.round(total * 1000), clicou, detalhes: r.detalhes,
          lista: alternativas.map(a => a.texto || a.cor), escolhaIdx: idx + 1, sobClique: pt ? pt.sob : '', pontoOk: pt ? pt.ok : null });
      } else {
        est.corEscolhida = null;
        overlay('Sem resposta', (r && r.erro) || 'erro desconhecido', '#c0392b');
        Object.assign(registro, { ok: false, erro: (r && r.erro) || 'erro', msTotal: Math.round(performance.now() - t0), detalhes: r && r.detalhes });
      }
      ponte.pedir('registrar', registro).catch(() => {});
      est.fase = 'respondido'; est.respondidoEm = performance.now(); est.sumiuEm = null;
      est.reguaRespondida = null; est.puzzleRespondido = false; est.ultimaChave = chaveDe(alts); est.ultimosTextos = semTexto ? '' : textosDe(alts); est.ultimaPergunta = linhaPergunta(tela); est.ultimaAssinatura = assinaturaAcima(alts); est.vereditoBase = (() => { const b = document.body.innerText || ''; return contar(b, RE_ERR) + contar(b, RE_OK); })(); est.reclicou = false; est.avisou = false;
    }

    // ------------------------------------------------------------------ régua (slider)
    function acharRegua() {
      for (const el of document.querySelectorAll('input[type="range"],[role="slider"]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.bottom <= 0 || r.top >= innerHeight) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        return el;
      }
      return null;
    }
    function infoRegua(el) {
      const num = (v, pad) => { const n = parseFloat(v); return isFinite(n) ? n : pad; };
      if (el.tagName === 'INPUT') return { min: num(el.min, 0), max: num(el.max, 100), step: num(el.step, 1) || 1, valor: num(el.value, 0) };
      return { min: num(el.getAttribute('aria-valuemin'), 0), max: num(el.getAttribute('aria-valuemax'), 100),
        step: num(el.getAttribute('data-step') || el.getAttribute('step'), 1) || 1, valor: num(el.getAttribute('aria-valuenow'), 0) };
    }
    function botaoEnviar() {
      for (const b of document.querySelectorAll('button,[role="button"],input[type="submit"]')) {
        const t = limpa(b.innerText || b.value || b.getAttribute('aria-label') || '');
        if (/^(enviar|submit|confirmar|responder|ok|send)$/i.test(t)) { const r = b.getBoundingClientRect(); if (r.width && visivelNoPonto(b, r)) return b; }
      }
      return null;
    }
    async function responderRegua(el, t0) {
      est.fase = 'respondendo';
      seqPergunta++;
      await dormir(300);                                   // termina a animação de entrada
      if (!el.isConnected) { est.fase = 'ocioso'; return; }
      const info = infoRegua(el);
      const tela = textoTela([]).split('\n').filter(l => !/^\d+$/.test(l.trim())).join('\n');
      const precisaPrint = tela.replace(/\s+/g, '').length < 12 || temMidia([]);
      let imagem = null;
      if (precisaPrint) {
        overlayOculto = true; atualizarVisibilidade();
        await Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), dormir(80)]);
        try { const cap = await ponte.pedir('capturar', { qualidade: 90 }); if (cap && cap.ok) imagem = await reduzirImagem(cap.base64, ponte.larguraImagem || 1280, 0.8); } catch (_) {}
        overlayOculto = false;
      }
      overlay('Pensando…', `régua de ${info.min} a ${info.max}`, '#7a5cff');
      let r;
      try { r = await ponte.pedir('responderNumero', { imagem, textoTela: tela, min: info.min, max: info.max, step: info.step, decorridoMs: performance.now() - t0 }); }
      catch (e) { r = { ok: false, erro: String(e.message || e) }; }
      const registro = { quando: Date.now(), slider: true, cores: [], pergunta: linhaPergunta(tela), comPrint: !!imagem };
      if (r && r.ok) {
        // move a régua pelo teclado (clique "real"): foca, calcula quantos passos e confere
        let conferido = false;
        for (let tentativa = 0; tentativa < 3 && est.cfg.cliqueAutomatico; tentativa++) {
          el.focus();
          const atual = infoRegua(el).valor;
          const passos = Math.round((r.valor - atual) / info.step);
          if (passos === 0) { conferido = true; break; }
          const teclas = [];
          for (let i = 0; i < Math.min(Math.abs(passos), 3000); i++) teclas.push(passos > 0 ? 'ArrowRight' : 'ArrowLeft');
          try { await ponte.pedir('teclas', { teclas }); } catch (_) { break; }
          await dormir(60);
        }
        if (!conferido && el.tagName === 'INPUT') {             // reserva para <input type=range>
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          set.call(el, String(r.valor)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          conferido = Math.abs(infoRegua(el).valor - r.valor) < info.step / 2;
        }
        const env = botaoEnviar();
        if (env && est.cfg.cliqueAutomatico) { const rr = env.getBoundingClientRect(); try { await ponte.clicar(env, rr.left + rr.width / 2, rr.top + rr.height / 2); } catch (_) {} }
        const total = (performance.now() - t0) / 1000;
        overlay(`Régua: ${r.valor} · ${total.toFixed(2)} s${env ? '' : ' (aperte Enviar)'}`, r.modelo, '#2ecc71');
        Object.assign(registro, { ok: true, valor: r.valor, modelo: r.modelo, msIA: r.msIA, msTotal: Math.round(total * 1000), conferido, enviou: !!env, cor: 'regua', clicou: !!env });
      } else {
        overlay('Sem resposta', (r && r.erro) || 'erro', '#c0392b');
        Object.assign(registro, { ok: false, erro: (r && r.erro) || 'erro', msTotal: Math.round(performance.now() - t0) });
      }
      ponte.pedir('registrar', registro).catch(() => {});
      est.fase = 'respondido'; est.respondidoEm = performance.now(); est.sumiuEm = null;
      est.reguaRespondida = el; est.ultimosTextos = ''; est.ultimaPergunta = linhaPergunta(tela); est.ultimaAssinatura = ''; est.corEscolhida = null;
    }

    // ------------------------------------------------------------------ ordenar (puzzle)
    const RE_PUZZLE = /arraste os blocos|ordem certa|ordem correta|na ordem|drag the blocks|correct order|put .* in order/i;
    function acharPuzzle() {
      const alts = completarGrupo(escanearDOM());
      if (alts.length < 2 || !botaoEnviar()) return null;
      const txt = textosVisiveis().map(x => x.t).join(' ');
      if (!RE_PUZZLE.test(txt)) return null;
      // blocos empilhados (uma coluna), não a grade 2×2 de múltipla escolha
      const xs = alts.map(a => Math.round(a.x / 10));
      return xs.every(x => Math.abs(x - xs[0]) <= 3) ? alts : null;
    }
    const ordemAtual = (n) => { const a = completarGrupo(escanearDOM()); return a.length === n ? a.sort((p, q) => p.y - q.y) : null; };
    async function responderPuzzle(alts, t0) {
      est.fase = 'respondendo'; seqPergunta++;
      alts = (await esperarEstabilizar(alts)) || alts;
      alts = alts.slice().sort((p, q) => p.y - q.y);
      const limpaBloco = (t) => t.replace(/\s*[=≡☰⋮]+\s*$/, '').trim();          // tira o ícone de "arrastar"
      const itens = alts.map((a, i) => ({ id: String(i + 1), texto: limpaBloco(textoDe(a.alvo)) }));
      const acima = assinaturaAcima(alts);
      const tela = (acima ? `PERGUNTA: ${acima}\n\n` : '') + textoTela(itens.map(i => i.texto));
      let imagem = null;
      if (temMidia(alts)) {
        overlayOculto = true; atualizarVisibilidade(); await dormir(80);
        try { const cap = await ponte.pedir('capturar', { qualidade: 90 }); if (cap && cap.ok) imagem = await reduzirImagem(cap.base64, ponte.larguraImagem || 1280, 0.8); } catch (_) {}
        overlayOculto = false;
      }
      overlay('Pensando…', `ordenar ${itens.length} blocos`, '#7a5cff');
      let r;
      try { r = await ponte.pedir('responderOrdem', { itens, textoTela: tela, imagem, decorridoMs: performance.now() - t0 }); }
      catch (e) { r = { ok: false, erro: String(e.message || e) }; }
      const registro = { quando: Date.now(), cores: [], pergunta: (acima || '').slice(0, 120), comPrint: !!imagem };
      if (r && r.ok && est.cfg.cliqueAutomatico) {
        const desejado = r.ordem.map(id => itens.find(i => i.id === id).texto);
        const tx = (a) => limpaBloco(textoDe(a.alvo));
        let conferido = false;
        for (let volta = 0; volta < 3 && !conferido; volta++) {
          for (let pos = 0; pos < desejado.length; pos++) {
            const atual = ordemAtual(desejado.length);
            if (!atual) break;
            if (tx(atual[pos]) === desejado[pos]) continue;
            const de = atual.find(a => tx(a) === desejado[pos]);
            if (!de) continue;
            const pa = atual[pos], rd = de.alvo.getBoundingClientRect(), rp = pa.alvo.getBoundingClientRect();
            const xPega = rd.right - Math.min(40, rd.width * 0.06), yPega = rd.top + rd.height / 2;
            const yAlvo = rp.top + rp.height * (rd.top > rp.top ? 0.3 : 0.7);
            try { await ponte.pedir('arrastar', { x1: xPega, y1: yPega, x2: xPega, y2: yAlvo }); } catch (_) {}
            await dormir(350);
            const depois = ordemAtual(desejado.length);
            if (depois && tx(depois[pos]) !== desejado[pos] && volta > 0) {
              // reserva: teclado (padrão das bibliotecas de arrastar): foca, Espaço, setas, Espaço
              const idx = depois.findIndex(a => tx(a) === desejado[pos]);
              if (idx > pos) {
                depois[idx].alvo.focus();
                try { await ponte.pedir('teclas', { teclas: [' ', ...Array(idx - pos).fill('ArrowUp'), ' '] }); } catch (_) {}
                await dormir(350);
              }
            }
          }
          const fim = ordemAtual(desejado.length);
          conferido = !!fim && fim.every((a, i) => tx(a) === desejado[i]);
        }
        const env = botaoEnviar();
        if (env) { const rr = env.getBoundingClientRect(); try { await ponte.clicar(env, rr.left + rr.width / 2, rr.top + rr.height / 2); } catch (_) {} }
        const total = (performance.now() - t0) / 1000;
        overlay(`Ordem enviada · ${total.toFixed(2)} s${conferido ? '' : ' (⚠ confira)'}`, r.modelo, conferido ? '#2ecc71' : '#e67e22');
        vigiarVeredito((acima || '').slice(0, 120), desejado.join(' → ').slice(0, 60));
        Object.assign(registro, { ok: true, ordem: desejado.map(t => t.slice(0, 30)), modelo: r.modelo, msIA: r.msIA, msTotal: Math.round(total * 1000), conferido, cor: 'ordem', clicou: !!env });
      } else {
        overlay('Sem resposta', (r && r.erro) || 'erro', '#c0392b');
        Object.assign(registro, { ok: false, erro: (r && r.erro) || 'clique automático desligado', msTotal: Math.round(performance.now() - t0) });
      }
      ponte.pedir('registrar', registro).catch(() => {});
      est.fase = 'respondido'; est.respondidoEm = performance.now(); est.sumiuEm = null; est.corEscolhida = null;
      est.ultimosTextos = textosDe(alts); est.ultimaAssinatura = acima; est.puzzleRespondido = true;
      est.vereditoBase = (() => { const b = document.body.innerText || ''; return contar(b, RE_ERR) + contar(b, RE_OK); })();
    }

    async function ciclo() {
      if (est.ocupado) return;
      est.ocupado = true;
      try {
        montarOverlay();
        if (!est.cfg.ativo) return;
        if (est.fase === 'ocioso') {
          const t0 = performance.now();
          const puzzle = est.cfg.temChave && acharPuzzle();
          if (puzzle) {
            try { await responderPuzzle(puzzle, t0); } catch (e) { dbg('erro puzzle', e && e.message); est.fase = 'respondido'; est.respondidoEm = performance.now(); }
            return;
          }
          const regua = acharRegua();
          if (regua && est.cfg.temChave && escanearDOM().length < 2) {
            try { await responderRegua(regua, t0); } catch (e) { dbg('erro régua', e && e.message); est.fase = 'respondido'; est.respondidoEm = performance.now(); }
            return;
          }
          const alts = await escanear();
          if (alts.length >= 2) {
            if (!est.cfg.temChave) { overlay('Falta a chave do Gemini', 'configure e recarregue', '#c0392b'); return; }
            try { await responder(alts, t0); }
            catch (e) {                                              // nunca deixa o bot travado no meio de uma pergunta
              dbg('erro inesperado', e && e.message);
              overlay('Erro inesperado', String(e && e.message || e).slice(0, 80), '#c0392b');
              est.fase = 'respondido'; est.respondidoEm = performance.now(); est.sumiuEm = null; est.corEscolhida = null;
            }
          }
        } else if (est.fase === 'respondido' && est.reguaRespondida) {
          const ainda = acharRegua();
          if (ainda && ainda === est.reguaRespondida && linhaPergunta(textoTela([])) === est.ultimaPergunta) { est.sumiuEm = null; }
          else if (ainda && escanearDOM().length < 2 && linhaPergunta(textoTela([])) !== est.ultimaPergunta) { est.fase = 'ocioso'; est.reguaRespondida = null; }
          else if (est.sumiuEm === null) est.sumiuEm = performance.now();
          else if (performance.now() - est.sumiuEm > ESPERA_SUMIR_MS) { est.fase = 'ocioso'; est.reguaRespondida = null; }
        } else if (est.fase === 'respondido') {
          const alts = est.viaPrint ? await escanear() : completarGrupo(escanearDOM());
          const agora = performance.now();
          const novaPergunta = alts.length >= 2 && (() => {
            const txtAtual = alts.map(a => textoDe(a.alvo));
            if (est.puzzleRespondido && txtAtual.slice().sort().join('|') === (est.ultimosTextos || '').split('|').map(x => x.replace(/^[^:]*:/, '')).sort().join('|')) return false;
            const anteriores = (est.ultimosTextos || '').split('|').map(x => x.replace(/^[^:]*:/, ''));
            // tela de resultado: sobrou parte das alternativas de antes (ou apareceu "Correto/Incorreto")
            const subconjunto = est.ultimosTextos && txtAtual.every(t => anteriores.includes(t));
            if (subconjunto && alts.length < anteriores.length) return false;
            const base = document.body.innerText || '';
            if (subconjunto && est.vereditoBase !== undefined && contar(base, RE_ERR) + contar(base, RE_OK) > est.vereditoBase) return false;
            const sig = assinaturaAcima(alts);
            if (sig && est.ultimaAssinatura) return sig.replace(/\b(in)?corret[oa]s?\b/gi, '') !== est.ultimaAssinatura.replace(/\b(in)?corret[oa]s?\b/gi, '');
            return !!est.ultimosTextos && alts.some(a => textoDe(a.alvo)) && textosDe(alts) !== est.ultimosTextos;
          })();
          if (novaPergunta) {
            // alternativas com outro texto = pergunta nova (o Kahoot trocou sem a tela "sumir"): responde já
            dbg('pergunta nova sem transição');
            est.fase = 'ocioso'; est.corEscolhida = null;
            est.ocupado = false; return ciclo();
          } else if (alts.length >= 2) {
            est.sumiuEm = null;
            // mesma pergunta ainda na tela: o clique pode não ter pegado
            if (est.corEscolhida && est.cfg.cliqueAutomatico && chaveDe(alts) === est.ultimaChave && agora - est.respondidoEm > RECLIQUE_MS) {
              const a = alts.find(x => x.alvo === est.alvoEscolhido) || alts.find(x => x.cor === est.corEscolhida);
              if (a && !est.reclicou) {
                est.reclicou = true; est.respondidoEm = agora;
                try { await ponte.clicar(a.alvo, a.x + a.w / 2, a.y + a.h / 2); } catch (_) {}
              } else if (a && !est.avisou) {
                est.avisou = true;
                overlay(`Clique em ${est.corEscolhida.toUpperCase()}`, 'o clique automático não registrou', est.corEscolhida);
              }
            }
          } else if (est.sumiuEm === null) est.sumiuEm = agora;
          else if (agora - est.sumiuEm > ESPERA_SUMIR_MS) { est.fase = 'ocioso'; est.corEscolhida = null; }
        }
      } finally { est.ocupado = false; }
    }

    function agendar() {
      if (est.agendado) return;
      est.agendado = true;
      setTimeout(() => { est.agendado = false; ciclo(); }, 30);
    }

    // ------------------------------------------------------------------ inicialização
    async function carregarConfig() {
      try { Object.assign(est.cfg, await ponte.pedir('config')); } catch (_) {}
      atualizarVisibilidade();
    }
    function mostrarStatus() {
      if (!est.cfg.ativo) overlay('Pausado', 'Alt+Shift+K para retomar', '#888');
      else if (!est.cfg.temChave) overlay('Falta a chave do Gemini', '', '#c0392b');
    }

    (async () => {
      await carregarConfig();
      montarOverlay();
      mostrarStatus();
      (async () => {
        let ocr = false;
        try {
          const c = new OffscreenCanvas(220, 60), g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, 220, 60); g.fillStyle = '#000'; g.font = '32px monospace'; g.fillText('pilha', 10, 42);
          ocr = typeof TextDetector !== 'undefined' && (await new TextDetector().detect(await createImageBitmap(c))).length > 0;
        } catch (_) { ocr = false; }
        ponte.pedir('info', { ocr }).catch(() => {});
      })();
      // a detecção começa já; o aquecimento do Gemini roda em paralelo (se a API estiver lenta, não atrasa nada)
      new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      setInterval(ciclo, 150);
      if (est.cfg.ativo && est.cfg.temChave) {
        overlay('Conectando ao Gemini…', '', '#7a5cff');
        ponte.pedir('aquecer').then((a) => {
          if (est.fase !== 'ocioso') return;                    // já está respondendo: não sobrescreve o aviso
          if (a && a.ok) overlay('Pronto — aguardando pergunta', a.modelos.map(m => `${m.modelo} ${m.ms} ms`).join(' · '), '#2ecc71');
          else overlay('Problema com o Gemini', (a && a.modelos || []).filter(m => !m.ok).map(m => `${m.modelo}: ${m.erro}`).join(' | ') || (a && a.erro) || '', '#c0392b');
        }).catch((e) => { if (est.fase === 'ocioso') overlay('Problema com o Gemini', String(e.message || e), '#c0392b'); });
      }
      if (ponte.aoMudarConfig) ponte.aoMudarConfig(async () => { await carregarConfig(); mostrarStatus(); });
      addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
          ponte.pedir('alternar').then(async () => { await carregarConfig(); if (est.cfg.ativo) overlay('Ativo', 'aguardando pergunta', '#2ecc71'); else mostrarStatus(); }).catch(() => {});
        }
      }, true);
    })();

    raiz.__kbAgente = { est, escanearDOM, escanearPrint, ciclo };
    return raiz.__kbAgente;
  }

  raiz.KBAgente = { iniciar };
})(typeof self !== 'undefined' ? self : globalThis);
