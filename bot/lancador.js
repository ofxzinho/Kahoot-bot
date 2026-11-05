// bot/lancador.js — ponto de entrada do KahootBot.exe (Node embutido, "single executable application").
// O .exe só traz o Node; o código do bot fica na pasta ao lado (bot/, nucleo/, config.json),
// então dá para editar o config.json e atualizar o bot sem gerar outro .exe.
'use strict';
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

process.env.KB_EXE = '1';
try { process.title = 'Kahoot Bot'; } catch (_) {}

const raiz = path.dirname(process.execPath);
const comando = (process.argv.slice(2).find(a => !a.startsWith('-')) || '').toLowerCase();
const script = comando === 'verificar' ? 'verificar.js' : 'bot.js';
const alvo = path.join(raiz, 'bot', script);

if (!fs.existsSync(alvo)) {
  console.error(`\nNão achei ${path.join('bot', script)} ao lado do KahootBot.exe.`);
  console.error('Extraia o zip INTEIRO e rode o KahootBot.exe de dentro da pasta (não copie só o .exe).\n');
  console.log('Aperte Enter para fechar.');
  process.stdin.resume(); process.stdin.once('data', () => process.exit(1));
} else {
  process.chdir(raiz);
  createRequire(alvo)(alvo);
}
