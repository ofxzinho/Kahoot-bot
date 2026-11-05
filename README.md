# Kahoot Bot

Bot que lê as perguntas do Kahoot direto da página, consulta um modelo de linguagem e clica na resposta. Roda no Windows sem permissão de administrador e sem instalar dependências.

- Responde em cerca de 1 a 2 s em perguntas de texto e em cerca de 4 s nas que têm imagem.
- Suporta múltipla escolha, verdadeiro/falso, múltipla seleção, régua (slider) e ordenação (puzzle).
- Lê código e texto em imagens com OCR local (Tesseract em WebAssembly).
- Usa a Groq como provedor principal e o Gemini como reserva e para imagens.
- Tem um painel web local para configurar as chaves e acompanhar o jogo.

## Download

Baixe o `.zip` da versão mais recente na página de [Releases](../../releases), extraia a pasta inteira e execute `KahootBot.exe`.

> O executável depende das pastas `bot/` e `nucleo/`, que vêm junto no zip. Não mova o `.exe` sozinho para outro lugar.

Na primeira execução, o Windows pode exibir o aviso do SmartScreen ("O Windows protegeu o computador"), porque o executável não é assinado digitalmente. Clique em **Mais informações → Executar assim mesmo**.

## Uso

1. Execute `KahootBot.exe`. Uma janela do Chrome (ou do Edge) abre no painel do bot.
2. Cole uma chave de API e clique em **Salvar e testar**:
   - **Groq** (recomendada): https://console.groq.com/keys
   - **Gemini** (opcional, melhora a leitura de imagens): https://aistudio.google.com/apikey

   Ambas têm plano gratuito. Uma chave basta para funcionar.
3. O bot abre o `kahoot.it` em uma nova aba. Entre no jogo por essa janela.
4. Para encerrar, feche a janela do Chrome.

Pelo painel dá para pausar o bot, voltar à aba do jogo e acompanhar o placar, o tempo médio de resposta e o log. O atalho `Alt+Shift+K`, na página do Kahoot, também pausa e retoma.

Para conferir o ambiente antes de usar (navegador, rede e chaves), execute `Verificar este PC.cmd`.

### Pelo VS Code

1. Abra a pasta do projeto no VS Code.
2. Pressione `Ctrl+Shift+B`.

A tarefa usa o Node.js instalado na máquina. Se não houver um, ela baixa o Node portátil oficial para a pasta `node/`, sem precisar de administrador. Depois disso, o funcionamento é o mesmo do executável.

As outras tarefas ficam em *Terminal → Executar Tarefa…*:

| Tarefa | Descrição |
|---|---|
| Verificar este computador | Testa o runtime, o navegador, a conectividade e os modelos |
| Testar com o Gemini real | Mede a taxa de acerto e o tempo de resposta usando as amostras em `testes/amostras` |

### Pela linha de comando

```bash
node bot/bot.js        # inicia o bot
node bot/verificar.js  # diagnóstico
```

Requer Node.js 18 ou mais recente.

## Como funciona

```
Chrome (perfil temporário)
  └─ agente injetado na página ── detecta pergunta e alternativas
        │  (Chrome DevTools Protocol)
Node.js
  ├─ OCR local ──────────────── lê texto/código de imagens
  ├─ gerenciador de modelos ─── Groq → Gemini, com fallback e paralelismo
  ├─ entrada de mouse/teclado ─ clique, arraste e teclas reais
  └─ painel local (127.0.0.1) ─ chaves, placar e log
```

1. **Navegador.** O bot abre o Chrome com um perfil temporário e controla a janela pelo DevTools Protocol. Desde o Chrome 136, o controle remoto é bloqueado no perfil padrão, por isso o perfil é separado. Ele é apagado ao sair.
2. **Detecção.**
   - Um script injetado em um contexto isolado identifica as alternativas pelas cores e pela estrutura clicável do Kahoot. Ele não depende de nomes de classes CSS.
   - Uma pergunta nova é reconhecida pela mudança do conteúdo acima das alternativas.
   - A leitura só é feita depois que a tela fica estável.
3. **Imagens.**
   - A imagem da pergunta é recortada e passa pelo OCR local.
   - Se o OCR não tiver confiança suficiente (fotos, gráficos), um modelo do Gemini transcreve a imagem.
4. **Resposta.**
   - As alternativas são enviadas numeradas, e o modelo responde com o número correspondente, validado por JSON Schema.
   - Se o modelo principal passar de `reforcoMs`, o próximo da lista é chamado em paralelo, e vale a primeira resposta válida.
   - Modelos que falham ficam de fora por 60 s.
5. **Ação.**
   - O clique é feito com eventos reais de mouse.
   - Na régua, o valor é ajustado pelo teclado.
   - No puzzle, os blocos são arrastados, com o teclado como alternativa.
   - Na múltipla seleção, o bot marca cada alternativa e clica em Enviar.

## Configuração

As chaves ficam em `chave-groq.txt` e `chave-gemini.txt`, criados pelo painel quando a opção "Lembrar neste PC" está marcada. Também podem vir das variáveis de ambiente `GROQ_API_KEY` e `GEMINI_API_KEY`. Os dois arquivos estão no `.gitignore`.

As demais opções ficam em `config.json`:

| Opção | Padrão | Descrição |
|---|---|---|
| `modelos` | Groq `openai/gpt-oss-120b`, Gemini 3.1 Flash-Lite, 3.5 Flash-Lite, 3.6 Flash | Ordem de preferência. Cada item aceita `provedor`, `modelo` e `nivel` (esforço de raciocínio) |
| `reforcoMs` | `2500` | Tempo de espera antes de chamar o próximo modelo em paralelo |
| `prazoImagemMs` | `4000` | Prazo para perguntas com imagem |
| `prazoTranscricaoMs` | `3300` | Prazo para transcrever a imagem antes de responder só pelo texto |
| `timeoutMs` | `15000` | Tempo máximo de uma chamada |
| `cliqueAutomatico` | `true` | Com `false`, o bot só mostra a resposta |
| `mostrarOverlay` | `true` | Aviso de status no canto da página |
| `navegador` | `auto` | Caminho do `chrome.exe` ou `msedge.exe`, se não for detectado |
| `urlInicial` | `https://kahoot.it/` | Página aberta ao iniciar |

Variáveis de ambiente úteis:

| Variável | Efeito |
|---|---|
| `KB_DEBUG=1` | Log detalhado da detecção e das chamadas |
| `KB_TERMINAL=1` | Pede as chaves no terminal em vez de abrir o painel |
| `KB_NAVEGADOR` | Caminho do navegador |

## Estrutura

```
KahootBot.exe            Node.js oficial (Windows) com o lançador embutido
Verificar este PC.cmd    atalho para o diagnóstico
config.json
bot/
  bot.js                 processo principal
  painel.js              painel web local
  cdp.js                 cliente WebSocket/DevTools Protocol, sem dependências
  navegador.js           localiza e abre Chrome/Edge
  ocr.js, ocr/           Tesseract.js (WASM) e dados de idioma
  config.js              configuração e chaves
  verificar.js           diagnóstico do ambiente
  lancador.js            ponto de entrada do executável
nucleo/
  agente.js              script injetado na página
  visao.js               classificação de cores e detecção de blocos
  gemini.js              montagem dos pedidos, provedores e gerenciador de modelos
ferramentas/
  montar-exe.js          gera o KahootBot.exe
testes/
```

## Limitações

- A pergunta precisa aparecer no dispositivo do jogador. Se o host desativar a exibição das perguntas nos dispositivos, o bot só vê as formas coloridas.
- A taxa de acerto depende do modelo. Perguntas ambíguas ou muito específicas podem errar.
- Algumas redes institucionais bloqueiam `api.groq.com` ou `generativelanguage.googleapis.com`.
- Se a política do Chrome desativar a depuração remota (`RemoteDebuggingAllowed`), o bot não consegue controlar o navegador. Nesse caso, configure o Edge em `navegador`.
- Antivírus ou políticas de TI (AppLocker) podem bloquear executáveis baixados. Nesses casos, use o modo VS Code.
- O plano gratuito da Groq tem limite de requisições por minuto e por dia, o que é suficiente para várias partidas.

## Desenvolvimento

```bash
node testes/unitarios.test.js   # testes unitários (sem rede)
node testes/simulados.js        # ponta a ponta com páginas e APIs simuladas
                                # (requer Chromium; defina KB_NAVEGADOR)
```

Para gerar o executável a partir de qualquer sistema operacional:

```bash
npm i --no-save resedit pe-library
node ferramentas/montar-exe.js caminho/para/node.exe ferramentas/icone.ico
```

O `node.exe` precisa ser da mesma versão do Node usado para rodar o script (ex.: 22.x). O executável gerado não entra no repositório e é distribuído pelas Releases.

## Componentes de terceiros

- [Node.js](https://nodejs.org) (MIT), embutido no `KahootBot.exe`
- [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0), usado no OCR local
