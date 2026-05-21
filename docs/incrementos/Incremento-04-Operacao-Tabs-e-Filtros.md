# Incremento 04: Operacao por Tabs e Filtros de Palavras

## Objetivo
Reorganizar a UX do app para que a operacao do dia a dia fique mais clara, previsivel e rapida para o operador, separando:

- navegacao principal por tabs no topo
- rotina operacional dentro da tab `Operacao`
- informacoes institucionais e tecnicas dentro da tab `Sistema`
- configuracoes operacionais simples acessiveis sem poluir a tela principal

## Problemas que este incremento resolve
- a tela principal ainda mistura operacao, contexto e manutencao
- `Central do operador` e cards-resumo ocupam espaco global demais
- a rotina da operacao nao esta dividida por etapa
- nao existe uma fila separada de itens `aprovados`
- nao existe configuracao operacional simples para impedir ida ao ar de mensagens com palavras proibidas

## Resultado esperado

### Tabs
- as tabs ficam no topo da tela do app
- o conteudo muda logo abaixo das tabs

### Tab Operacao
- topo com `Preview` e `No ar` lado a lado
- abaixo, `Mensagens recebidas` e `Mensagens aprovadas`
- ambas com busca por:
  - nome
  - numero
  - grupo
  - trecho da mensagem
- botao simples de `Configuracao` dentro da propria tab

### Tab Sistema
- passa a concentrar:
  - `Central do operador`
  - cards de resumo:
    - mensagens aguardando
    - preview atual
    - no ar
    - enquete
  - recursos tecnicos e operacionais ja existentes

### Modal de configuracao da operacao
- abre a partir da tab `Operacao`
- layout com:
  - sidebar
  - conteudo principal
- primeira secao:
  - `Filtro de palavras que nao podem ir ao ar`

### Regra funcional do filtro
- o operador cadastra palavras ou termos proibidos
- se um item contiver um termo bloqueado no conteudo da mensagem:
  - ele continua podendo ser recebido, revisado e aprovado
  - mas nao pode ir ao ar enquanto contiver esse termo
- a regra precisa ser clara visualmente no preview

## Estrategia de implementacao

### Etapa 1
- mover tabs para o topo da tela
- retirar hero e resumo do topo global
- levar hero e resumo para a tab `Sistema`

### Etapa 2
- refatorar a tab `Operacao`
- criar:
  - grade superior com `Preview` e `No ar`
  - grade inferior com `Mensagens recebidas` e `Mensagens aprovadas`
- separar buscas de recebidas e aprovadas

### Etapa 3
- criar modal de configuracao da operacao
- implementar sidebar + area principal
- adicionar secao `Filtro de palavras`

### Etapa 4
- persistir o filtro localmente no app
- impedir `Colocar no ar` quando houver termo bloqueado
- exibir aviso claro para o operador

### Etapa 5
- revisar responsividade da nova grade
- manter leitura simples em desktop e em larguras menores

## Critérios de pronto
- tabs no topo
- tab `Sistema` concentrando hero e resumo
- tab `Operacao` separada em quatro areas:
  - preview
  - no ar
  - mensagens recebidas
  - mensagens aprovadas
- busca funcional em recebidas e aprovadas
- modal de configuracao abrindo da tab `Operacao`
- filtro de palavras persistido localmente
- itens bloqueados impedidos de ir ao ar
