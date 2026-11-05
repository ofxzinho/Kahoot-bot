// ferramentas/montar-exe.js — gera o KahootBot.exe (Node oficial do Windows + bot/lancador.js embutido).
// Uso (em qualquer SO, com o MESMO Node 22.x do node.exe):
//   npm i --no-save resedit pe-library
//   node ferramentas/montar-exe.js caminho/para/node.exe [icone.ico]
// O node.exe oficial vem de https://nodejs.org/dist/vXX/win-x64/node.exe (ou do pacote npm node-win-x64).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const [nodeExe, icone] = process.argv.slice(2);
if (!nodeExe) { console.error('uso: node ferramentas/montar-exe.js node.exe [icone.ico]'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kb-sea-'));
const saida = path.join(RAIZ, 'KahootBot.exe');

// 1) blob do SEA (sem snapshot/cache de código, para poder gerar no Linux/mac para Windows)
fs.writeFileSync(path.join(tmp, 'sea.json'), JSON.stringify({
  main: path.join(RAIZ, 'bot', 'lancador.js'), output: path.join(tmp, 'sea.blob'),
  disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false,
}));
execFileSync(process.execPath, ['--experimental-sea-config', path.join(tmp, 'sea.json')], { stdio: 'inherit' });

// 2) ícone e informações de versão (antes de injetar o blob)
const ResEdit = require('resedit');
const PE = require('pe-library');
const exe = PE.NtExecutable.from(fs.readFileSync(nodeExe), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);
if (icone) {
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icone));
  const grupos = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, grupos.length ? grupos[0].id : 1, grupos.length ? grupos[0].lang : 1033, ico.icons.map(i => i.data));
}
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  const versao = (require(path.join(RAIZ, 'package.json')).version || '3.18.0').split('.').map(Number);
  vi.setFileVersion(versao[0], versao[1], versao[2], 0, 1033);
  vi.setProductVersion(versao[0], versao[1], versao[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'Kahoot Bot', ProductName: 'Kahoot Bot', InternalName: 'KahootBot', OriginalFilename: 'KahootBot.exe',
    CompanyName: '', LegalCopyright: 'Node.js (c) OpenJS Foundation — MIT',
  });
  vi.outputToResourceEntries(res.entries);
}
// 3) embute o blob como recurso RCDATA "NODE_SEA_BLOB" e liga o "fusível" do SEA — o mesmo que o postject faz,
//    mas sem reescrever o executável com o LIEF (que estragava a tabela de relocação do node.exe).
res.entries.push({ type: 10, id: 'NODE_SEA_BLOB', lang: 0, codepage: 0, bin: fs.readFileSync(path.join(tmp, 'sea.blob')) });
res.outputResource(exe);
const bin = Buffer.from(exe.generate());
const fusivel = Buffer.from('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2:0');
const pos = bin.indexOf(fusivel);
if (pos < 0 || bin.indexOf(fusivel, pos + 1) >= 0) throw new Error('fusível do SEA não encontrado (uma única vez) no node.exe');
bin[pos + fusivel.length - 1] = '1'.charCodeAt(0);
fs.writeFileSync(saida, bin);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`pronto: ${saida} (${(fs.statSync(saida).size / 1e6).toFixed(1)} MB)`);
