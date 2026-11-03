# Kahoot Bot v3.17 — modo VS Code

> **⚡ Para ficar rápido (recomendado): use a Groq, grátis**
> 1. Crie uma conta em **https://console.groq.com/keys** e clique em **Create API Key** (grátis, sem cartão).
> 2. Ao apertar Ctrl+Shift+B, o bot pede **primeiro a chave da Groq** e depois a do Gemini (Enter pula qualquer uma). Ou salve as chaves em `chave-groq.txt` e `chave-gemini.txt` na pasta do projeto.
> 3. Pronto: perguntas só com texto vão pela Groq (`openai/gpt-oss-120b`), em ~0,6 s nos testes simulados. Perguntas com imagem ou gráfico vão pelo Gemini (`gemini-3.6-flash`), porque o modelo da Groq não enxerga imagem.
> 4. **Pergunta com imagem (v3.8):** Gemini e Groq são chamados juntos. Se o Gemini não responder em `prazoMs` (2,5 s), vale a resposta da Groq, que só viu o texto. Só fotos, gráficos e vídeos da pergunta contam como imagem; o fundo e os enfeites do Kahoot não.
> 5. **v3.9:** a Groq usa raciocínio `medium` (acerta mais; troque para `low` no `config.json` se quiser ainda mais velocidade). Na régua usa `high`, e a IA é avisada de que os números da escala não são a resposta. Funciona também no modo solo (create.kahoot.it).
> 6. **v3.10:** a IA é instruída a responder como o professor espera (regra geral de aula, sem caçar exceções), e o veredito ✓/✗ no terminal não mistura mais uma pergunta com a seguinte.
> 7. **v3.11:** o bot lê só o texto visível (ignora textos escondidos de acessibilidade, como "Ir para o conteúdo principal"). Pergunta nova = mudou o que está acima das alternativas (enunciado, código ou imagem), então perguntas com o mesmo enunciado e códigos diferentes funcionam. Antes de responder, espera a tela ficar parada por 3 leituras seguidas, para não misturar alternativas de duas perguntas.
> 8. **v3.12:**
>    - **Imagem pequena** (código em imagem, por exemplo) agora conta como imagem.
>    - **Pergunta com imagem:** o bot espera o Gemini, que enxerga a imagem, por até `prazoImagemMs` (4 s). A Groq, que só lê o texto, vira reserva.
>    - **Tela de correto/incorreto** não é mais respondida de novo.
>    - **Novo tipo, "arraste para a ordem certa" (puzzle):** a IA devolve a ordem, o bot arrasta os blocos com o mouse (ou pelo teclado, se o mouse não funcionar), confere e clica em Enviar.
> 9. **v3.13:**
>    - **OCR:** se o Chrome do PC tiver OCR (TextDetector; o terminal avisa "OCR do Chrome: disponível"), o código das imagens é lido e resolvido pela Groq, que é rápida e raciocina bem.
>    - **Cota do Gemini:** o bot não gasta mais pedidos do Gemini só para testá-lo ao abrir.
>    - **Veredito:** só aparece no terminal quando o Kahoot mostra Correto/Incorreto.
> 10. **v3.14, pergunta com imagem (ex.: código):**
>     - Um modelo que enxerga só **transcreve** o texto/código da imagem: Gemini 3.1-lite → 3.5-lite → 3.6, ou o modelo de visão da Groq, se estiver liberado na sua conta.
>     - A **Groq resolve** com o código em texto, com raciocínio `medium`.
>     - Se a transcrição não sair em `prazoTranscricaoMs` (3,2 s), vale o caminho anterior.
> 11. **v3.15:**
>     - Recorta só a imagem da pergunta para a transcrição.
>     - Chama os 2 Gemini-lite **ao mesmo tempo** e usa a primeira transcrição que chegar.
>     - Se não sair em 3,3 s, a Groq responde na hora. Tempo máximo esperado nas perguntas com imagem: ~4 s.
> 12. **v3.16, múltipla seleção** ("Marcar todas as respostas plausíveis", "São duas respostas"): a IA devolve todas as corretas, respeitando a quantidade quando o enunciado diz; o bot marca cada uma e clica em Enviar.
> 13. **v3.17, OCR LOCAL:** o texto/código das imagens é lido no próprio PC (Tesseract em WebAssembly, incluído em `bot/ocr`, sem instalar nada, sem internet, ~50–250 ms). A Groq resolve com o código em texto. O Gemini só é usado se o OCR não conseguir ler (ex.: foto).
> 14. Limite do plano grátis da Groq (out/2026): 30 pedidos por minuto e 1.000 por dia. Sobra para um Kahoot.

> **Novidades da v3.3**
> - **Escolha pelo texto:** a IA recebe as alternativas numeradas (1, 2, 3, 4) e escolhe pelo texto; o bot clica na que tem aquele texto. A cor serve só para achar as caixas, e o bot pega todas do grupo, mesmo se uma cor não for reconhecida ou entrar atrasada.
> - **Régua (slider):** a IA responde o número (ex.: o ano) e o bot move a régua pelo teclado e clica em Enviar.
> - **Gráfico/imagem:** quando a pergunta tem imagem ou gráfico, o print vai junto e a IA analisa.
> - **Uma chamada por pergunta (v3.4):** se ela demorar mais que `reforcoMs` (2,5 s) ou falhar, o bot chama o próximo modelo **em paralelo** e fica com a primeira resposta. Cada chamada pode esperar até `timeoutMs` (15 s). Só gasta mais requisições quando o Google está lento.
> - **v3.5:** pergunta nova só quando o TEXTO DA PERGUNTA muda (a tela de resultado não é mais respondida de novo); o clique confere que o ponto cai dentro da alternativa escolhida; o terminal mostra as alternativas numeradas, qual foi clicada e o veredito do próprio Kahoot (✓ CORRETO / ✗ INCORRETO).
> - **Não testado no Kahoot real:** a régua (testada só numa tela simulada).

Abre um Chrome controlado no Kahoot, lê a pergunta e as alternativas direto da página, manda o print + o texto para o Google Gemini e **clica sozinho** na resposta. Roda dentro do VS Code, **sem admin**. Se o PC não tiver Node.js, o bot baixa o Node portátil oficial sozinho na primeira vez.

> ⚠️ Para jogos de brincadeira/estudo. Em atividade que vale nota é trapaça, e o uso viola os termos do Kahoot.

---

## Como usar

### Na faculdade (≈ 1 minuto)
1. **VS Code → Arquivo → Abrir Pasta…** → pasta do projeto. Se perguntar, clique em **"Sim, confio nos autores"**.
2. Aperte **Ctrl+Shift+B**. Se o VS Code perguntar sobre **tarefas automáticas**, clique em **Permitir**: aí o bot passa a iniciar sozinho sempre que você abrir a pasta.
   - Se o PC não tiver Node.js, a primeira vez baixa o Node portátil oficial (~30 MB, sem admin) para a pasta `node\`. Leva alguns segundos.
3. **Chave do Gemini:** o jeito mais simples é deixar um arquivo `chave-gemini.txt` na pasta do projeto, com só a chave dentro. Sem ele, o bot pede a chave no terminal: cole com Ctrl+V e aperte Enter.
4. Abre uma **janela do Chrome no kahoot.it**. Digite o PIN e jogue **nessa janela**. O aviso no canto inferior esquerdo mostra o status, a resposta e o tempo.
5. Para sair, feche essa janela do Chrome (o bot encerra junto) ou aperte Ctrl+C no terminal. O perfil temporário do Chrome é apagado ao sair.

**Atalhos:** `Alt+Shift+K` na página pausa/retoma o bot.
**Se parar de responder:** rode `$env:KB_DEBUG=1; node bot/bot.js` no terminal. Ele mostra cada passo da detecção; me mande essas linhas.
**Antes da aula:** *Terminal → Executar Tarefa… → 🩺 Verificar este computador* (≈ 10 s). Confere o Node, se o Chrome aceita controle remoto, a internet e **quais modelos do Gemini estão respondendo agora** (com o tempo de cada um).

> **Por que outra janela do Chrome?** Desde o Chrome 136 o Google bloqueia o controle remoto no seu perfil normal. Então o bot abre um perfil separado e temporário. Kahoot aberto no seu Chrome normal **não** é visto pelo bot.

### Antes (em casa, uma vez)
1. Crie uma chave grátis em **https://aistudio.google.com/apikey**.
2. Deixe o projeto acessível na faculdade: GitHub (baixar o ZIP), pen drive ou OneDrive. **Nunca suba a chave**: o `.gitignore` já ignora `chave-gemini.txt`.
3. (Recomendado) Rode *🧪 Testar com o Gemini real* para medir acerto e tempo com a sua chave e a sua rede.

---

## Requisitos e dependências

| Item | Precisa? | Observação |
|---|---|---|
| Windows + VS Code | sim | O VS Code já está no PC; não precisa de admin |
| Node.js 18+ | já instalado **ou** baixado automaticamente | Sem Node no PC, a tarefa baixa o zip oficial de nodejs.org para `node\` (sem admin) |
| Google Chrome ou Microsoft Edge | sim | O Edge vem com o Windows; o bot usa o Edge se não achar o Chrome |
| Internet até `generativelanguage.googleapis.com` | sim | |
| Chave do Gemini | sim | Grátis no AI Studio |
| Pacotes npm / Python / Tesseract | **nenhum** | Só módulos nativos do Node; nada de `npm install` |

### Node.js: como o bot roda
- **Ctrl+Shift+B** abre o PowerShell e usa o `node` instalado. Se não houver, usa `node\node.exe`. Se também não houver, baixa o Node portátil oficial (zip de nodejs.org) para a pasta `node\`. Nada disso pede admin.
- **Por que não o Node embutido no VS Code:** a v3 tentava usar o `Code.exe` do VS Code como Node (`ELECTRON_RUN_AS_NODE`). No seu Windows a tarefa ficou parada sem mostrar nada, então essa ideia saiu.
- **Sem internet pra baixar o Node no PC da faculdade:** em casa, baixe `node-v24.x.x-win-x64.zip` em nodejs.org e copie só o `node.exe` para `node\node.exe` dentro do projeto (no pen drive, por exemplo).
- **O que ainda não foi testado num Windows de verdade:** o PowerShell da tarefa e o download automático do Node. O bot em si (`node bot/bot.js`) já rodou no seu PC.

---

## Configuração da API e opções (`config.json`)

| Chave | Padrão | Para quê |
|---|---|---|
| `modelos` | 3.8-flash, 3.6-flash, 3.1-flash-lite, 3.5-flash-lite | Lista em **ordem de preferência**, cada um com seu `nivel` de raciocínio (`""` = padrão do modelo, sem enviar o parâmetro) |
| `usarCorrida` | `true` | Chama 2 modelos juntos (o preferido + o mais rápido). `false` = um modelo só, metade das chamadas |
| `prazoMs` | `3000` | Até quando esperar o modelo preferido, contando de quando as alternativas aparecem |
| `timeoutMs` | `10000` | Desiste de uma chamada depois disso |
| `larguraImagem` / `qualidadeImagem` | `1280` / `80` | Tamanho do print enviado |
| `cliqueAutomatico` | `true` | `false` = só mostra a resposta, e você clica |
| `navegador` | `auto` | Ou o caminho do `chrome.exe`/`msedge.exe` |

**Onde fica a chave**, em ordem: variável `GEMINI_API_KEY` → arquivo `chave-gemini.txt` → o bot pergunta no terminal.

**Modelos:** são ids estáveis da [lista oficial](https://ai.google.dev/gemini-api/docs/models) (nov/2026), todos com plano grátis. Os limites por minuto/dia aparecem no AI Studio. **No plano grátis, o Google pode usar os dados enviados para melhorar os produtos dele.**

**Escolha automática (o que mudou na v3.1):** em 03/11, no seu PC, o 3.8 e o 3.6 deram **503 ("high demand")**, o 3.5-lite não respondeu e só o 3.1-lite funcionou. Por isso o bot não aposta mais em modelos fixos:
1. **Ao abrir:** testa todos os modelos da lista em paralelo, sem atrasar a detecção, e mostra no terminal quem respondeu e em quanto tempo.
2. **Em cada pergunta:**
   - O **preferido** é o primeiro da lista que responde dentro do prazo. Um modelo que está respondendo, mas lento (ex.: 3.6 com 11 s em 03/11), perde a vez para um rápido.
   - A **reserva rápida** é o mais rápido entre os outros.
   - Os dois são chamados juntos. Vale o preferido se chegar até o `prazoMs`; senão, o primeiro que chegar.
3. **Se os dois falharem:** tenta mais um modelo da lista na mesma pergunta.
4. **Modelo com 503, timeout ou erro de rede:** fica 1 minuto de fora. Depois é testado de novo sozinho, e o terminal avisa quando ele "voltou". O bot **nunca fica sem modelo**: se todos falharam há pouco, tenta mesmo assim.

**Só texto quando dá (v3.2):** se a pergunta não tem imagem, gráfico, código desenhado ou vídeo e o texto está todo na página, o bot manda **só o texto**, que a IA responde mais rápido. O print só vai quando faz diferença.

**Pergunta nova (v3.2):** além de esperar a tela "limpar" entre perguntas, o bot reconhece pergunta nova quando o texto das alternativas ou da pergunta muda. Em 03/11 ele respondeu a 1ª e não percebeu a 2ª; isso foi corrigido.

---

## Arquitetura: antiga × nova

| | v1 (Python original) | v3 (este projeto) |
|---|---|---|
| Execução | Python + pip (opencv, tesseract, pyautogui, google-generativeai) + Tesseract instalado | VS Code → Ctrl+Shift+B. Usa o Node do PC (ou baixa o portátil). Zero pacotes |
| Leitura da pergunta | OCR do Tesseract (erra letras e acentos) | **Texto exato do DOM** + print para o Gemini ler imagens, gráficos, tabelas e código |
| Achar as alternativas | Coordenadas fixas configuradas à mão | Automático pela cor real das caixas na página (2, 3 ou 4; qualquer resolução/zoom). Reserva: detecção pelo print |
| Resposta da IA | Texto livre comparado por "contém" com o OCR | JSON com **enum das cores visíveis**: a resposta nunca sai das opções |
| Verdadeiro/Falso | Clicava fixo em amarelo/verde (cores que nem existem no V/F) | Lê qual cor é "Verdadeiro" e qual é "Falso" |
| Clique | `pyautogui` move o seu mouse para coordenadas fixas | Clique "real" do navegador via DevTools (`isTrusted`), sem mexer no mouse |
| Modelo | `gemini-1.5-flash` (desligado em set/2025) | Lista de 4 modelos atuais, com teste de saúde, corrida com prazo e troca automática em 503/timeout |
| Falhas | Uma exceção parava tudo | Timeout, fallback de modelo, mensagens claras; o bot segue para a próxima pergunta |
| Bugs | Usava `cv`, mas importava `cv2` (nem rodava); pausas fixas de 8–10 s | — |

**Como funciona:**
- **`bot/bot.js`** roda no Node. Ele abre o Chrome com um perfil temporário e se conecta pelo **Chrome DevTools Protocol** (cliente WebSocket próprio, sem pacotes).
- **Agente na página:** o bot injeta `nucleo/agente.js` num *mundo isolado* da página, então o site não enxerga o código.
- **Detecção:** o agente percebe as alternativas por `MutationObserver` + varredura a cada 150 ms. Depois espera a animação de entrada estabilizar (~120–700 ms).
- **Resposta:** o agente pede o print (via DevTools, sem recorte, reduzido a 1280 px na própria página) e a resposta da IA. O clique é feito com `Input.dispatchMouseEvent`.
- **Aquecimento:** ao abrir, o bot faz uma chamada mínima a cada modelo. Isso valida a chave, mede quem está respondendo e deixa a conexão aberta, então a 1ª pergunta não paga o custo de conectar.

---

## Resultados dos testes

**No seu Windows (03/11):**
- O bot abriu o Chrome no kahoot.it, detectou a pergunta e chamou o Gemini.
- O Gemini falhou: 503 no 3.8 e no 3.6, timeout no 3.5-lite. Só o 3.1-lite respondeu (~4 s).
- Com a v3.1, respondeu a 1ª pergunta em 5,2 s (usou o 3.6, lento naquela hora) e não percebeu a 2ª.
- Esses dois problemas motivaram a v3.2, que ainda **não foi rodada** no seu PC.

**Aqui (Linux, Chromium headless):** nenhum resultado abaixo usa o Gemini real nem o Kahoot real, porque a rede deste ambiente bloqueia os dois.

| Teste | O que é real | O que é simulado | Resultado |
|---|---|---|---|
| Unitários — `testes/unitarios.test.js` | código do núcleo, incluindo a escolha de modelos | servidor HTTP local no lugar da API | **29/29** |
| Ponta a ponta — `testes/simulados.js` | bot, Chrome, detecção, print, clique, timeouts | telas do Kahoot e a API do Gemini (que sempre sabe a resposta) | **35/35** |
| Verificador — `bot/verificar.js` | Chrome, DevTools, saída do processo | API do Gemini (503, travado, ok) | ✅ identificou certo os modelos com problema e o que funciona |
| Gemini real — `bot/testar-gemini.js` | tudo | nada | **não executado aqui**: rode *🧪 Testar com o Gemini real* |

**O que os testes simulados mostram:**
- **Detecção:** 4, 3 e 2 alternativas (V/F), gráfico com barras nas cores do Kahoot, foto colorida, tabela, texto longo, 3 perguntas seguidas com transições e **3 perguntas seguidas sem a tela "limpar"** (o caso de 03/11). Também caixas que só aparecem no print, caixas que não parecem clicáveis e tela só com formas. Em todos os casos o bot clicou na cor certa, com clique "real" (`isTrusted`).
- **Resoluções:** 1366×768, 1280×720 com zoom de 150%, 2560×1440, janela estreita e zoom de 125%. O print sempre saiu com no máximo 1280 px de largura.
- **Tempo (do aparecimento das alternativas até o clique):**

  | Situação | Tempo |
  |---|---|
  | Custo do próprio bot (IA instantânea) | **~0,47 s** (inclui ~350 ms de animação da tela) |
  | IA simulada de 0,8 s, pergunta só com texto (sem print) | ~1,24 s |
  | IA simulada de 0,8 s, pergunta com imagem (com print) | ~1,32 s |
  | IA "realista" (1,5 s / 0,6 s) | ~1,94 s |
  | Modelo preferido travado | 3,2 s (usou a reserva no prazo) |
  | Situação de 03/11 simulada (só o 3.1-lite respondendo, em 1,2 s) | ~1,64 s |

- **Falhas:** erro 500/503, JSON inválido, cor fora das opções, texto livre, resposta vazia/bloqueada, timeout, limite 429, sem internet, chave inválida e proxy devolvendo HTML. Em todas o bot **não caiu** e seguiu para a próxima pergunta.
- **Chamadas:** 2 por pergunta na corrida e 1 com um modelo só. Nenhuma em lobby, transição ou tela de resultado.

**Tempo real = custo do bot (~0,5 s) + latência do Gemini naquela hora.** Com o Google sobrecarregado (como em 03/11), passa de 5 s, e nenhuma escolha de modelo resolve isso.

Tabela completa: [`testes/resultados/simulados.md`](testes/resultados/simulados.md).

---

## Limitações conhecidas
- **A pergunta precisa aparecer na sua tela.** Se o professor mostra a pergunta só no telão, o dispositivo do jogador mostra só as formas coloridas. O bot então chuta pela imagem e avisa "⚠ sem texto na tela". O host libera isso em *"Mostrar perguntas e respostas nos dispositivos dos jogadores"*.
- **Google sobrecarregado.** Às vezes todos os modelos ficam lentos ou dão 503 (aconteceu em 03/11: o 3.1-lite levou ~4 s só pra dizer "ok"). Aí a resposta pode passar de 5 s. Isso é a fila do Google, não o bot. O terminal mostra quem está respondendo.
- **Ninguém acerta 100%.** O acerto depende do Gemini. Opinião, pegadinha do professor ou fato muito específico podem errar.
- **Pouco testado no Kahoot real e no Windows.**
  - O que foi testado: no seu Windows, o bot abriu o Chrome no kahoot.it, achou a pergunta e chamou o Gemini (que deu 503/timeout). O resto foi testado em telas que imitam o Kahoot, num Chrome de verdade.
  - A detecção não depende de nomes de classes do site. Ela usa as cores oficiais das caixas e o fato de serem clicáveis. Se o Kahoot mudar isso, a detecção pelo print entra como reserva.
- **Tipos não suportados:** múltipla seleção, digitar resposta, quebra-cabeça, slider e pin.
- **Política do PC.** Se o administrador desligou o controle remoto do Chrome (política `RemoteDebuggingAllowed`), o modo VS Code não funciona. O verificador detecta isso; tente o Edge (`"navegador"` no `config.json`). Se os dois estiverem bloqueados, a alternativa seria uma extensão do Chrome (que também depende de política). Ela foi prototipada e testada, mas tirada para manter uma solução só.
- **Rede.** A rede da faculdade pode bloquear `generativelanguage.googleapis.com`. Nesse caso, teste pelo roteador do celular.
- **Janela do jogo.** Mantenha a janela do Chrome do bot visível (não minimizada). Atrás do VS Code ela continua funcionando.
- **Chave em PC compartilhado.** Não salve a chave no PC da faculdade, ou apague o `chave-gemini.txt` ao sair. Se vazar, revogue a chave no AI Studio.

---

## Arquivos
```
.vscode/tasks.json      tarefas: iniciar (Ctrl+Shift+B), verificar, testar Gemini real (usam o Node do PC ou baixam o portátil)
config.json             lista de modelos, prazos e opções
bot/bot.js              programa principal (abre o Chrome, ponte DevTools, Gemini, clique)
bot/cdp.js              cliente WebSocket + DevTools Protocol (sem dependências)
bot/navegador.js        acha e abre o Chrome/Edge
bot/config.js           lê config e chave
bot/verificar.js        🩺 verificação do computador
bot/testar-gemini.js    🧪 acerto e tempo com o Gemini real
nucleo/agente.js        roda dentro da página: detecta, estabiliza, extrai texto, mostra o aviso, pede o clique
nucleo/visao.js         cores do Kahoot e detecção de caixas num print
nucleo/gemini.js        pedido REST, leitura da resposta, timeouts, corrida e escolha automática de modelos
testes/                 unitários, ponta a ponta simulados, Kahoot/Gemini simulados, 27 amostras com gabarito
```

### Rodar os testes (desenvolvimento)
- `node testes/unitarios.test.js`: 29 testes, sem rede.
- `node testes/simulados.js`: ponta a ponta. Precisa de um Chromium: Playwright ou `KB_NAVEGADOR=caminho`.
- `node testes/gerar-amostras.js`: refaz as amostras. Precisa de Playwright + Python/Pillow.
