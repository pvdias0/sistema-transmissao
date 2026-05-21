# Incremento 02 - Refatoracao de UX/UI da Central do Operador

## Objetivo

Refatorar a interface principal do app para que o operador consiga entender o estado da operacao e executar as acoes principais sem precisar interpretar muitos cards dispersos.

O foco desta refatoracao e:

- reduzir carga cognitiva
- organizar a tela pelo fluxo real de uso
- mostrar apenas informacoes relevantes por padrao
- esconder detalhes tecnicos em camadas secundarias
- deixar a linguagem mais natural e orientada a acao

## Problemas observados na interface atual

- muitos cards independentes competindo pela atencao
- informacoes tecnicas misturadas com a operacao diaria
- fila, preview, item no ar, enquete e configuracoes sem hierarquia clara
- excesso de blocos com peso visual semelhante
- operador precisa "montar mentalmente" o fluxo do app
- usuario novo nao entende rapidamente por onde comecar
- usuario recorrente pode se perder em manutencao, preview e transmissao

## Direcao de UX

### 1. Organizar por fluxo, nao por tecnologia

A tela deve seguir a ordem mental do operador:

1. receber mensagens
2. revisar e dar preview
3. aprovar ou rejeitar
4. colocar no ar
5. controlar o que esta no ar

### 2. Destacar somente o que importa agora

Devem ficar em destaque:

- estado da conexao do WhatsApp
- quantidade de itens pendentes
- item em preview
- item no ar
- enquete ativa

Devem ficar em camada secundaria:

- informacoes de backend
- dados de shell/runtime
- limpeza operacional
- configuracoes menos frequentes

### 3. Reduzir fragmentacao visual

Em vez de varios cards com a mesma importancia visual, a tela deve ser dividida em:

- cabecalho operacional
- coluna principal de moderacao
- coluna lateral de transmissao
- painel avancado recolhido

### 4. Linguagem natural

Substituir termos excessivamente tecnicos quando possivel:

- `Fila de moderacao` -> `Mensagens recebidas`
- `Live slot` -> `No ar`
- `Estado atual` -> `Visao geral`
- `Saude do servico` -> `Sistema`

Sem perder precisao operacional.

## Nova arquitetura de tela

## Cabecalho operacional

Conteudo:

- titulo da central
- status do WhatsApp
- contagem de pendentes
- item no ar
- acoes principais de sessao quando necessario

Objetivo:

- em 3 a 5 segundos o operador entende o estado do sistema

## Coluna principal - Entrada e decisao

Blocos:

- `Mensagens recebidas`
- `Preview do operador`

Objetivo:

- concentrar todo o trabalho de triagem em um unico eixo

Comportamento:

- o operador escolhe um item da fila
- visualiza no preview
- aprova, rejeita ou coloca no ar

## Coluna lateral - Transmissao

Blocos:

- `No ar`
- `Controle de audio/video`
- `Enquete`
- `Ajustes rapidos do overlay`

Objetivo:

- concentrar tudo que afeta a transmissao naquele momento

## Camada secundaria - Sistema e manutencao

Blocos em area recolhida:

- limpeza local
- restauracao de estado
- URL do overlay
- informacoes tecnicas do backend
- entrada manual de teste

Objetivo:

- manter utilidade sem poluir a operacao principal

## Acoes de design e usabilidade

### A. Reduzir cards e criar secoes maiores

- menos caixas independentes
- mais agrupamento por responsabilidade

### B. Dar destaque ao preview e ao item no ar

- preview maior
- item no ar mais legivel
- estado de reproducao mais claro

### C. Simplificar a fila

- cards menores e mais escaneaveis
- acoes sempre no mesmo lugar
- preview selecionado com destaque

### D. Priorizar responsividade operacional

- desktop continua sendo prioridade
- mas o layout precisa colapsar com clareza em telas menores

### E. Separar o tecnico do operacional

- detalhes tecnicos devem ser acessiveis, nao dominantes

## Escopo de implementacao deste incremento

### Etapa 1

Refatorar a pagina principal para:

- novo cabecalho operacional
- nova divisao em coluna principal e coluna lateral
- painel tecnico recolhido
- reorganizacao de textos e rotulos

### Etapa 2

Ajustar visual da fila, preview e item no ar:

- destaque de item selecionado
- melhores tamanhos de preview
- agrupamento de acoes

### Etapa 3

Refinar enquete e ajustes rapidos:

- enquete ativa no painel lateral
- criacao simplificada
- tipografia do overlay em bloco rapido

## Criterios de pronto

- um usuario novo entende por onde comecar sem treinamento longo
- a leitura do estado atual do app leva poucos segundos
- fila, preview e transmissao ficam claramente separados
- informacoes tecnicas deixam de competir com a operacao principal
- a interface fica mais limpa, consistente e previsivel

## Resultado esperado

A tela deve passar a se comportar como uma `central de operacao ao vivo`, e nao como um conjunto de modulos tecnicos soltos.
