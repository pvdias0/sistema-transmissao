# Ordem Executiva Atual

## Objetivo deste documento

Este documento define a ordem pratica de implementacao a partir do estado atual do projeto.

Ele existe para deixar claro como:

- o `Plano-MVP.md`
- e os documentos em `docs/incrementos/`

se encaixam na execucao real.

## Regra de organizacao

### 1. Plano principal

O arquivo `docs/Plano-MVP.md` continua sendo o plano macro do produto.

Ele organiza:

- as fases principais
- os objetivos do MVP
- a arquitetura base
- a definicao de pronto

### 2. Incrementos

Os documentos em `docs/incrementos/` sao refinamentos do plano principal.

Eles existem para registrar:

- ajustes descobertos durante testes reais
- melhorias de operacao
- necessidades de UX e controle
- desdobramentos tecnicos mais especificos

Importante:

- os incrementos nao substituem o plano principal
- os incrementos detalham a execucao de fases que ja estao abertas

## Estado atual do projeto

No momento, o projeto ja possui:

- `backend local` funcional
- sessao do `WhatsApp` integrada
- fila de moderacao
- suporte a `texto`, `imagem`, `audio` e `video`
- enquete automatica
- overlay local em `localhost`
- validacao inicial com `vMix`
- persistencia minima operacional
- limpeza local preservando a sessao autenticada

Em termos do `Plano-MVP.md`, isso significa que o projeto avancou fortemente nas fases:

- `Fase 1`
- `Fase 2`
- `Fase 3`
- `Fase 4`
- `Fase 5`

e entrou em:

- `Fase 6: confiabilidade operacional`

A `Fase 7: empacotamento e validacao final` ainda nao deve ser iniciada como prioridade principal.

## Por que os incrementos entram agora

Durante a validacao real apareceram lacunas importantes de operacao:

- falta de controle de execucao para `audio` e `video`
- dificuldade com mensagens longas
- necessidade de controle rapido de tipografia
- necessidade futura de personalizacao visual do overlay

Esses pontos nao invalidam o plano principal.

Eles apenas mostram que, antes de empacotar o app, precisamos refinar a operacao real.

Por isso surgiu o:

- `Incremento-01-Operacao-Overlay.md`

## Ordem recomendada daqui para frente

### Etapa 1. Fechamentos da confiabilidade operacional

Antes de avancar para novas features de UX, ainda vale consolidar o que ja foi iniciado na `Fase 6`.

Itens desta etapa:

- revisar comportamento de reinicio
- revisar restauracao de estado
- revisar limpeza local
- revisar comportamento do backend supervisionado pelo Electron
- observar detalhes de encoding/texto de mensagens recebidas
- estabilizar comportamento sob uso continuo

### Etapa 2. Incremento 01 - Controles rapidos de tipografia

Implementar primeiro:

- `Mensagem: A- / valor / A+`
- `Enquete: A- / valor / A+`

Motivo:

- baixo custo tecnico
- alto valor operacional
- melhora imediata no uso real

### Etapa 3. Incremento 01 - Responsividade do card de mensagens

Implementar depois:

- ajuste de card para mensagens longas
- reducao progressiva de fonte
- layout expandido quando necessario
- preview fiel no painel

Motivo:

- problema ja observado
- afeta diretamente a confianca do operador no overlay

### Etapa 4. Incremento 01 - Controle de audio e video

Implementar depois:

- `play`
- `pause`
- `stop`
- `restart`
- retorno de `15`, `10`, `7`, `3` e `1` segundo
- telemetria de reproducao

Motivo:

- impacto operacional alto
- exige modelagem mais cuidadosa
- deve vir depois dos ajustes menores e mais rapidos do overlay

### Etapa 5. Empacotamento e validacao final

Somente depois dos passos acima:

- preparar build final
- smoke tests mais completos
- checklist de uso
- validacao final com `vMix`

## Ordem executiva consolidada

Sequencia oficial recomendada:

1. `Fechamentos da Fase 6`
2. `Incremento 01 - Tipografia`
3. `Incremento 01 - Responsividade de mensagens`
4. `Incremento 01 - Controle de audio e video`
5. `Fase 7 - Empacotamento e validacao final`

## Regra de priorizacao

Usar esta regra para decidir o que entra em qual documento:

### Vai para o plano principal quando:

- for fase macro do produto
- mudar arquitetura base
- alterar escopo do MVP
- afetar definicao de pronto global

### Vai para incrementos quando:

- surgir em teste real
- for refinamento operacional
- for melhoria de UX
- for ajuste especifico de overlay, painel ou fluxo de uso

## Decisao atual

A decisao oficial neste momento e:

- continuar seguindo o `Plano-MVP.md`
- usar `docs/incrementos/` como trilha de refinamento
- executar `Incremento 01` antes da fase final de empacotamento

## Proxima ordem de trabalho

Se nenhuma prioridade nova surgir, a execucao deve seguir assim:

1. pequenos fechamentos de confiabilidade
2. incremento de tipografia do overlay
3. ajuste de mensagens longas
4. controle de execucao de midia
