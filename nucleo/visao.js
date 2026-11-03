// nucleo/visao.js — classificação das cores do Kahoot e detecção de blocos coloridos num print.
// Script "clássico" (sem import/export) para funcionar na extensão, no painel aberto via file:// e no Node (testes).
(function (raiz) {
  'use strict';

  const CORES = ['vermelho', 'azul', 'amarelo', 'verde'];
  const FORMAS = { vermelho: 'triângulo', azul: 'losango', amarelo: 'círculo', verde: 'quadrado' };
  // Cores oficiais das caixas: vermelho #E21B3C, azul #1368CE, amarelo #D89E00, verde #26890C.
  // As faixas em HSV toleram hover, sombras e pequenas mudanças de tema.

  function rgbParaHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max ? d / max : 0, max];
  }

  function classificarRGB(r, g, b) {
    const [h, s, v] = rgbParaHsv(r, g, b);
    if (s < 0.5 || v < 0.28) return null;
    if ((h >= 330 || h <= 12) && v >= 0.4) return 'vermelho';
    if (h >= 192 && h <= 232 && v >= 0.4) return 'azul';
    if (h >= 30 && h <= 60 && s >= 0.6 && v >= 0.47) return 'amarelo';
    if (h >= 84 && h <= 144) return 'verde';
    return null; // roxo do fundo do Kahoot (~264°) cai aqui
  }

  // "rgb(226, 27, 60)" / "rgba(226, 27, 60, 0.9)" / "rgb(226 27 60 / 90%)"
  function classificarCss(texto) {
    if (!texto) return null;
    const m = texto.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i);
    if (!m) return null;
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a < 0.5) return null;
    return classificarRGB(+m[1], +m[2], +m[3]);
  }

  // Acha retângulos grandes de cada cor do Kahoot numa imagem RGBA.
  // Retorna [{cor, x, y, w, h, cx, cy}] em pixels da imagem recebida.
  function detectarBlocos(dados, largura, altura, opcoes) {
    const op = Object.assign({ areaMin: 0.006, areaMax: 0.4, preenchimentoMin: 0.5, centroYMin: 0 }, opcoes || {});
    const total = largura * altura;
    const rotulo = new Uint8Array(total);
    for (let i = 0, p = 0; i < total; i++, p += 4) {
      const c = classificarRGB(dados[p], dados[p + 1], dados[p + 2]);
      rotulo[i] = c ? CORES.indexOf(c) + 1 : 0;
    }

    const visitado = new Uint8Array(total);
    const pilha = new Int32Array(total);
    const melhores = {};
    for (let inicio = 0; inicio < total; inicio++) {
      const corIdx = rotulo[inicio];
      if (!corIdx || visitado[inicio]) continue;
      let topo = 0, n = 0, x0 = largura, y0 = altura, x1 = 0, y1 = 0;
      pilha[topo++] = inicio; visitado[inicio] = 1;
      while (topo) {
        const i = pilha[--topo];
        const x = i % largura, y = (i / largura) | 0;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !visitado[i - 1] && rotulo[i - 1] === corIdx) { visitado[i - 1] = 1; pilha[topo++] = i - 1; }
        if (x < largura - 1 && !visitado[i + 1] && rotulo[i + 1] === corIdx) { visitado[i + 1] = 1; pilha[topo++] = i + 1; }
        if (y > 0 && !visitado[i - largura] && rotulo[i - largura] === corIdx) { visitado[i - largura] = 1; pilha[topo++] = i - largura; }
        if (y < altura - 1 && !visitado[i + largura] && rotulo[i + largura] === corIdx) { visitado[i + largura] = 1; pilha[topo++] = i + largura; }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, area = w * h;
      if (area < op.areaMin * total || area > op.areaMax * total) continue;
      if (n / area < op.preenchimentoMin) continue; // foto/desenho não é um retângulo cheio
      const cy = y0 + h / 2;
      if (cy < op.centroYMin * altura) continue;
      const cor = CORES[corIdx - 1];
      const atual = melhores[cor];
      if (!atual || area > atual.w * atual.h) melhores[cor] = { cor, x: x0, y: y0, w, h, cx: x0 + w / 2, cy };
    }
    return filtrarParecidos(Object.values(melhores));
  }

  // As caixas de resposta têm tamanhos parecidos; descarta o que destoa da mediana.
  function filtrarParecidos(blocos) {
    if (blocos.length < 2) return blocos;
    const alturas = blocos.map(b => b.h).sort((a, b) => a - b);
    const areas = blocos.map(b => b.w * b.h).sort((a, b) => a - b);
    const mh = alturas[alturas.length >> 1], ma = areas[areas.length >> 1];
    return blocos.filter(b => b.h >= 0.5 * mh && b.h <= 2 * mh && b.w * b.h >= ma / 3 && b.w * b.h <= ma * 3);
  }

  const api = { CORES, FORMAS, rgbParaHsv, classificarRGB, classificarCss, detectarBlocos, filtrarParecidos };
  raiz.KBVisao = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
