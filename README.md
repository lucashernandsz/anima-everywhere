# Anima Everywhere

Cole um link do YouTube e um JSON com os trechos. Receba cortes em MP4,
nomeados pelo titulo de cada corte, em formato quadrado, horizontal ou vertical.
O processamento roda no seu computador, com yt-dlp e FFmpeg.

O projeto tambem inclui um estudio de audio experimental. A previa e ilustrativa;
a geracao de animacoes ainda nao foi implementada.

## Rodar localmente

Requer Node.js 22 ou posterior. Instalacao automatica das ferramentas em
Linux/WSL x64 ou arm64, com glibc >= 2.28, internet e `tar` com suporte a xz.

```sh
npm install
npm run setup:tools
npm run dev
```

Interface: **http://127.0.0.1:5173**. Servico local: `127.0.0.1:4318`.
Nao precisa de conta Google, OAuth, chave de API ou projeto no Google.

O instalador baixa cerca de 200 MB, verifica o SHA-256 publicado pelo fornecedor
e guarda os executaveis em `.tools/bin`, sem sudo. O espaco instalado e maior.
Versoes e hashes ficam em `.tools/provenance.json`; licencas, em `.tools/LICENSES.txt`.

Em outros sistemas, instale `ffmpeg`, `ffprobe` e `yt-dlp` no PATH ou defina
`FFMPEG_PATH`, `FFPROBE_PATH` e `YTDLP_PATH`. Windows nativo e macOS nao foram
validados. O instalador preserva ferramentas existentes; para atualizar,
encerre o servico e substitua os executaveis por versoes verificadas.

## Fazer cortes

1. Cole o link e a lista JSON, ou importe um arquivo `.json`.
2. Confira os tempos, titulos e nomes dos arquivos.
3. Escolha `1:1`, `16:9` ou `9:16` e o enquadramento.
4. Confirme sua autorizacao de uso e inicie o processamento.
5. Baixe os MP4s conforme ficarem prontos.

```json
[
  {
    "corte": 1,
    "titulo_hook": "Nome do meu corte",
    "segundos_inicio": 1473.84,
    "segundos_fim": 1505.399,
    "url_youtube": "https://www.youtube.com/watch?v=ag5CYQu_Yo0"
  }
]
```

`segundos_inicio` e `segundos_fim` devem aparecer juntos, como numeros, e tem
prioridade sobre `tempo_inicio` e `tempo_fim`. Os horarios aceitam `MM:SS`,
inclusive `66:15`, ou `HH:MM:SS`. A duracao vem do intervalo;
`duracao_segundos` e ignorado. Cada `url_youtube` prevalece sobre o link geral.
O parametro `t=` do link nao altera os tempos.

O botao de exemplo carrega os dez cortes de `src/cortes-exemplo.json`.
Nao inicia downloads sozinho.

Cada video distinto e baixado inteiro uma vez por exportacao. FFmpeg recodifica
os trechos em H.264/AAC a 30 fps: 720x720, 1280x720 ou 720x1280. Os decimais sao
preservados na entrada; a precisao final depende dos quadros. Por padrao, barras
pretas preservam a imagem inteira. O recorte central e opcional, sem rastreamento
de pessoas. O titulo vira nome de arquivo com numero e slug seguro, nao legenda.

## Limites e arquivos

- De 1 a 50 cortes por exportacao, com 0,1 a 180 segundos por corte.
- Fontes de ate 12 horas e 4 GB; download seleciona qualidade de ate 720p.
- Processamento sequencial, CPU-only, com duas threads de codificacao.
- Download limitado a uma hora; cada recorte, a 15 minutos.
- Armazenamento monitorado ate 8 GB. Nao e uma quota rigida; reserve espaco livre.
- Videos e cortes ficam em `.local-media`, fora do build e do Git.
- Ao encerrar um trabalho, originais e arquivos parciais sao removidos.
- Cancelar ou falhar preserva cortes concluidos. Excluir a exportacao apaga seus arquivos locais, nao os ja baixados.
- Recarregar a pagina recupera o trabalho enquanto o servico continua aberto. Reiniciar o servico perde os metadados e o acesso pela interface; arquivos sobreviventes ficam em `.local-media/job-<id>`.
- Trabalhos com mais de 24 horas sao limpos ao iniciar ou acessar a API. Baixe os resultados antes de fechar o servico.

## Uso e privacidade

Use apenas conteudo com direitos ou autorizacao e respeite os termos do YouTube.
Um video publico nao e, por isso, autorizado para download. A confirmacao na
interface nao substitui a autorizacao do titular nem os termos da plataforma.

yt-dlp nao usa a API oficial do YouTube. Downloads podem ser bloqueados ou exigir
atualizacao da ferramenta. O projeto nao extrai cookies, conecta contas, publica
videos nem contorna login, DRM, verificacoes anti-bot ou restricoes de acesso.
Videos privados, transmissoes ao vivo e outros bloqueios retornam erro.

O download consulta o YouTube e sua infraestrutura. A edicao e os arquivos ficam
no computador; nao ha envio a servicos de edicao. Nao e um aplicativo offline.
A API escuta apenas em loopback, valida Host/Origin e libera somente cortes
concluidos. O Vite bloqueia o acesso aos diretorios privados.

## Estudio de audio

Aceita arquivos locais de ate 80 MB, com reproducao, forma de onda e selecao
de 30 a 180 segundos. O audio de exemplo e sintetizado no navegador.
Os formatos aceitos dependem dos codecs do navegador.

Audio permanece no navegador. Apenas a configuracao do rascunho e salva em
localStorage; o arquivo nao e persistido. Estilos e previas sao exploratorios,
independentes do audio, sem geracao de animacoes ou exportacao de video.

## Desenvolvimento

React, TypeScript e Vite na interface; Node.js no servico local. Componentes e CSS
proprios, sem Dende. Fontes Zilla Slab e Inter locais, sem CDN. A interface inclui
controles por teclado, foco visivel e suporte a movimento reduzido.

```sh
npm run check
npm run build
npm run test:server
npx playwright install chromium
npm test
```

Testes do backend usam video sintetico, sem baixar videos reais. Os testes de
interface cobrem desktop e mobile. `npm run build` gera apenas a interface;
para usar `npm run preview`, mantenha `npm run server` aberto em outro terminal.

## Custo e licencas

As ferramentas locais funcionam sem pagamento, assinatura, creditos ou trial.
Precos e licencas sao assuntos separados; os termos do YouTube continuam valendo.

- [Fontsource: hospedagem local de fontes abertas](https://fontsource.org/docs/getting-started/introduction).
- [Zilla Slab: SIL Open Font License](https://raw.githubusercontent.com/google/fonts/main/ofl/zillaslab/OFL.txt).
- [Inter: SIL Open Font License](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt).
- [yt-dlp: Unlicense no codigo e GPLv3+ nos executaveis](https://github.com/yt-dlp/yt-dlp#release-files).
- [FFmpeg: LGPL/GPL conforme o build](https://ffmpeg.org/legal.html).
- [BtbN: builds gratuitos de FFmpeg](https://github.com/BtbN/FFmpeg-Builds).

O instalador usa FFmpeg GPL com libx264, sem a variante nonfree. yt-dlp standalone
tambem inclui codigo GPLv3+ e componentes com outras licencas. Os executaveis
rodam separadamente e nao entram no build web. Fontes e scripts de compilacao
estao nas referencias acima. Redistribuir binarios exige cumprir essas licencas
e avaliar patentes de codecs conforme a jurisdicao; isto nao e garantia juridica.
As licencas das fontes acompanham os assets do build.

Regras do projeto: `AGENTS.md`. Comando local: `.opencode/commands/anywhere-maker.md`.
