// bot/navegador.js — acha o Chrome/Edge e abre uma janela controlável (Chrome DevTools Protocol).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

function acharNavegador(pref) {
  if (process.env.KB_NAVEGADOR) return process.env.KB_NAVEGADOR;
  if (pref && pref !== 'auto') return pref;
  const cands = [];
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    cands.push(
      path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
    );
  } else if (process.platform === 'darwin') {
    cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try { cands.push(execFileSync('which', [n], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch (_) {}
    }
  }
  return cands.find(c => c && fs.existsSync(c)) || null;
}

async function abrirNavegador(exe) {
  // perfil novo a cada execução: nada de abas restauradas, cookies ou histórico de outra sessão
  let perfil = process.env.KB_PERFIL || path.join(os.tmpdir(), 'kahoot-bot-chrome');
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (_) { perfil += '-' + Date.now(); }
  fs.mkdirSync(perfil, { recursive: true });
  const arqPorta = path.join(perfil, 'DevToolsActivePort');
  try { fs.unlinkSync(arqPorta); } catch (_) {}
  const args = [
    '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--hide-crash-restore-bubble', '--disable-session-crashed-bubble',
    // mantém a página do Kahoot rodando a toda velocidade mesmo se o VS Code ficar na frente
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--start-maximized',
    '--enable-experimental-web-platform-features',   // libera o OCR do Chrome (TextDetector), quando o sistema tiver
  ];
  if (process.env.KB_HEADLESS) args.push('--headless=new', '--window-size=' + (process.env.KB_JANELA || '1920,1080'));
  if (process.env.KB_ARGS_EXTRA) args.push(...process.env.KB_ARGS_EXTRA.split(' ').filter(Boolean));
  args.push('about:blank');
  const proc = spawn(exe, args, { stdio: 'ignore', detached: false });
  let erroSpawn = null;
  proc.on('error', (e) => { erroSpawn = e; });

  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    try {
      const [porta, caminho] = fs.readFileSync(arqPorta, 'utf8').trim().split('\n');
      if (porta && caminho) return { proc, url: `ws://127.0.0.1:${porta.trim()}${caminho.trim()}`, perfil };
    } catch (_) {}
    if (erroSpawn) throw new Error(`Não consegui abrir o navegador: ${erroSpawn.message}`);
    if (proc.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 100));
  }
  try { proc.kill(); } catch (_) {}
  throw new Error('O navegador abriu mas não liberou o controle remoto (DevTools). ' +
    'Provável política do computador (RemoteDebuggingAllowed). Use a extensão (plano B) ou o painel.html (plano C).');
}


module.exports = { acharNavegador, abrirNavegador };
