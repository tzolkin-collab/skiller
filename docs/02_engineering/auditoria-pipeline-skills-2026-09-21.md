# Auditoria do pipeline de skills — 21/09/2026

> Somente leitura: nenhum código de produto foi alterado e nenhum dado do banco foi escrito.
> Números de banco vêm de `SELECT`s em `skills`, `skill_videos` e `pipeline_logs`.
> Preços e limites vêm das páginas oficiais linkadas. `🟡 HIPÓTESE` = estimativa ainda não medida.

## Resumo

1. **O pipeline não gera uma skill com sucesso desde 25/08.** Desde então: 28 execuções, 0 sucessos.
2. **Lento por desenho:** vídeos processados um a um, e cada um obriga o modelo a *reescrever a transcrição inteira* (~75 s/vídeo).
3. **Falha por retry cego:** a fila tenta 3× qualquer erro (inclusive os que nunca passam) e cada tentativa refaz tudo.
4. **Qualidade:** das 30 skills `completed`, 9 são teste ou vazias (5 sem nenhum vídeo processado, 4 stubs criados via MCP) e só 6 são saídas reais do pipeline atual. Conectores são decorativos e a rastreabilidade não é resolvível.
5. **Fontes:** o GitHub está quebrado neste `.env` (token inválido → 401 até em repo público). O "Google" do bot é o grounding do Gemini; as chaves `GOOGLE_SEARCH_*` estão vazias, e essa API fechou para novos clientes.

## 1. Como a geração funciona hoje

`routes/skills.ts` cria a linha em `skills` e enfileira (BullMQ, fila `skill-generation`). O worker (`queue/worker.ts`) faz:

| Passo | Onde | O que acontece |
|---|---|---|
| 1. Resolver fontes | `worker.ts:150-177` | Playlist/vídeo via YouTube Data API |
| 2. Transcrição | `worker.ts:229`, `services/transcript.ts` | Pacote `youtube-transcript` (scraping do site). Faz uma requisição "sonda" só para descobrir os idiomas e depois a real; até 3 tentativas (1 s, 2 s) |
| 3. Extração (map) | `worker.ts:241`, `services/gemini.ts:377` | 1 chamada Gemini 2.5 Flash por vídeo → "card" com conceitos, resumo, snippets **e `transcriptParagraphs`** |
| 4. Síntese (reduce) | `worker.ts:310`, `gemini.ts:442` | 1 chamada com **todos** os cards → documento estruturado (princípios, módulos, comandos, conectores, guia) |
| 5. Portões | `lib/persist-skill.ts` | Zod → sanitização → render (`lib/renderers.ts`) → utilidade → grava |
| 6. Crédito | `worker.ts:375`, `lib/credits.ts` | Debita créditos e grava `pipeline_logs` |

Fontes `github` (só o README, `services/github.ts`) e `google_search` (Gemini + `googleSearch`, `gemini.ts:279`) pulam os passos 1–2.

## 2. Por que demora e por que falha

### Medido (62 execuções do worker)

| Métrica | Valor |
|---|---|
| Sucesso / falha | 25 / 37 |
| Tempo médio de uma execução bem-sucedida | 238 s |
| Tempo médio por vídeo | 75 s |
| Tokens médios (entrada / saída) por execução | 80,7 mil / 16,9 mil |
| Última execução com sucesso | 25/08 |

Por dia (neste banco): 10, 12, 13, 14 e 17/08 concentram 22 sucessos (17/08 também teve 8 falhas); 21, 24 e 25/08 somam mais 3 sucessos; **03/09 (3), 07/09 (3) e 21/09 (22): só falhas.** 🟡 Se produção usa outro banco, o quadro dela pode ser diferente.

### Causas de falha (com contagem)

| Causa | Evidência | Onde nasce |
|---|---|---|
| YouTube bloqueia o IP do servidor ("too many requests from this IP") | 3 vídeos em 21/09 → "no knowledge extracted" | `services/transcript.ts` |
| Vídeo sem legenda ("Transcript is disabled") | 4 vídeos, 03–07/09 | idem |
| `duplicate key … skill_video_unique` | 12 das 22 execuções de 21/09 (mesmo skill `a8928b4e`) | `worker.ts:217` faz `insert`, não `upsert`; retry esbarra nas linhas já criadas |
| Gemini 503 "high demand" | 2 vídeos | `gemini.ts:359` só reenvia em 429 |
| JSON truncado ("Unterminated string … 166018") | 1 vídeo | saída do modelo estoura o limite |
| Schema reprovou na síntese (`connectors.0.reason ≤ 200`) | 1 execução: US$ 0,11 e 455 s perdidos | limite do Zod (`skill-document.ts:107`) não consta no prompt nem no schema do provider |
| Sanitizador bloqueou a skill inteira (`prompt-exfiltration` em snippet de código) | 2 execuções, US$ 0,25 perdidos | `lib/sanitize.ts` |
| Fila refaz tudo 3× em erro permanente | `queue.ts:20`; 22 execuções de um único skill em um dia | `attempts: 3` sem distinguir transitório de permanente |

### Causas de lentidão

1. **A extração é limitada pela saída do modelo.** O card inclui `transcriptParagraphs`, que pede ao Gemini para reescrever a transcrição inteira em parágrafos (`prompts/extraction.ts`, regra 6). Nos 7 vídeos com idioma gravado (os mais recentes) o card tem em média 32 mil caracteres para 24,5 mil de transcrição (**1,3× a entrada**): o passo "extrair" expande em vez de comprimir. Os 29 mais antigos tinham card de ~5,7 mil para ~70 mil de transcrição 🟡 (presumo que antes de `transcriptParagraphs` existir). Tokens de saída são os mais lentos e caros.
2. **Sequencial.** `worker.ts:198` processa um vídeo por vez. O `concurrency: 4` da fila vale entre *jobs*, não entre vídeos.
3. **Síntese recebe o card inteiro** (`gemini.ts:456`: `JSON.stringify(cards, null, 2)`), incluindo os parágrafos reescritos, que ela não usa.
4. **Sem cache global** de transcrição/card por `videoId` (hoje só 2 duplicatas em 36 vídeos; cresce com o uso).
5. **Vídeo longo é truncado em silêncio:** `MAX_TRANSCRIPT_LENGTH = 150000` (`gemini.ts:357`). Entre os vídeos que falharam depois de a transcrição ser baixada, a média era ~410 mil caracteres (contra ~70 mil nos que passaram; amostra pequena); a skill cobriria só o começo.
6. **Busca do YouTube (`routes/youtube.ts`):** cada busca é `search.list` (100 unidades de cota, o próprio repo documenta) + `videos.list` + `channels.list`, em série e sem cache. Com a cota padrão de 10.000 unidades/dia isso dá ~100 buscas/dia para o produto todo. A "página 2" é a mesma busca com " part 2" anexado ao texto (`youtube.ts:101`), não paginação real. 🟡 Latência de tela não medida.

### Inconsistência de custo

`gemini.ts:178` calcula custo a US$ 1,50/7,50 por 1M tokens ("gemini-3.6-flash"), mas a chamada é `gemini-2.5-flash`, que a [página de preços](https://ai.google.dev/gemini-api/docs/pricing) lista a US$ 0,30/2,50. Nas médias acima: registrado ≈ US$ 0,25, real ≈ US$ 0,066 (**~3,7×**). Com `MARKUP = 5` (`credits.ts`), uma skill de 5 vídeos (`a44726ed`) custou ~266 créditos, quase o teste inteiro de 300. Se a margem é intencional, ok; se é constante velha, o usuário paga ~3,7× a mais do que deveria.

## 3. Plano de otimização (prioridade e ganho)

Ganhos marcados 🟡 são estimativas a validar com A/B de 3 vídeos.

**P0 — confiabilidade (sem isso nada mais importa)**
1. **Plano B de transcrição pelo Gemini com a URL do vídeo.** *Testado:* um dos vídeos que falharam com "Transcript is disabled" foi lido por URL (3 primeiros minutos: 24 s, 18,6 mil tokens ≈ US$ 0,01; leu a fala e o texto na tela). Vídeos públicos apenas; no plano gratuito, até 8 h de vídeo/dia ([docs](https://ai.google.dev/gemini-api/docs/video-understanding)); ~100 tokens/s → ~US$ 0,11 de entrada por hora de vídeo no 2.5 Flash (mais a saída). Fluxo: transcrição primeiro (~30× mais barata), Gemini-por-URL só quando falhar.
2. **Classificar erros:** transitório (429/503/rede) → retry com backoff + jitter e modelo alternativo; permanente (schema, sanitização, sem transcrição) → falha imediata, sem refazer.
3. **Idempotência:** `upsert` em `skill_videos` e **retomar de onde parou** (pular vídeos `completed`).
4. **Reparo em vez de descarte:** se o Zod reprovar, uma segunda chamada devolvendo os erros ao modelo; declarar `maxLength`/`minItems` no schema do provider e no prompt.
5. **Sanitizador em snippet:** trocar "bloqueia a skill" por "remove o snippet e avisa" (decisão de segurança sua).

**P1 — velocidade**
6. **Parar de pedir a transcrição reescrita ao LLM:** agrupar parágrafos por lacuna de tempo no código e pedir ao modelo só `keyMoments[{start,label}]`. 🟡 saída de ~10 mil para ~2–3 mil tokens/vídeo; ~75 s → ~20 s.
7. **Concorrência entre vídeos** (3–5, com limite global por causa de rate limit). 🟡 fase de extração ÷3–4.
8. **Tirar os parágrafos do card antes da síntese.** 🟡 menos entrada, menor latência.
9. **Cachear por `videoId`** (transcrição + card). 🟡 ganha com uso.
10. **Vídeo longo:** dividir em janelas (~30 min) em vez de truncar.
11. **Busca do YouTube:** cache de 10–30 min por consulta e `pageToken` real.

Combinado (6+7): 🟡 5 vídeos de ~340 s para ~40–60 s.

**P2:** map-reduce hierárquico para playlists grandes (21 vídeos hoje vão num prompt só); Batch API (50 % de desconto, não interativo); reavaliar modelo (3.7/3.8 Flash a US$ 0,75/3,75 até 31/12/2026) só depois de ter um conjunto de avaliação.

## 4. Auditoria de qualidade das skills

### Inventário

| | Qtd |
|---|---|
| `completed` | 30 |
| **com documento estruturado** | 11 |
| ↳ saídas reais do pipeline atual (com vídeos processados) | **6** (`255174d5`, `a44726ed`, `7c0ccc6a`, `d22388a0`, `5bb5421a`, `d51a27df`) |
| ↳ criadas via MCP, com 1–3 princípios e 1 comando (uma se chama "Teste final do espelho") | 4 |
| ↳ do YouTube, mas com 0 vídeos processados (`ab03d04a`) | 1 |
| **legado sem documento** (não re-renderiza para outros formatos, sem nicho/conectores) | 19 |
| ↳ fixtures de teste ("CONTEUDO PRIVADO DO FREE/PRO", 23–24 bytes, 0 vídeos) | 2 |
| ↳ fabricadas: 0 de 1 vídeo processado, mas 2,3–2,8 mil caracteres (de antes do portão) | 2 (`f40a64eb`, `60c516b0`) |
| ↳ demais, com conteúdo de vídeos reais em formato antigo | 15 |

Sem nenhum vídeo processado e ainda `completed`: 5 (as 2 fixtures, as 2 fabricadas e `ab03d04a`).

### Nas ~6 reais

| Critério | Achado |
|---|---|
| Princípios | 130–220 caracteres, imperativos e específicos ao tema. Bons. |
| Citação de fonte | Só as 2 mais novas citam (`[Source: Video 1 @ 26s]`). **"Video 1" não resolve para lugar nenhum**: o render não emite lista de fontes. Rastreabilidade só na aparência. |
| Módulos (conhecimento de referência) | As 2 mais novas têm **0 módulos** (24 e 25/08). O commit `b5e5ede` (03/09) tornou `modules` obrigatório no schema do provider, mas nenhuma skill foi gerada depois, então **a correção nunca foi observada**. E `modules: []` continua válido (`skill-document.ts:140`, sem `min(1)`). |
| Conectores | O trio `sequential-thinking`/`memory`/`fetch` aparece em 4 de 11. Quase nunca citados nos passos dos comandos (heurística por texto: 0–1 de 2–5), ou seja, decorativos. O render escreve só o **id** (`renderers.ts:64-73`); não há pacote, URL nem instrução de instalação. |
| Comandos | Passos plausíveis mas abstratos ("Instrua o usuário a…"); escritos como roteiro para o humano, não para o agente executar com ferramentas. |
| Nicho | Nulo em 9 de 11 (corrigido em 03/09, também não observado). |

### Diversidade de situações e "conectores em apps válidos"

- **Um prompt para todo assunto**, e a lista fechada de 18 conectores é toda de desenvolvimento. Os nichos aceitos incluem `marketing`, `sales`, `traffic`, `finance`, `design`, mas não há Gmail, Calendar, Drive/Sheets, HubSpot/Pipedrive, WhatsApp, Meta/Google Ads, GA4, Shopify, Linear/Jira.
- **Validade:** 7 dos 18 ids (`postgres`, `sqlite`, `slack`, `sentry`, `github`, `gitlab`, `puppeteer`) são servidores de referência hoje em [`modelcontextprotocol/servers-archived`](https://github.com/modelcontextprotocol/servers-archived) ("no longer maintained"); `@modelcontextprotocol/server-postgres` está deprecado no npm desde 10/07/2025. Há substitutos de fornecedor (o [registro oficial](https://registry.modelcontextprotocol.io/v0/servers) lista `com.gitlab/mcp`, `com.stripe/mcp`, `com.figma.mcp/mcp`, `com.cloudflare.mcp/mcp`; para `puppeteer` há uma única entrada, de Android), mas o id sozinho não aponta para nenhum.
- **Conseguem interpretar situações diversas?** Não há como afirmar: não existe conjunto de avaliação, e o pipeline não produz skill há 4 semanas.

### Proposta de avaliação

Conjunto de ~10 fontes em nichos diferentes; nota por (a) fidelidade, cada princípio ligado a um trecho/URL real; (b) executabilidade, cada comando roda com os conectores declarados; (c) conector válido, id resolvido no registro MCP (grátis, testado: responde sem chave, com URL remota e status); (d) cobertura de módulos. Depois, teste funcional: mesma tarefa com e sem a skill.

## 5. Fontes de pesquisa

### GitHub (informação estruturada)

*Testado ao vivo, sem chave:* a Search API devolve **82 campos por repositório**. Úteis: `full_name`, `description`, `homepage`, `owner`, `language`, `topics`, `license`, `stargazers_count`, `forks_count`, `watchers_count`, `open_issues_count`, `size`, `created_at`, `pushed_at`, `archived`, `is_template`, `has_discussions`, `default_branch`, `score`. Limites medidos sem token: busca 10/min, REST 60/h.

Complementos por repositório (chamadas extras; REST documentado, não testados um a um): linguagens (`/languages`), contribuidores, releases com `download_count` por arquivo, `/community/profile`, README (já usado).

**"Mais baixados":** repositório não tem downloads. Como ranquear por download de verdade: achar o pacote (`package.json` / `pyproject.toml`) e consultar o registro. *Testado, grátis, sem chave:* npm (`api.npmjs.org/downloads/point/last-month/<pkg>` → `@modelcontextprotocol/sdk` = 189,9 M) e PyPI (`pypistats.org/api/packages/<pkg>/recent` → `fastapi` = 363,1 M/mês). Sem pacote, cai para stars. Não existe "trending" oficial; dá para aproximar com `created:>data` + `sort=stars`, ou guardar snapshots diários de stars 🟡.

**Bloqueio atual:** `GITHUB_TOKEN` do `.env` retorna **401 Bad credentials**, e `services/github.ts:10` envia o cabeçalho sempre que a variável existe. Testado: README público de `vercel/next.js` → 200 sem token, **401 com token**. Enquanto o token for inválido, toda skill de GitHub falha. Um token válido sobe os limites (documentado: 30/min de busca, 5.000/h REST 🟡 não medido).

### Google (busca central para usuário e bot)

Métodos disponíveis:

| Método | Custo | Teste grátis | Veredito |
|---|---|---|---|
| **Custom Search JSON API (Google)** | 100/dia grátis, US$ 5/1.000 ([doc](https://developers.google.com/custom-search/v1/overview)) | Chaves do `.env` **vazias** | ❌ Fechada para novos clientes, **encerra em 01/01/2027** |
| **Grounding do Gemini** (já é o que existe) | 2.5: 1.500 req/dia grátis, depois US$ 35/1.000; 3.x: 5.000/mês grátis, depois US$ 14/1.000 ([preços](https://ai.google.dev/gemini-api/docs/pricing)) | Usa a chave atual | ✅ para o bot; mas devolve resposta sintetizada e as fontes são descartadas |
| **Serper** (ranking do Google) | 2.500 consultas grátis, sem cartão ([site](https://serper.dev)); preço pago não consta na página | Precisa criar conta | ✅ candidato à barra de busca |
| **Tavily** (feito para agentes) | 1.000 créditos/mês grátis, sem cartão; US$ 0,008/crédito ([preços](https://www.tavily.com/pricing)) | Precisa criar conta | ✅ candidato ao bot |
| **Brave Search API** | US$ 5/mês de crédito (≈1.000 req), **exige cartão**; US$ 5/1.000 ([site](https://brave.com/search/api/)) | Precisa cartão | 🟡 só se aceitar cartão |
| Vertex AI Search | US$ 1,50–4,00/1.000 (fontes de terceiros 🟡) | — | ❌ é busca em até 50 domínios, não a web aberta |
| Raspar o Google direto | — | — | ❌ CAPTCHA e termos; frágil |

**Desenho proposto:** um único endpoint `GET /api/search` com adaptador de provedor, cache (Redis, 24 h) e limite por usuário. Consumido pela barra central da UI; por uma nova ferramenta MCP `skiller_search_web` (mesmo portão `connectors.mcp`); e pela fonte `google_search` do worker, que passaria a buscar os N primeiros resultados, ler cada página (`lib/web-fetch.ts`, que já tem proteção contra SSRF) e extrair cards **com URL de procedência real**, em vez da resposta opaca do grounding.

## 6. Decisões que dependem de você

1. **Aprovar o P0** (itens 1–5 da seção 3)? Recomendo começar por ele.
2. **Custo:** manter o preço de US$ 1,50/7,50 por 1M tokens na conta de créditos, ou alinhar ao modelo realmente chamado?
3. **Busca:** criar contas gratuitas no Serper e no Tavily (sem cartão; conta é ação sua) e colocar `SERPER_API_KEY` e `TAVILY_API_KEY` no `.env`. Com elas rodo a comparação nas mesmas 10 consultas + grounding do Gemini (latência, qualidade, custo).
4. **GitHub:** gerar um novo `GITHUB_TOKEN` (somente leitura pública basta). Confirmar o ranking "baixados" via npm/PyPI/releases, com stars como reserva.
5. **Sanitizador:** aceitar remover só o snippet sinalizado em vez de bloquear a skill inteira?
6. **Legado:** as 9 skills de teste/vazias (2 fixtures, 2 fabricadas, `ab03d04a`, 4 stubs MCP) devem ser apagadas? As 15 legadas com conteúdo real devem ser regeneradas no formato novo? (Não apaguei nada.)

## 7. Andamento

### P0 implementado (21/09, sem commit)

| O quê | Onde |
|---|---|
| Classificação de erro transitório/permanente | `lib/llm-errors.ts` (novo) |
| Retry com backoff exponencial + jitter (4 tentativas); modelo de reserva `gemini-2.5-flash-lite` (`GEMINI_FALLBACK_MODEL`), só na extração | `services/gemini.ts` |
| **Plano B:** quando a transcrição falha, o Gemini lê o vídeo pela URL (teto de 60 min, `VIDEO_URL_FALLBACK_MAX_MIN`) | `lib/video-card.ts` (novo), `services/gemini.ts`, `prompts/extraction.ts` |
| Transcrição não repete erro definitivo ("disabled", "too many requests"); vai direto ao plano B | `services/transcript.ts` |
| Upsert em `skill_videos` + **retomada** (card pronto é reaproveitado; o `delete` inicial só roda na 1ª tentativa) | `queue/worker.ts` |
| Erro permanente não volta para a fila (`UnrecoverableError`); backoff da fila de 1 s para 5 s | `queue/worker.ts`, `queue/queue.ts` |
| Reparo da síntese (1 chamada extra com a lista de erros); `modules ≥ 1` exigido na síntese; limites de tamanho agora no prompt | `services/gemini.ts`, `prompts/synthesis.ts` |
| `GITHUB_TOKEN` recusado (401): repete sem token | `services/github.ts` |

**Verificação:** `tsc` limpo; 23 testes isolados passando (classificação, retry, modelo de reserva, plano B, reparo); ESLint sem erro novo (o `worker.ts` mantém 3 avisos antigos de import sem uso).

**Teste real do plano B** (vídeo `hLJTcVHW8_I`, 412 s, transcrição forçada a falhar; duração e Gemini reais): 31–51 s por vídeo, ~42,9 mil tokens de entrada e ~4–5 mil de saída, custo real ≈ US$ 0,024 (o app contabilizaria ≈ US$ 0,10). O card passou no Zod e capturou um trecho de código que só aparecia na tela.

**Achado do teste:** o modelo inventa conteúdo depois do fim do vídeo. Sem proteção, 7 de 24 parágrafos vieram com tempo até 652 s num vídeo de 412 s. Informar a duração exata no prompt **não bastou** (ainda vieram 8–9 itens além do fim em duas execuções); o filtro em código (`limitarAoVideo`) descarta o que passa do fim e limita o `endTime`. É necessário: a UI usa esses tempos como botões de "pular para".

**Fora do P0 / não feito:**
- Sanitizador que remove só o snippet (item 5, decisão sua).
- Todo o P1 (concorrência entre vídeos, tirar `transcriptParagraphs` do LLM, cache, busca do YouTube).
- Execução real de um job completo (fila + banco): escreveria linhas no banco. A lógica de banco (upsert, retomada, `attemptsMade`) foi só revisada e tipada, não executada.
- 🟡 Não consegui reproduzir daqui o erro "Transcript is disabled": a transcrição de `hLJTcVHW8_I` funcionou (186 segmentos) na máquina de dev. Isso reforça que o bloqueio é do IP do servidor, e é exatamente o caso que o plano B cobre.

**Custo:** o plano B é caro em créditos por causa da constante de preço já apontada (seção 2): ≈ 50 créditos para um vídeo de 7 min e ~300 para uma hora, quase o teste inteiro. Além disso `readUsage` (`gemini.ts`) ignora `thoughtsTokenCount`, tokens de raciocínio cobrados como saída (1.172 contra 633 de saída visível no teste), então parte do custo real nem entra na conta. Os dois erros vão em sentidos opostos; vale ajustar juntos (decisão 2).

## 8. Busca: medido com as chaves do `.env` (8 consultas, pt/en)

| | Serper | Tavily | Grounding do Gemini |
|---|---|---|---|
| Latência mediana | **0,9 s** | 2,4 s (uma de 6,3 s) | 3,6 s |
| Resultados por consulta | 8–10, todos com trecho | 10, todos com trecho | 3–9 fontes + resposta sintetizada |
| Localização | `gl=br`/`hl=pt-br` respondido | sem parâmetro de país | segue o texto da consulta |
| Devolve | links, trechos, posição do Google | links + conteúdo já extraído | resposta em texto + fontes |
| Custo do teste | 8 créditos (de 2.500) | 8 créditos (de 1.000/mês) | 8 chamadas (de 1.500/dia) |

Leitura: **Serper para a barra de busca** (o mais rápido e é o ranking do Google); **Tavily para o bot** quando o objetivo é ler conteúdo (já vem extraído); grounding continua útil como resposta pronta, mas não substitui uma lista de resultados. 🟡 Qualidade de relevância não foi avaliada além de olhar os 3 primeiros domínios de uma consulta.

**Risco a decidir:** Serper e similares obtêm os resultados raspando o Google. Em 19/12/2025 o Google processou a SerpApi por isso ([Search Engine Journal](https://www.searchenginejournal.com/google-files-dmca-suit-targeting-serpapis-serp-scraping/563847/)); o tribunal depois rejeitou as duas alegações principais de DMCA, com prazo de 21 dias para o Google reapresentar uma mais estreita ([Search Engine Land](https://searchengineland.com/google-loses-key-dmca-claims-against-serpapi-in-scraping-lawsuit-483185)). O risco recai sobre o fornecedor, mas é uma dependência real: convém manter o adaptador de provedor trocável (Tavily/Brave como reserva).

**Outras formas oficiais de usar a busca do Google:**
1. **Grounding com Google Search** (Gemini API): o que já existe. Devolve fontes; a documentação manda seguir os Termos ao exibir as "sugestões de busca" (`searchEntryPoint`, que veio preenchido nos testes).
2. **Web Search Service API**: devolve resultados do Google em JSON, mas só por acordo de parceria (projeto no Google Cloud + chave + client id de parceiro). O Google mandou quem precisa de web aberta preencher um formulário de interesse ([SEJ](https://www.searchenginejournal.com/google-documents-partner-only-api-for-full-web-search-results/589194/)). Vale enviar o formulário: custo zero, e é o único caminho oficial para a web aberta.
3. **Vertex AI Search / Agent Search**: busca em até 50 domínios ou no seu próprio conteúdo, não na web aberta.
4. 🟡 Não verifiquei se o widget embutível do Programmable Search Engine continua existindo depois de 01/01/2027.

## 9. GitHub: webhook e permissões

**Webhook: hoje nenhum é necessário.** O Skiller só *puxa* dados (README e busca) quando o usuário pede, e não há rota de webhook do GitHub no backend (só o login OAuth). `GITHUB_WEBHOOK_SECRET` está vazio no `.env` e pode continuar assim. Um webhook só faz sentido para a funcionalidade "atualizar a skill quando o repositório mudar":

- **Repositório de terceiros (público):** não dá para receber webhook (exige admin do repositório). A alternativa é consultar periodicamente com requisição condicional (`ETag`, respostas 304). 🟡 Não confirmei se o 304 deixa de contar no limite.
- **Repositório do próprio usuário:** GitHub App instalado pelo usuário nos repositórios escolhidos. Permissões do App: **Metadata: read** (obrigatória) + **Contents: read**. Eventos: **`push`** e **`release`**. URL: `https://<BACKEND_URL>/api/github/webhook`, conteúdo JSON, segredo em `GITHUB_WEBHOOK_SECRET`. A validação é HMAC-SHA256 do corpo **cru** contra o cabeçalho `X-Hub-Signature-256`, comparando com `crypto.timingSafeEqual` ([docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)), no mesmo molde da rota do Stripe.

**Permissão do `GITHUB_TOKEN`:** para o que existe hoje (README e busca de repositórios públicos) **nenhuma**. Token fine-grained com acesso "Public repositories (read-only)" e zero permissões extras (ou classic sem nenhum escopo). Serve só para subir o limite: sem token medi 10 buscas/min e 60 req/h; com token válido a documentação do GitHub dá 30/min e 5.000/h 🟡 (não medi, o token atual está inválido: 401).
Repositório **privado** exigiria Contents: read + Metadata: read, e por isso deve ser opt-in por GitHub App, sem ampliar o escopo do login (que hoje só pede identidade e e-mail).

## 10. Decisões que continuam abertas
2 (preço/créditos, agora com o item de `thoughtsTokenCount`), 4 (ranking "baixados"), 5 (sanitizador), 6 (limpar legado). Novas: (7) enviar o formulário de interesse da Web Search API do Google; (8) confirmar Serper na barra e Tavily no bot; (9) gerar um `GITHUB_TOKEN` novo.
