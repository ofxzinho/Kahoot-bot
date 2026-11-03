// testes/paginas-mock.js — telas que IMITAM o player do Kahoot (kahoot.it) para os testes simulados.
// Inclui: lobby, "prepare-se", pergunta sem alternativas, entrada animada das alternativas, tela de
// "respondido", tela de correto/incorreto (fundo verde/vermelho), gráfico com barras nas cores do Kahoot etc.
'use strict';

const Q = {
  capital: { texto: 'Qual é a capital da Austrália?', alts: [['vermelho', 'Sydney'], ['azul', 'Canberra'], ['amarelo', 'Melbourne'], ['verde', 'Perth']], correta: 'azul' },
  http404: { texto: 'Qual código de status HTTP indica que o recurso não foi encontrado?', alts: [['vermelho', '200'], ['azul', '301'], ['amarelo', '404'], ['verde', '500']], correta: 'amarelo' },
  tres: { texto: 'Qual destes é um banco de dados relacional?', alts: [['vermelho', 'MongoDB'], ['azul', 'PostgreSQL'], ['amarelo', 'Redis']], correta: 'azul' },
  vf: { texto: 'O método HTTP GET deve ser usado para criar recursos no servidor.', alts: [['azul', 'Verdadeiro'], ['vermelho', 'Falso']], correta: 'vermelho' },
  vf2: { texto: 'Em Java, objetos da classe String são imutáveis.', alts: [['azul', 'Verdadeiro'], ['vermelho', 'Falso']], correta: 'azul' },
  grafico: { texto: 'No gráfico, qual linguagem teve mais votos?', alts: [['vermelho', 'Java'], ['azul', 'Python'], ['amarelo', 'C#'], ['verde', 'Go']], correta: 'azul', imagem: 'grafico' },
  foto: { texto: 'O que aparece na imagem?', alts: [['vermelho', 'Um semáforo'], ['azul', 'Uma placa de PARE'], ['amarelo', 'Uma bandeira'], ['verde', 'Um gramado']], correta: 'amarelo', imagem: 'foto' },
  tabela: { texto: 'Pela tabela, qual endpoint tem a maior latência média?', alts: [['vermelho', '/login'], ['azul', '/produtos'], ['amarelo', '/carrinho'], ['verde', '/pagamento']], correta: 'verde', imagem: 'tabela' },
  codigo: { texto: 'O que este código JavaScript imprime?', alts: [['vermelho', 'null'], ['azul', 'undefined'], ['amarelo', 'string'], ['verde', 'object']], correta: 'verde', imagem: 'codigo' },
  patch: { texto: 'Qual método HTTP é usado para atualizar PARCIALMENTE um recurso?', alts: [['vermelho', 'GET'], ['azul', 'POST'], ['amarelo', 'PATCH'], ['verde', 'DELETE']], correta: 'amarelo' },
  having: { texto: 'Qual cláusula SQL filtra os grupos depois do GROUP BY?', alts: [['vermelho', 'WHERE'], ['azul', 'HAVING'], ['amarelo', 'ORDER BY'], ['verde', 'LIMIT']], correta: 'azul' },
  git: { texto: 'Qual comando Git cria um novo branch e já muda para ele?', alts: [['vermelho', 'git branch -d'], ['azul', 'git merge'], ['amarelo', 'git push -u'], ['verde', 'git checkout -b']], correta: 'verde' },
  docker: { texto: 'Qual arquivo descreve, passo a passo, como construir uma imagem Docker?', alts: [['vermelho', 'Dockerfile'], ['azul', 'package.json'], ['amarelo', '.dockerignore'], ['verde', 'README.md']], correta: 'vermelho' },
  naoHttp: { texto: 'Qual destes NÃO é um método HTTP?', alts: [['vermelho', 'GET'], ['azul', 'PUT'], ['amarelo', 'FETCH'], ['verde', 'OPTIONS']], correta: 'amarelo' },
  busca: { texto: 'Qual é a complexidade da busca binária em um vetor ordenado?', alts: [['vermelho', 'O(log n)'], ['azul', 'O(n)'], ['amarelo', 'O(n log n)'], ['verde', 'O(1)']], correta: 'vermelho' },
  porcento: { texto: 'Quanto é 15% de 200?', alts: [['vermelho', '20'], ['azul', '25'], ['amarelo', '35'], ['verde', '30']], correta: 'verde' },
  monalisa: { texto: 'Quem pintou a Mona Lisa?', alts: [['vermelho', 'Michelangelo'], ['azul', 'Leonardo da Vinci'], ['amarelo', 'Rafael'], ['verde', 'Van Gogh']], correta: 'azul' },
  independencia: { texto: 'Em que ano o Brasil declarou independência de Portugal?', alts: [['vermelho', '1822'], ['azul', '1889'], ['amarelo', '1500'], ['verde', '1808']], correta: 'vermelho' },
  longo: {
    texto: 'Em uma API REST construída com Spring Boot, um desenvolvedor precisa garantir que uma operação de transferência entre duas contas seja atômica, ou seja, que o débito e o crédito sejam ambos confirmados ou ambos desfeitos em caso de exceção. Qual anotação ele deve usar no método de serviço?',
    alts: [['vermelho', '@RestController, porque ela gerencia automaticamente a transação de cada requisição HTTP'], ['azul', '@Transactional, que abre uma transação e faz rollback em exceções não verificadas'], ['amarelo', '@Autowired, porque a injeção de dependência garante a atomicidade das operações'], ['verde', '@Entity, já que entidades JPA são sempre persistidas de forma atômica']],
    correta: 'azul',
  },
};

const CENARIOS = {
  quatro: [Q.capital], tres: [Q.tres], vf: [Q.vf], grafico: [Q.grafico], foto: [Q.foto], tabela: [Q.tabela], longo: [Q.longo],
  sequencia: [Q.http404, Q.vf, Q.capital],
  gradiente: [Object.assign({}, Q.http404, { layout: 'gradiente' })],
  divs: [Object.assign({}, Q.patch, { layout: 'divs' })],
  formas: [Object.assign({}, Q.capital, { formas: true })],
  codigos: [
    { texto: 'Resolva este código:', html: '<pre style="background:#f2f2f2;padding:12px;font-size:18px">pilha = [5, 10, 15, 20]\npilha.pop()\npilha.pop()\nprint(pilha)</pre>', alts: [['vermelho', '[10, 20]'], ['azul', '[5, 10]'], ['amarelo', '[15, 20]'], ['verde', '[5, 15]']], correta: 'azul' },
    { texto: 'Resolva este código:', html: '<pre style="background:#f2f2f2;padding:12px;font-size:18px">fila = [5, 10, 15, 20]\nfila.pop(0)\nprint(fila)</pre>', alts: [['vermelho', '[5, 10, 15]'], ['azul', '[10, 15, 20]'], ['amarelo', '[5, 10]'], ['verde', '[20]']], correta: 'azul' },
  ],
  puzzle: [{ texto: 'Coloque o código na ordem correta da melhor forma, considerando um exercício de Ordem Binária.',
    puzzle: ['vetor = [5, 10, 15, 20, 25, 30, 35]', 'inicio = 0 fim = 6 meio = (inicio + fim) // 2', 'if vetor[meio] < 25: inicio = meio + 1', 'print(inicio)'],
    embaralhado: [1, 0, 2, 3], correta: 'ordem', alts: [] }],
  regua: [{ texto: 'Em que ano o Brasil declarou independência de Portugal?', regua: { min: 1500, max: 2000, step: 1, inicio: 1750 }, correta: 1822, alts: [] }],
};
// cada pergunta do banco vira um cenário "q-<nome>" (usado para gerar as amostras do teste com Gemini real)
for (const [k, v] of Object.entries(Q)) CENARIOS['q-' + k] = [v];

function paginaKahoot(nome, params) {
  const perguntas = CENARIOS[nome] || CENARIOS.quatro;
  const dados = JSON.stringify({ perguntas, params });
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Kahoot! (simulado)</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;height:100%;font-family:Montserrat,"Segoe UI",Arial,sans-serif}
  body{background:#f2f2f2;overflow:hidden}
  .tela{position:fixed;inset:0;display:flex;flex-direction:column}
  .roxo{background:#46178F;color:#fff;align-items:center;justify-content:center;font-size:32px;font-weight:700}
  .certo{background:#66BF39;color:#fff;align-items:center;justify-content:center;font-size:40px;font-weight:800}
  .errado{background:#F35;color:#fff;align-items:center;justify-content:center;font-size:40px;font-weight:800}
  .topo{display:flex;justify-content:space-between;padding:10px 16px;font-weight:700;color:#333;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.1)}
  .pergunta{margin:14px auto;max-width:94%;background:#fff;border-radius:6px;padding:14px 20px;font-size:clamp(16px,2.2vw,32px);font-weight:700;text-align:center;color:#333;box-shadow:0 2px 4px rgba(0,0,0,.15)}
  .meio{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;gap:20px;padding:0 20px}
  .timer{width:70px;height:70px;border-radius:50%;background:#864CBF;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;flex:none}
  .grade{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px;height:36vh}
  .resp{border:0;border-radius:4px;color:#fff;font-family:inherit;font-weight:700;font-size:clamp(14px,1.8vw,26px);line-height:1.2;display:flex;align-items:center;gap:14px;padding:0 18px;cursor:pointer;text-align:left;
        box-shadow:inset 0 -4px rgba(0,0,0,.15);animation:entra .35s ease-out both}
  .resp svg{width:44px;height:44px;flex:none}
  @keyframes entra{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
  .vermelho{background-color:#E21B3C}.azul{background-color:#1368CE}.amarelo{background-color:#D89E00}.verde{background-color:#26890C}
  .divs .resp{cursor:default}
  .gradiente .resp{background-color:transparent!important}
  .gradiente .vermelho{background-image:linear-gradient(#E21B3C,#E21B3C)} .gradiente .azul{background-image:linear-gradient(#1368CE,#1368CE)}
  .gradiente .amarelo{background-image:linear-gradient(#D89E00,#D89E00)} .gradiente .verde{background-image:linear-gradient(#26890C,#26890C)}
  .barras{display:flex;align-items:flex-end;gap:18px;height:30vh;padding:10px 20px;background:#fff;border-radius:6px}
  .barra{width:70px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;font-weight:700;color:#333;font-size:14px}
  .barra div{width:100%}
  table{border-collapse:collapse;background:#fff;font-size:18px} td,th{border:1px solid #999;padding:6px 14px}
  .deco{display:flex;gap:10px;margin-top:20px} .deco span{width:28px;height:28px;border-radius:4px;display:block}
  @media (max-width:700px){ .grade{grid-template-columns:1fr;height:auto} .resp{min-height:12vh} .meio{display:none} }
</style></head><body>
<a href="#app" style="position:absolute;left:-9999px;top:0">Ir para o conteúdo principal</a>
<div id="app"></div>
<script>
const DADOS = ${dados};
const FORMAS = {
  vermelho:'<svg viewBox="0 0 32 32"><path fill="#fff" d="M16 4 L29 27 L3 27 Z"/></svg>',
  azul:'<svg viewBox="0 0 32 32"><path fill="#fff" d="M16 2 L30 16 L16 30 L2 16 Z"/></svg>',
  amarelo:'<svg viewBox="0 0 32 32"><circle fill="#fff" cx="16" cy="16" r="13"/></svg>',
  verde:'<svg viewBox="0 0 32 32"><rect fill="#fff" x="4" y="4" width="24" height="24"/></svg>'};
const app = document.getElementById('app');
const espera = ms => new Promise(r => setTimeout(r, ms));
const relatar = ev => fetch('/__relatorio', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(ev)}).catch(()=>{});
function tela(cls, html){ app.innerHTML = '<div class="tela '+cls+'">'+html+'</div>'; }
function imagemHtml(tipo, q){
  if (q && q.html) return '<div style="background:#fff;border-radius:6px">' + q.html + '</div>';
  if (tipo === 'grafico') {
    const b = [['Java',55,'#E21B3C'],['Python',92,'#1368CE'],['C#',38,'#D89E00'],['Go',24,'#26890C']];
    return '<div class="barras">' + b.map(([n,v,c]) => '<div class="barra"><span>'+v+'</span><div style="height:'+(v*2.4)+'px;background-color:'+c+'"></div>'+n+'</div>').join('') + '</div>';
  }
  if (tipo === 'foto') return '<svg width="420" height="260" viewBox="0 0 420 260"><rect width="420" height="260" fill="#8fd3ff"/><rect y="180" width="420" height="80" fill="#26890C"/><rect x="60" y="40" width="8" height="160" fill="#555"/><rect x="68" y="40" width="200" height="40" fill="#E21B3C"/><rect x="68" y="80" width="200" height="40" fill="#fff"/><rect x="68" y="120" width="200" height="40" fill="#1368CE"/></svg>';
  if (tipo === 'codigo') return '<canvas id="cod" width="520" height="150" style="background:#1e1e1e;border-radius:6px"></canvas>';
  if (tipo === 'tabela') return '<table><tr><th>Endpoint</th><th>Latência média</th></tr><tr><td>/login</td><td>120 ms</td></tr><tr><td>/produtos</td><td>85 ms</td></tr><tr><td>/carrinho</td><td>140 ms</td></tr><tr><td>/pagamento</td><td>310 ms</td></tr></table>';
  return '';
}
async function rodar(){
  const P = DADOS.perguntas;
  tela('roxo', '<div>Você está dentro!</div><div style="font-size:18px;font-weight:400;margin-top:8px">Veja seu apelido na tela</div><div class="deco"><span style="background:#E21B3C"></span><span style="background:#1368CE"></span><span style="background:#D89E00"></span><span style="background:#26890C"></span></div>');
  await espera(+(DADOS.params.lobby || 900));
  const semTransicao = DADOS.params.transicao === '0';   // troca de pergunta sem as caixas sumirem
  for (let i = 0; i < P.length; i++) {
    const q = P[i];
    if (!(semTransicao && i > 0)) {
      tela('roxo', '<div>Pergunta '+(i+1)+'</div><div style="font-size:18px;margin-top:8px">Prepare-se!</div>');
      await espera(600);
    }
    const topo = '<div class="topo"><span>'+(i+1)+' de '+P.length+'</span><span>Kahoot simulado</span><span>Pontos: '+(i*870)+'</span></div>';
    const pergHtml = q.formas ? '' : '<div class="pergunta">'+q.texto+'</div>';
    if (semTransicao && i > 0) await espera(1500);   // mostra o resultado em cima das caixas antigas
    tela('', topo + pergHtml + '<div class="meio"><div class="timer">20</div>'+imagemHtml(q.imagem, q)+'</div>');
    const cod = document.getElementById('cod');
    if (cod) { const g = cod.getContext('2d'); g.font = '22px Consolas, monospace'; g.fillStyle = '#9cdcfe';
      g.fillText('let x = null;', 20, 45); g.fillStyle = '#dcdcaa'; g.fillText('console.log(typeof x);', 20, 90); }
    if (!(semTransicao && i > 0)) await espera(500);
    if (q.puzzle) {
      const cores = ['vermelho','azul','amarelo','verde'];
      const box = document.createElement('div'); box.style.cssText = 'width:60%;margin:0 auto;display:flex;flex-direction:column;gap:6px';
      box.innerHTML = '<div style="text-align:center;background:#fff;padding:4px">Arraste os blocos para os organizar na ordem certa.</div><div id="lista" style="display:flex;flex-direction:column;gap:6px"></div><button id="env" style="font-size:22px;padding:10px 30px;align-self:center">Enviar</button>';
      document.querySelector('.tela').appendChild(box);
      const lista = box.querySelector('#lista');
      q.embaralhado.forEach((k, i) => { const d = document.createElement('div'); d.className = 'resp ' + cores[i]; d.tabIndex = 0; d.style.cssText = 'height:48px;cursor:grab;animation:none;justify-content:space-between';
        d.innerHTML = '<span>' + q.puzzle[k] + '</span><span style="font-size:22px">=</span>'; lista.appendChild(d); });
      let arr = null;
      lista.addEventListener('mousedown', e => { arr = e.target.closest('.resp'); });
      document.addEventListener('mouseup', e => { if (!arr) return; const outros = [...lista.children].filter(x => x !== arr);
        const antes = outros.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        lista.insertBefore(arr, antes || null); arr = null; });
      const t0 = performance.now();
      relatar({ tipo:'mostrou', idx:i, correta:'ordem', corretaOrdem:q.puzzle });
      const res = await new Promise(res => { const lim = setTimeout(() => res(null), 15000); box.querySelector('#env').addEventListener('click', e => { clearTimeout(lim);
        const ordem = [...lista.children].map(x => x.firstChild.textContent); res({ ordem, ms: Math.round(performance.now()-t0), trusted: e.isTrusted }); }); });
      relatar({ tipo:'saiu', idx:i });
      if (res) relatar({ tipo:'clicou', idx:i, cor:'ordem', correta:'ordem', acertou: res.ordem.join('|') === q.puzzle.join('|'), ms: res.ms, trusted: res.trusted }); else relatar({ tipo:'tempo', idx:i });
      tela('roxo', '<div>Fim</div>'); await espera(800);
      continue;
    }
    if (q.regua) {
      const R = q.regua; let v = R.inicio;
      const box = document.createElement('div'); box.style.cssText = 'padding:30px;text-align:center';
      box.innerHTML = '<div id="val" style="font-size:40px;font-weight:800">'+v+'</div><div id="sl" role="slider" tabindex="0" aria-valuemin="'+R.min+'" aria-valuemax="'+R.max+'" aria-valuenow="'+v+'" style="height:24px;background:#ddd;border-radius:12px;margin:20px auto;width:80%"></div><button id="env" style="font-size:22px;padding:10px 30px">Enviar</button>';
      document.querySelector('.tela').appendChild(box);
      const sl = box.querySelector('#sl');
      sl.addEventListener('keydown', e => { if (e.key==='ArrowRight') v=Math.min(R.max,v+R.step); else if (e.key==='ArrowLeft') v=Math.max(R.min,v-R.step); else return;
        sl.setAttribute('aria-valuenow', v); box.querySelector('#val').textContent = v; });
      const t0 = performance.now();
      relatar({ tipo:'mostrou', idx:i, correta:'regua', corretaNumero:q.correta });
      const res = await new Promise(res => { const lim = setTimeout(() => res(null), 12000); box.querySelector('#env').addEventListener('click', e => { clearTimeout(lim); res({ v, ms: Math.round(performance.now()-t0), trusted: e.isTrusted }); }); });
      relatar({ tipo:'saiu', idx:i });
      if (res) relatar({ tipo:'clicou', idx:i, cor:'regua', valor:res.v, correta:'regua', acertou: res.v === q.correta, ms: res.ms, trusted: res.trusted }); else relatar({ tipo:'tempo', idx:i });
      tela('roxo', '<div>Fim da pergunta</div>'); await espera(800);
      continue;
    }
    const grade = document.createElement('div');
    grade.className = 'grade' + (q.layout ? ' ' + q.layout : '');
    if (q.alts.length === 2) grade.style.height = '42vh';
    for (const [cor, txt] of q.alts) {
      const b = document.createElement(q.layout ? 'div' : 'button');
      if (q.layout === 'gradiente') b.setAttribute('role','button');
      b.className = 'resp ' + cor; b.dataset.cor = cor;
      b.innerHTML = FORMAS[cor] + (q.formas ? '' : '<span>'+txt+'</span>');
      grade.appendChild(b);
    }
    document.querySelector('.tela').appendChild(grade);
    const t0 = performance.now();
    relatar({ tipo:'mostrou', idx:i, correta:q.correta, corretaTexto:q.alts.find(a=>a[0]===q.correta)[1], cores:q.alts.map(a=>a[0]) });
    const clique = await new Promise(res => {
      const lim = setTimeout(() => res(null), +(DADOS.params.limite || 12000));
      grade.addEventListener('click', e => {
        const b = e.target.closest('.resp'); if (!b) return;
        clearTimeout(lim); res({ cor: b.dataset.cor, ms: Math.round(performance.now() - t0), trusted: e.isTrusted });
      });
    });
    relatar({ tipo:'saiu', idx:i });
    if (clique) relatar({ tipo:'clicou', idx:i, cor:clique.cor, correta:q.correta, acertou: clique.cor === q.correta, ms: clique.ms, trusted: clique.trusted });
    else relatar({ tipo:'tempo', idx:i });
    if (semTransicao) continue;
    tela('roxo', '<div>'+(clique ? 'Respondido!' : 'Tempo esgotado')+'</div><div style="font-size:18px;margin-top:8px">Aguardando os outros jogadores…</div>');
    await espera(500);
    const ok = clique && clique.cor === q.correta;
    tela(ok ? 'certo' : 'errado', '<div>'+(ok ? 'Correto' : 'Incorreto')+'</div>');
    await espera(900);
  }
  tela('roxo', '<div>Fim de jogo</div>');
  relatar({ tipo:'fim' });
}
rodar();
</script></body></html>`;
}

module.exports = { paginaKahoot, CENARIOS, Q };
