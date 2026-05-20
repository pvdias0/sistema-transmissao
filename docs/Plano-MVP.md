# Plano de Implementacao do MVP

## Contexto

Este documento registra o plano de implementacao do MVP do sistema de transmissao para `vMix`, com:

- `frontend` em `Electron + Vite + React + JavaScript`
- `backend` local em `Node.js + Express + JavaScript (ESM)`
- integracao com `WhatsApp` via `whatsapp-web.js`
- saida principal para o `vMix` via `Browser Input` em `localhost`

## Objetivo do MVP

Entregar um aplicativo Windows que:

- autentique uma sessao do `WhatsApp`
- receba mensagens e midias da audiencia
- permita moderacao humana obrigatoria
- exiba conteudo aprovado no `vMix`
- gerencie enquetes automaticas
- recupere estado operacional minimo apos reinicio
- permita limpeza local sem apagar a sessao autenticada

## Arquitetura Base

- `frontend/`: shell desktop, painel do operador e integracao Electron
- `backend/`: nucleo operacional local, adaptadores e estado da transmissao
- `overlay local`: pagina servida em `localhost` para uso no `vMix`

Separacao de responsabilidades:

- `Electron main`: ciclo de vida do app, supervisao local e integracao com o sistema
- `React renderer`: interface do operador
- `Backend`: fila, moderacao, enquetes, sessao do WhatsApp, cache, limpeza e estado do overlay

## Fases de Implementacao

### 1. Fundacao do projeto

Definir a base tecnica do sistema:

- portas locais e URLs internas
- formato de configuracao `.env`
- estrutura de logs
- diretorios de dados, cache, midia e sessao
- convencao de eventos entre backend, Electron e overlay

Entrega esperada:

- app sobe com `frontend` e `backend`
- healthcheck local funcionando
- backend supervisionado pelo Electron

### 2. Nucleo operacional local

Construir o core do backend:

- estado em memoria para `incoming_queue`, `approved_pool`, `live_slot` e `active_poll`
- persistencia minima para recuperacao operacional
- limpeza segura de dados temporarios
- API local para painel e overlay

Entrega esperada:

- backend com estado previsivel
- restauracao basica apos reinicio

### 3. Integracao com WhatsApp

Adicionar `whatsapp-web.js` como adaptador:

- autenticacao por QR code
- manutencao de sessao
- recepcao de texto, imagem, video e audio
- normalizacao de mensagens para o core

Entrega esperada:

- mensagens entram na fila moderavel
- midias sao baixadas e referenciadas corretamente

### 4. Painel do operador

Implementar a interface em React:

- status da conexao
- fila de mensagens e midias
- preview de conteudo
- aprovar, rejeitar e remover do ar
- criacao e controle de enquete

Entrega esperada:

- operador consegue conduzir a transmissao inteira pelo painel

### 5. Overlay para vMix

Criar a saida web local:

- camada principal para texto, imagem, video e audio
- camada fixa para enquete
- atualizacao em tempo real
- transicoes simples e estaveis

Entrega esperada:

- `Browser Input` do `vMix` aponta para `localhost`
- item aprovado aparece idealmente em ate `1 segundo`

### 6. Confiabilidade operacional

Fechar os comportamentos de producao:

- restart do backend pelo Electron
- recuperacao de fila curta, item no ar e enquete ativa
- limpeza pelo app sem apagar sessao autenticada
- tratamento de erro de midia e perda de sessao

Entrega esperada:

- operacao previsivel durante uso prolongado

### 7. Empacotamento e validacao

Preparar o executavel Windows:

- build com `electron-builder`
- smoke tests de sessao, fila, midia, enquete e limpeza
- teste real com `vMix`
- checklist de instalacao e operacao

Entrega esperada:

- instalador utilizavel no PC do operador

## Ordem Recomendada

Sequencia recomendada:

1. `Fase 1`
2. `Fase 2`
3. `Fase 3` com `texto` primeiro
4. `Fase 4`
5. `Fase 5`
6. expansao de `midia`
7. `Fase 6`
8. `Fase 7`

## Corte Inteligente do MVP

Para reduzir risco inicial:

1. primeiro entregar `texto + enquete`
2. depois `imagem`
3. depois `audio`
4. por ultimo `video`

Isso mantem o MVP menor sem comprometer a arquitetura futura.

## Riscos Principais

- estabilidade de sessao do `whatsapp-web.js`
- reproducao confiavel de `video` e `audio` no overlay
- coordenacao entre `Electron`, `backend` e `vMix`
- politica de limpeza sem quebrar a recuperacao operacional

## Definicao de Pronto do MVP

O MVP sera considerado pronto quando:

- autenticar no `WhatsApp`
- receber mensagens e midias
- permitir moderacao humana obrigatoria
- exibir conteudo aprovado no `vMix`
- executar enquetes com regra de `ultimo voto vence`
- recuperar estado operacional basico apos reinicio
- limpar dados locais sem apagar a sessao autenticada

## Decision Log

- `backend local` escolhido como base do MVP
- `VPS total` descartado para o nucleo operacional inicial
- `Browser Input / localhost` escolhido como saida principal para o `vMix`
- `modulacao por fases` adotada para reduzir risco de entrega
