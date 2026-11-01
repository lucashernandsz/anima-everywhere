# Anima Everywhere

Este e o arquivo canonico e a fonte primaria de instrucoes deste repositorio.
Comandos e documentos subordinados devem remeter a ele, sem criar regras concorrentes.

## Projeto Pessoal

- Este projeto e pessoal de Lucas, nao um projeto corporativo da Sanar.
- Quando Lucas pedir publicacao no GitHub, usar a conta pessoal `lucashernandsz` e um repositorio sob `lucashernandsz/<repositorio>`.
- Nao publicar este projeto com a conta `lucashernandez-sanar` nem em uma organizacao corporativa. Outro destino exige autorizacao explicita de Lucas.
- Esta regra define identidade e destino; nao autoriza commit, push, criacao de repositorio, deploy ou mudanca de visibilidade automaticamente.
- Antes de publicar, confirmar a identidade autenticada, o repositorio, a visibilidade e os arquivos incluidos. Nao presumir que todo projeto pessoal deve ser publico.
- Preservar alteracoes existentes e excluir credenciais, arquivos privados, caches, dependencias e artefatos locais da publicacao.

## Escopo

- Este projeto se chama **Anima Everywhere**.
- O produto selecionara trechos de audio de 30 segundos a 3 minutos para gerar animacoes.
- O escopo inclui front-end e um servico local Node.js para baixar videos publicos do YouTube e exportar cortes com yt-dlp e FFmpeg, conforme pedido explicito de Lucas. Geracao de animacoes continua fora do escopo implementado.
- O fluxo de cortes recebe JSON com titulo_hook, corte, segundos_inicio/segundos_fim ou tempo_inicio/tempo_fim e url_youtube. Preservar segundos decimais; permitir cortes menores que 30 segundos neste fluxo, sem alterar os limites do estudio de audio.
- Nao exigir projeto, OAuth, chave ou configuracao no Google. Nao conectar contas, publicar videos, extrair cookies nem contornar login, DRM e restricoes de acesso. Exigir confirmacao de direitos de uso; ela nao substitui os termos do YouTube.
- Processamento CPU-only e sequencial no computador, com proporcoes 1:1, 16:9 e 9:16; preservar imagem inteira com barras por padrao. Arquivos de video em .local-media, ferramentas em .tools, nunca no build publico ou versionados. API somente em loopback; manter validacao de Host e Origin e bloqueios do Vite para arquivos privados.
- A linguagem visual das animacoes ainda sera discutida. Opcoes visuais no prototipo sao exploratorias, nao requisitos definitivos.
- Nao apresentar simulacoes como geracao real. Identificar demonstracoes e limites do prototipo.

## Interface

- **Nao usar Dende neste projeto**, incluindo componentes, tokens e dependencias. Esta e uma excecao explicita solicitada por Lucas.
- Usar identidade propria, interface em portugues, responsividade, acessibilidade e movimento reduzido.
- Manter arquivos de audio no navegador. Nao enviar arquivos para servicos externos sem um pedido explicito.
- Preservar alteracoes existentes. Nao fazer commit, push ou deploy sem autorizacao.

## Anywhere Maker

- O comando local esta em `.opencode/commands/anywhere-maker.md`.
- Ao executar `/anywhere-maker`, ler este arquivo e o comando local antes de implementar.
- Carregar a skill `anywhere-make`. Se ela nao estiver no catalogo, ler `~/.config/opencode-sanar/skills/anywhere-make/SKILL.md`.
- Aplicar a identidade da skill preservando o nome, a finalidade e as funcionalidades deste projeto. Nao importar funcionalidades de outros projetos.

## Gratuidade Por Padrao

- Todas as funcionalidades, dependencias, ferramentas e servicos necessarios para desenvolver, compilar e executar o projeto devem ser utilizaveis sem pagamento.
- Nao introduzir APIs pagas, assinaturas, creditos comprados, testes gratuitos temporarios ou solucoes que exijam pagamento depois de uma cota. Uma camada gratuita nao atende se o funcionamento solicitado depender de exceder seus limites.
- Preferir processamento local, software livre e dependencias com licencas compativeis com o uso pretendido sem custo. Verificar separadamente preco e licenca nas fontes oficiais antes de adicionar recursos.
- Excecoes exigem autorizacao explicita de Lucas para o recurso e o custo envolvidos. Um pedido generico de implementacao nao autoriza gastos; uma excecao nao altera o padrao dos demais recursos.
- Se nenhuma opcao inteiramente gratuita atender, explicar a limitacao, propor alternativa sem custo ou aguardar autorizacao especifica. Nunca contratar, comprar ou ativar cobranca automaticamente.
- Preferir solucoes leves, CPU-only, memoria limitada e baixa concorrencia. Nao exigir GPU dedicada ou CPU moderna sem necessidade e autorizacao explicitas. Nao prometer desempenho sem medicao.

## Identidade Visual

- Direcao editorial, calma e acolhedora, com espaco em branco generoso, hierarquia funcional clara e composicao predominantemente plana. Evitar dashboard generico, grades decorativas de cards, gradientes, sombras pesadas e animacoes desnecessarias.
- Zilla Slab local, peso 700, na marca e nos titulos, com Georgia e serif como fallback. Inter local no corpo e controles, com fontes sans-serif do sistema como fallback. Manter as licencas SIL Open Font License junto dos arquivos; nao depender de CDN em tempo de execucao.
- Escrever titulos, rotulos, botoes e textos auxiliares em portugues minusculo. Preservar arquivos, conteudo do usuario, nomes proprios quando necessario e notacao tecnica sensivel a caixa, como dB, LUFS, MB, GB e FFmpeg. Nao aplicar lowercase global.
- Fundo marfim quente `#fafaf5`, superficies brancas `#ffffff`, texto quase preto `#1a1a1a`, texto secundario `#64645e` e bordas `#e5e5dc`.
- Laranja `#f28c38` reservado para acoes primarias, selecoes e pequenos destaques funcionais, nunca grandes fundos decorativos. Usar `#a95116` em bordas de destaque, `#e67d28` no hover primario e `#fff3e8` no estado de arrastar arquivo. Texto quase preto sobre botoes laranja e contraste adequado nos demais estados.
- Renderizar o nome inteiro **Anima Everywhere** em quase preto, sem marca-texto, fundo colorido ou palavra destacada. Nao renomear o projeto.
- Titulos slab-serif fortes com espacamento ligeiramente fechado: aproximadamente 40 a 54 px no desktop, 32 a 40 px no mobile e 24 a 32 px em secoes. Corpo com entrelinha proxima de 1.6 e linhas geralmente abaixo de 75 caracteres.
- Container central de aproximadamente 1100 px, margens de 20 a 32 px, titulos e explicacoes alinhados a esquerda. Cabecalho compacto e arredondado, superficies discretas com raios de 6 a 10 px, bordas finas e sombras quentes sutis. Upload branco, espacoso e com convite centralizado.
- Duas colunas apenas quando justificadas pelo conteudo, uma em telas pequenas. Preservar controles independentes do dominio.
- Controles com pelo menos 44 px de altura, foco visivel, contraste adequado, erros e carregamento legiveis, reduced-motion e ausencia de rolagem horizontal.
- Descrever processamento de dados honestamente. Nao afirmar execucao apenas no navegador ou ausencia de nuvem sem verificar a arquitetura real.
- Validar larguras de 1440, 768, 390 e 320 px quando possivel, alem de tipos, build e testes.

## Desenvolvimento

- Stack: React, TypeScript e Vite. Componentes e CSS proprios.
- Servico local: Node.js 22 ou posterior, APIs nativas, FFmpeg/ffprobe e yt-dlp como processos separados, sem shell para argumentos do usuario.
- `npm run setup:tools`: instalar ferramentas locais em Linux/WSL, sem sudo, com SHA-256 verificado. Sem custos ou configuracao no Google.
- `npm run dev`: iniciar Vite em 127.0.0.1:5173 e servico local em 127.0.0.1:4318. Nao expor a API na rede.
- `npm run check`: verificar tipos.
- `npm run build`: gerar o build de producao.
- `npm test`: executar os testes de interface com Playwright.
- `npm run test:server`: validar parser, API, seguranca e FFmpeg com video sintetico. Testes nao devem baixar videos reais automaticamente.
