# Incremento 01 - Operacao de Overlay e Midia

## Contexto

Este documento registra o primeiro conjunto de incrementos apos o `Plano-MVP.md`.

O foco aqui nao e reconstruir o MVP original, mas evoluir o estado atual do projeto em pontos que ja apareceram na validacao pratica:

- controle operacional de `audio` e `video`
- ajuste rapido de tipografia no overlay
- responsividade do modal/card de mensagens
- base para customizacao visual futura

## Problemas Observados

### 1. Midia sem controle de execucao

Atualmente, quando um `audio` ou `video` vai para o `live slot`, o overlay reproduz automaticamente.

Isso gera limitacoes operacionais:

- o operador nao controla `play`
- o operador nao controla `pause`
- o operador nao consegue `replay`
- o operador nao consegue voltar `15`, `10`, `7`, `3` ou `1` segundo
- o operador nao consegue verificar o estado real de reproducao no painel

### 2. Tipografia fixa no overlay

Hoje o operador nao consegue ajustar rapidamente o tamanho das fontes de:

- mensagens
- enquetes

Esse ajuste precisa ser simples e rapido durante a operacao.

### 3. Modal/card de mensagens nao responsivo

Mensagens grandes podem perder informacao ou ficar com composicao ruim.

Problemas esperados:

- quebra de linha insuficiente
- altura do card mal distribuida
- fonte grande demais para textos longos
- risco de corte visual

## Objetivo do Incremento

Entregar a base tecnica e operacional para:

- controlar a execucao de `audio` e `video` no ar
- ajustar rapidamente a tipografia do overlay
- impedir perda de informacao em mensagens longas
- preparar o sistema para um editor visual mais completo no futuro

## Entregas Planejadas

### Entrega 1. Controles rapidos de tipografia

Objetivo:

- permitir que o operador ajuste o tamanho da fonte da `mensagem`
- permitir que o operador ajuste o tamanho da fonte da `enquete`

UX recomendada:

- `Mensagem: A- / valor / A+`
- `Enquete: A- / valor / A+`

Campos sugeridos de configuracao:

- `message.fontSize`
- `poll.titleFontSize`
- `poll.optionFontSize`

Regras:

- incremento de `2px` por clique
- limites minimos e maximos
- persistencia local dos valores
- reflexo imediato no overlay

Arquivos provaveis:

- `backend/src/app.js`
- `backend/src/runtime-state-storage.js` ou storage dedicado de settings
- `frontend/src/main/index.js`
- `frontend/src/preload/index.js`
- `frontend/src/renderer/src/App.jsx`
- `backend/src/overlay/assets/overlay.css`
- `backend/src/overlay/assets/overlay.js`

Critério de pronto:

- o operador altera a fonte da mensagem com `A-` e `A+`
- o operador altera a fonte da enquete com `A-` e `A+`
- a mudanca aparece no overlay sem reiniciar o app

### Entrega 2. Responsividade do card de mensagens

Objetivo:

- impedir perda de informacao em mensagens longas
- manter legibilidade sem quebrar o visual da transmissao

Estrategia recomendada:

1. renderizar no layout padrao
2. reduzir fonte progressivamente ate um minimo seguro
3. se ainda exceder, trocar para layout expandido
4. se ainda ficar ruim, sinalizar no painel que a mensagem esta no limite

Diretrizes:

- nao usar `scroll` no overlay ao vivo
- nao cortar texto silenciosamente
- manter preview fiel no painel

Possiveis ajustes tecnicos:

- `max-width` e `max-height` configuraveis
- `line clamp` nao destrutivo apenas para preview, nao para overlay final
- `font-size` dinamico por quantidade de texto
- modo de card expandido para textos maiores

Arquivos provaveis:

- `backend/src/overlay/assets/overlay.css`
- `backend/src/overlay/assets/overlay.js`
- `frontend/src/renderer/src/App.jsx`

Critério de pronto:

- mensagem curta fica igual ou melhor que hoje
- mensagem media quebra linha sem cortar
- mensagem longa continua legivel
- o operador percebe no painel quando o texto esta no limite

### Entrega 3. Controle de transporte para audio e video

Objetivo:

- separar `estar no ar` de `estar tocando`
- dar controle real ao operador sobre midia no overlay

Modelo recomendado:

- `liveItem`: item exibido no ar
- `mediaTransport`: estado da reproducao

Campos sugeridos:

- `status`: `idle | cued | playing | paused | ended`
- `currentTime`
- `duration`
- `volume`
- `commandVersion`
- `updatedAt`

Comandos necessarios:

- `play`
- `pause`
- `stop`
- `restart`
- `seek -15s`
- `seek -10s`
- `seek -7s`
- `seek -3s`
- `seek -1s`

Canal tecnico recomendado:

- `WebSocket` entre backend e overlay

Alternativa simplificada:

- endpoints de comando + polling

Mas o ideal para operacao de midia continua sendo `WebSocket`.

Fluxo esperado:

1. operador envia comando no painel
2. backend registra e publica o comando
3. overlay executa no elemento `audio` ou `video`
4. overlay devolve telemetria de execucao
5. painel mostra o estado real da reproducao

Arquivos provaveis:

- `backend/src/app.js`
- `backend/src/runtime-store.js` ou store dedicado de media transport
- `backend/src/runtime-state-storage.js`
- `frontend/src/main/index.js`
- `frontend/src/preload/index.js`
- `frontend/src/renderer/src/App.jsx`
- `backend/src/overlay/assets/overlay.js`

Critério de pronto:

- operador consegue pausar
- operador consegue retomar
- operador consegue reiniciar a midia
- operador consegue voltar `15`, `10`, `7`, `3` e `1` segundo
- painel mostra estado real, nao assumido

## Ordem Recomendada de Implementacao

1. `Controles rapidos de tipografia`
2. `Responsividade do card de mensagens`
3. `Controle de transporte de audio e video`
4. `Sistema mais amplo de presets visuais`

## Backlog Prioritario

### P1

- controles `A-` e `A+` para fonte de mensagens
- controles `A-` e `A+` para fonte de enquetes
- card responsivo para mensagens longas
- preview fiel de mensagem no painel
- controle de `play/pause/restart/seek` para midia

### P2

- presets visuais prontos
- configuracao de posicao do card de mensagem
- configuracao de posicao da enquete
- cores, fundos e tipografia mais detalhados

## Decisoes de Arquitetura

- `audio` e `video` continuam no `overlay localhost`, sem mudar de arquitetura agora
- `colocar no ar` deixa de significar `tocar automaticamente para sempre sem controle`
- tipografia vira configuracao persistida
- card de mensagem precisa ter comportamento responsivo controlado por regra, nao por improviso visual

## Definicao de Pronto do Incremento 01

O incremento sera considerado pronto quando:

- operador conseguir aumentar e diminuir fonte de mensagem
- operador conseguir aumentar e diminuir fonte de enquete
- mensagens longas nao perderem conteudo
- operador conseguir controlar execucao de audio e video no ar
- configuracoes permanecerem apos reinicio do app
