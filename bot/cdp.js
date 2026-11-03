// bot/cdp.js — cliente mínimo de WebSocket + Chrome DevTools Protocol, sem dependências.
// Feito à mão para rodar no Node embutido do VS Code sem precisar de `npm install`.
'use strict';
const http = require('http');
const crypto = require('crypto');

function conectarWS(url) {
  return new Promise((resolver, rejeitar) => {
    const u = new URL(url);
    const chave = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': chave, 'Sec-WebSocket-Version': '13' },
    });
    req.on('error', rejeitar);
    req.on('response', (res) => rejeitar(new Error(`WebSocket recusado (HTTP ${res.statusCode})`)));
    req.on('upgrade', (res, socket, inicio) => {
      socket.setNoDelay(true);
      const ouvintes = { mensagem: [], fechar: [] };
      let pedacos = [], tamanho = 0, fragmentos = [], fechado = false;

      function emitirFechar() { if (!fechado) { fechado = true; ouvintes.fechar.forEach(f => f()); } }
      function enviarQuadro(opcode, dados) {
        if (fechado) return;
        const carga = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, 'utf8');
        const n = carga.length;
        const cab = n < 126 ? Buffer.alloc(2) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
        cab[0] = 0x80 | opcode;
        if (n < 126) cab[1] = 0x80 | n;
        else if (n < 65536) { cab[1] = 0x80 | 126; cab.writeUInt16BE(n, 2); }
        else { cab[1] = 0x80 | 127; cab.writeBigUInt64BE(BigInt(n), 2); }
        const mascara = crypto.randomBytes(4);
        const mascarado = Buffer.allocUnsafe(n);
        for (let i = 0; i < n; i++) mascarado[i] = carga[i] ^ mascara[i & 3];
        socket.write(Buffer.concat([cab, mascara, mascarado]));
      }
      function processar() {
        let buf = pedacos.length === 1 ? pedacos[0] : Buffer.concat(pedacos, tamanho);
        let pos = 0;
        while (buf.length - pos >= 2) {
          const b0 = buf[pos], b1 = buf[pos + 1];
          let n = b1 & 0x7f, off = pos + 2;
          if (n === 126) { if (buf.length - pos < 4) break; n = buf.readUInt16BE(pos + 2); off = pos + 4; }
          else if (n === 127) { if (buf.length - pos < 10) break; n = Number(buf.readBigUInt64BE(pos + 2)); off = pos + 10; }
          let mascara = null;
          if (b1 & 0x80) { if (buf.length < off + 4) break; mascara = buf.subarray(off, off + 4); off += 4; }
          if (buf.length < off + n) break;
          let carga = buf.subarray(off, off + n);
          if (mascara) { carga = Buffer.from(carga); for (let i = 0; i < n; i++) carga[i] ^= mascara[i & 3]; }
          pos = off + n;
          const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f;
          if (op === 0x8) { try { socket.end(); } catch (_) {} emitirFechar(); return; }
          if (op === 0x9) { enviarQuadro(0xA, carga); continue; }
          if (op === 0xA) continue;
          if (op === 0x1 || op === 0x2 || op === 0x0) {
            fragmentos.push(Buffer.from(carga));
            if (fin) { const txt = Buffer.concat(fragmentos).toString('utf8'); fragmentos = []; ouvintes.mensagem.forEach(f => f(txt)); }
          }
        }
        const resto = buf.subarray(pos);
        pedacos = resto.length ? [Buffer.from(resto)] : []; tamanho = resto.length;
      }
      socket.on('data', (d) => { pedacos.push(d); tamanho += d.length; processar(); });
      socket.on('close', emitirFechar);
      socket.on('error', emitirFechar);
      if (inicio && inicio.length) { pedacos.push(inicio); tamanho += inicio.length; processar(); }
      resolver({
        enviar: (txt) => enviarQuadro(0x1, txt),
        aoMensagem: (f) => ouvintes.mensagem.push(f),
        aoFechar: (f) => ouvintes.fechar.push(f),
        fechar: () => { try { enviarQuadro(0x8, Buffer.alloc(0)); socket.end(); } catch (_) {} },
        get fechado() { return fechado; },
      });
    });
    req.end();
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pendentes = new Map(); this.ouvintes = new Map();
    ws.aoMensagem((txt) => {
      let m; try { m = JSON.parse(txt); } catch (_) { return; }
      if (m.id !== undefined) {
        const p = this.pendentes.get(m.id);
        if (!p) return;
        this.pendentes.delete(m.id);
        if (m.error) p.rej(Object.assign(new Error(`${p.metodo}: ${m.error.message}`), { cdp: m.error }));
        else p.res(m.result || {});
      } else if (m.method) {
        (this.ouvintes.get(m.method) || []).forEach(f => { try { f(m.params || {}, m.sessionId); } catch (e) { console.error(e); } });
      }
    });
    ws.aoFechar(() => {
      for (const p of this.pendentes.values()) p.rej(new Error('Conexão com o navegador fechada'));
      this.pendentes.clear();
      (this.ouvintes.get('__fechou') || []).forEach(f => f());
    });
  }
  static async conectar(url) { return new CDP(await conectarWS(url)); }
  enviar(metodo, params, sessionId, timeoutMs) {
    return new Promise((res, rej) => {
      if (this.ws.fechado) return rej(new Error('Conexão com o navegador fechada'));
      const id = ++this.seq;
      const msg = { id, method: metodo, params: params || {} };
      if (sessionId) msg.sessionId = sessionId;
      const timer = setTimeout(() => { if (this.pendentes.delete(id)) rej(new Error(`${metodo}: sem resposta do navegador`)); }, timeoutMs || 15000);
      this.pendentes.set(id, { metodo, res: (r) => { clearTimeout(timer); res(r); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      this.ws.enviar(JSON.stringify(msg));
    });
  }
  on(metodo, f) { (this.ouvintes.get(metodo) || this.ouvintes.set(metodo, []).get(metodo)).push(f); }
  aoFechar(f) { this.on('__fechou', f); }
  fechar() { this.ws.fechar(); }
}

module.exports = { conectarWS, CDP };
