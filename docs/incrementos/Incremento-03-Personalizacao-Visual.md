# Incremento 03 - Personalizacao Visual do Overlay

## Contexto

Durante a evolucao do MVP, a operacao e a confiabilidade receberam prioridade. Como resultado, a personalizacao visual prometida para `mensagens` e `enquetes` ficou apenas parcial.

O que existia antes deste incremento:

- ajuste de `tamanho da fonte` da mensagem
- ajuste de `tamanho da fonte` da enquete

O que ainda faltava:

- escolha de `fonte`
- escolha de `cor do texto`
- escolha de `cor de destaque`
- escolha de `cor de fundo`
- opcao de `imagem de fundo`

## Objetivo

Entregar a primeira etapa de personalizacao visual sem transformar o app em um editor pesado.

O foco desta etapa e:

- permitir ajustes visuais rapidos pelo proprio operador
- refletir as mudancas no overlay sem reiniciar o app
- manter a configuracao persistida localmente

## Escopo da Etapa 1

### Mensagem

- tamanho da fonte
- familia da fonte
- cor do texto
- cor de destaque
- cor de fundo
- imagem de fundo opcional

### Enquete

- tamanho da fonte
- familia da fonte
- cor do texto
- cor de destaque
- cor de fundo
- imagem de fundo opcional

## Decisoes

- esta etapa nao implementa presets salvos pelo operador
- esta etapa nao implementa reposicionamento livre dos cards
- a imagem de fundo sera configurada por `URL`
- se a imagem de fundo estiver vazia, o card usa apenas `cor solida`

## UI Planejada

Na tab `Overlay`, o operador passa a ter dois blocos:

- `Card da mensagem`
- `Card da enquete`

Cada bloco deve conter:

- controle rapido de tamanho
- seletor de fonte
- seletor de cor do texto
- seletor de cor de destaque
- seletor de cor de fundo
- campo para imagem de fundo opcional
- acao para remover a imagem de fundo

## Criterios de pronto

- operador consegue mudar a fonte da mensagem
- operador consegue mudar a fonte da enquete
- operador consegue mudar cores de texto, destaque e fundo
- operador consegue definir ou limpar imagem de fundo
- as mudancas aparecem no overlay sem reiniciar
- as mudancas permanecem salvas apos reinicio do app

## Etapas futuras

Ficam para uma fase seguinte:

- presets visuais salvos
- exportar/importar temas
- mais opcoes de tipografia
- reposicionamento visual de mensagem e enquete
- configuracao de largura, alinhamento e espacamento
