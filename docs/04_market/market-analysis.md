# 5. Análise Mercadológica — Skiller

> Documento de mercado e go-to-market. Escopo: público-alvo, dimensionamento (TAM/SAM/SOM), concorrência, canais, monetização e riscos de posicionamento.
> Data de referência: agosto de 2026. Números de mercado citados com fonte; estimativas próprias estão explicitamente marcadas como **[estimativa Skiller]**.

---

## 5.0 Resumo do produto (contexto)

O Skiller transforma playlists/vídeos do YouTube (e repositórios git) em **Skills** — pacotes estruturados no padrão `SKILL.md`, versionáveis via Git e importáveis em assistentes de IA de código (Claude Code, Cursor, Codex, Gemini CLI). Modelo comercial baseado em **créditos** com markup de ~5x sobre o custo de LLM (custo interno ~US$0,90/playlist), planos por assinatura e integração MCP/OAuth com conectores (Slack, Notion, GitHub).

O produto vive na interseção de três mercados: **assistentes de IA para código**, **gestão de conhecimento (KM)** e **e-learning/vídeo-aprendizagem**. Essa interseção define tanto a oportunidade quanto o risco central de posicionamento (ver §5.7).

---

## 5.1 Segmentos de público-alvo (personas)

### Persona A — "O Autodidata Técnico" (dev que aprende por YouTube)
- **Quem é:** desenvolvedor(a) individual, freelancer ou de empresa pequena/média, que consome tutoriais e playlists técnicas no YouTube e já usa assistentes de IA no dia a dia.
- **Dores:** conhecimento assistido em vídeo "evapora" — não é buscável nem referenciável; retrabalho ao reassistir; dificuldade de trazer aquilo que aprendeu para dentro do fluxo de codificação com IA.
- **Contexto de uso:** individual, self-service, adoção bottom-up. Quer transformar uma playlist em referência e "plugar" como skill no seu agente.
- **Disposição a pagar:** baixa a média — âncora mental é a de ferramentas de resumo de vídeo (US$5–10/mês). Paga por conveniência e por integração real com o agente de código. **[estimativa Skiller: US$8–20/mês]**

### Persona B — "O Curador de Conhecimento / Tech Lead" (monta currículo/onboarding)
- **Quem é:** tech lead, staff engineer, educador ou responsável por DevRel/enablement que monta trilhas de aprendizagem e material de referência para o time.
- **Dores:** padronizar conhecimento tribal; acelerar onboarding; converter playlists recomendadas em material reutilizável e versionado para a equipe.
- **Contexto de uso:** semi-coletivo — gera skills que serão compartilhadas/versionadas. Valoriza saída em formato Git e múltiplos formatos (Claude/Cursor/genérico).
- **Disposição a pagar:** média a alta — decisão com orçamento de time; associa valor a horas de onboarding economizadas. **[estimativa Skiller: US$20–50/usuário/mês ou pacote de time]**

### Persona C — "O Criador de Skills / Prompt-Engineer" (produtor de conteúdo para agentes)
- **Quem é:** desenvolvedor(a) ou consultor(a) que empacota conhecimento em skills/plugins para distribuir (marketplaces, clientes, comunidade).
- **Dores:** produzir skills de qualidade em escala é trabalhoso; extrair conhecimento de fontes (vídeo, docs, repos) e estruturá-lo consome tempo.
- **Contexto de uso:** intensivo, orientado a volume e a formato-alvo. É quem mais explora `targetFormat` e o empacotamento Git/MCP.
- **Disposição a pagar:** alta se houver ganho de produtividade claro (ferramenta de trabalho). Sensível a qualidade da síntese e a limites de uso. **[estimativa Skiller: US$30–99/mês, uso intenso de créditos]**

### Persona D (secundária/futura) — "L&D / Enablement corporativo (não-dev)"
- **Quem é:** equipe de treinamento que quer converter vídeo interno/externo em material de referência estruturado.
- **Dores:** fechar *skill gaps* (61% dos profissionais de L&D corporativo colocam isso como meta nº 1 de treinamento — Fact.MR). Vídeo já é ~72% do consumo de cursos digitais.
- **Contexto de uso:** B2B, ciclo de venda mais longo, requisitos de segurança/privacidade.
- **Disposição a pagar:** alta por assento, mas exige maturidade de produto (SSO, permissões, conteúdo privado) que o Skiller ainda não tem. **[estimativa Skiller — mercado de expansão, não de entrada]**

---

## 5.2 Priorização — ICP e early adopter mais provável

**ICP de entrada (early adopter): Persona A + Persona C** — o desenvolvedor que já usa agentes de IA e o criador de skills. Justificativa:

- **Timing de ecossistema:** o padrão `SKILL.md` virou padrão aberto em dez/2025 (agentskills.io) e já roda em ~40 produtos; diretórios comunitários indexam de 12 mil a ~1,9 milhão de skills — a demanda por *produção* de skills de qualidade está nascendo agora (Anthropic; SkillsMP; Agentman).
- **Adoção bottom-up, sem fricção de venda:** self-service, cartão de crédito, valor percebido imediato — coerente com o modelo de créditos já implementado.
- **Fit produto-mercado mais direto:** a saída multi-formato + empacotamento Git/MCP é exatamente o que essas personas consomem.

**Segundo estágio: Persona B (Tech Lead)** — mesma base técnica, mas com orçamento de time; caminho natural de *expansão de receita* (land-and-expand) uma vez validada a qualidade com A/C.

**Persona D (L&D corporativo)** fica como **mercado de expansão**, dependente de recursos enterprise (privacidade, SSO, conteúdo próprio) — não priorizar no go-to-market inicial.

---

## 5.3 Tamanho e crescimento do mercado (TAM / SAM / SOM)

> Os mercados-fonte têm forte dispersão entre consultorias (definições e escopos distintos). Apresento faixas, não pontos únicos, e cito a fonte de cada âncora.

### Mercados-fonte (2025–2026)

| Mercado | Tamanho 2026 (faixa entre fontes) | CAGR | Fontes |
|:--|:--|:--|:--|
| Assistentes de IA para código | ~US$10,3 bi (Grand View) a ~US$12,8 bi (setor) | ~15–37% (mediana ~22–27%) | Grand View; Mordor; SNS Insider |
| Software de gestão de conhecimento (KM) | ~US$16 bi (Mordor/Straits) a ~US$33 bi (MarkWide) | ~12% | Mordor; Fortune BI; Straits; Grand View |
| E-learning (global) | ~US$276–389 bi | ~11–20% | Mordor; CMI; Custom Market Insights |
| E-learning corporativo | ~US$132,6 bi | ~12,9% | Fact.MR |

### Base de usuários (bottom-up)

- **28,7 milhões** de desenvolvedores no mundo (2025/2026), projeção de **45 milhões** até 2030 (Statista/Evans Data via Future Processing).
- **90%** dos devs usam algum tipo de ferramenta de IA e **74%** usam ferramentas de IA específicas para código (JetBrains AI Pulse, jan/2026); 84% usam ou planejam usar IA no desenvolvimento (Stack Overflow 2025).
- **51%** usam ferramentas de IA de código diariamente. GitHub Copilot: 20 mi+ usuários totais, 4,7 mi pagantes (jan/2026). Claude Code aparece como ferramenta primária de ~28% dos devs.

### Estimativa TAM / SAM / SOM **[estimativa Skiller — bottom-up]**

- **TAM (topo):** universo de profissionais técnicos que poderiam pagar por conversão de conteúdo em conhecimento reutilizável/skills. Ancorando em ~28,7 mi de devs e adjacências (criadores, curadores L&D técnicos), a um ARPU hipotético de US$120/ano →
  **ordem de grandeza de US$3–4 bilhões/ano**. (Cabe dentro do mercado de assistentes de IA para código como categoria "camada de conhecimento".)
- **SAM (endereçável hoje):** devs que já usam IA para código **e** consomem vídeo-aprendizagem **e** produzem/consomem skills. ~28,7 mi × 74% (usam IA de código) ≈ **~21 mi**; recortando quem consome vídeo técnico e adota o padrão SKILL.md, estimo **~3–6 milhões de usuários**. A ARPU de US$120–240/ano → **SAM ≈ US$0,4–1,4 bi/ano**.
- **SOM (capturável em 3 anos):** com go-to-market bottom-up, PLG e conversão típica de nicho, capturar **20 mil–80 mil usuários pagantes** a ARPU ~US$150/ano → **SOM ≈ US$3–12 milhões de ARR**. Cenário-base conservador para uma operação enxuta: **~US$3–5 mi ARR**.

> Observação de método: TAM/SAM/SOM aqui são **estimativas próprias** derivadas das fontes citadas para dar ordem de grandeza — não substituem uma modelagem bottom-up com dados de funil reais. A maior incerteza é a taxa de conversão da base "usa IA de código" → "paga por geração de skills".

---

## 5.4 Concorrentes e produtos adjacentes

### Categoria 1 — Resumidores/notas de vídeo por IA (adjacente por baixo)
Eightify (US$4,99–9,99/mês), NoteGPT (US$9–9,99/mês, gera mapas mentais/flashcards/quizzes), NoteLM.ai, BibiGPT, Recall, SkipTheWatch.
- **O que fazem:** resumo, transcrição, notas, timestamps de um vídeo.
- **Gap:** produzem *resumo para humano ler*, não um **artefato executável/importável por agente**. Não versionam via Git, não empacotam em formato de skill, não fazem síntese *multi-vídeo* de uma playlist inteira em um documento único.

### Categoria 2 — Geração/criação de skills e prompts (concorrência mais direta em capability)
Anthropic **Skill Creator** (Q&A interativo que gera `SKILL.md`), skills open-source (claude-seo, xSeek), bundles de skills em marketplaces (Gumroad, GPT Store, MCP Hubs).
- **O que fazem:** ajudam a *estruturar* uma skill a partir de conhecimento que o usuário já tem, ou vendem skills prontas.
- **Gap:** exigem que o conhecimento **já exista** e que o usuário o traga. O Skiller parte de uma **fonte bruta não-estruturada (vídeo)** e faz extração + síntese + sanitização automatizadas. É "ETL de conhecimento", não apenas um editor/scaffold.

### Categoria 3 — Knowledge management para devs (adjacente por cima)
Notion AI, Mem, Recall, ferramentas de "second brain", wikis internos com IA.
- **Gap:** genéricos; não falam a língua de agentes (formato SKILL.md/MCP) nem otimizam a saída para consumo por IA de código.

### Diferenciação do Skiller (síntese)
1. **Fonte → artefato-para-agente:** único que faz o caminho completo *playlist bruta → skill executável em múltiplos formatos*.
2. **Síntese multi-fonte:** funde N vídeos (e repos git) em um documento estruturado, não N resumos soltos.
3. **Rigor de engenharia:** gates de qualidade e **sanitização anti-prompt-injection** (tratando conteúdo público como entrada hostil) — diferencial de confiança relevante num ecossistema onde "descoberta não é o gargalo; julgamento/curadoria é" (Agentman).
4. **Pronto para o ecossistema aberto:** saída em SKILL.md + empacotamento Git/MCP no momento em que o padrão explode em adoção (~40 produtos, Agent Plugins em ago/2026).

**Ameaça competitiva mais séria:** a própria Anthropic (e adjacentes) ampliar o Skill Creator para ingerir fontes externas, ou um resumidor de vídeo (NoteGPT) adicionar export "SKILL.md". A janela de diferenciação é a **qualidade da síntese multi-fonte + confiança/sanitização**.

---

## 5.5 Canais de aquisição por segmento

| Persona | Canais prioritários | Racional |
|:--|:--|:--|
| A — Autodidata dev | SEO de intenção ("transformar playlist em skill", "YouTube to SKILL.md"), Reddit (r/ClaudeAI, r/cursor), Hacker News, X/dev-Twitter, listagem em diretórios de skills/marketplaces | Bottom-up, PLG; onde o público já busca ferramentas |
| C — Criador de skills | Marketplaces e diretórios (Claude Skills directory, MCP Hubs), parcerias com autores de skills, programa de afiliados/creator | Distribuição onde o produtor de skills já opera |
| B — Tech Lead | Conteúdo técnico (blog/DevRel), estudos de caso de onboarding, comunidades de eng. leadership, expansão a partir de contas A/C dentro da empresa | Land-and-expand; prova social |
| D — L&D corporativo | Outbound/venda consultiva, parcerias com LMS, eventos de L&D | Só após recursos enterprise |

Alavanca transversal: **loop de conteúdo** — cada skill pública gerada pode virar página indexável (SEO) e prova de produto.

---

## 5.6 Monetização vs. disposição a pagar

Modelo atual (créditos + markup 5x) é adequado a PLG e alinha custo variável de LLM à receita. Recomendações por persona:

| Persona | Plano sugerido | Faixa | Encaixe |
|:--|:--|:--|:--|
| A — Autodidata | Free (com limite) + Pro individual | US$8–20/mês | Free tier essencial para competir com resumidores gratuitos; conversão por integração com o agente |
| C — Criador | Creator (créditos altos) | US$30–99/mês | Precifica por volume; risco de custo se abusar de multimodal/screenshots |
| B — Tech Lead | Team (assentos + créditos compartilhados) | US$20–50/assento | Requer workspace/compartilhamento |
| D — L&D | Enterprise (contrato) | sob consulta | Requer segurança/privacidade |

**Riscos de monetização:** (1) o público-âncora (Persona A) tem baixa disposição a pagar (referência US$5–10/mês dos resumidores) — o free tier precisa converter por valor de integração, não por resumo; (2) custo variável de LLM + Playwright/screenshots pode comprimir margem em uso intenso — o markup 5x protege, mas exige limites por plano; (3) créditos podem gerar fricção cognitiva — considerar planos "flat com fair use" para reduzir ansiedade de consumo.

---

## 5.7 Riscos e recomendações de posicionamento (go-to-market)

### Riscos
1. **Posicionamento ambíguo (o maior):** entre "resumidor de vídeo melhorado" e "gerador de skills para agentes". Cair no primeiro balde comoditiza o produto contra ferramentas de US$5/mês. **Recomendação: posicionar firmemente como camada de "conhecimento executável para agentes de IA", não como note-taker.**
2. **Dependência de plataforma:** Anthropic pode absorver a funcionalidade (Skill Creator ingerindo fontes). Mitigar com neutralidade multi-formato (Cursor/Codex/Gemini) e com o fosso de *qualidade de síntese + sanitização*.
3. **Dependência do YouTube:** termos de uso, rate limits e disponibilidade de transcript são risco operacional. Diversificar fontes (git já existe; docs/PDF/podcast como roadmap) reduz concentração.
4. **Qualidade percebida:** só 29% dos devs confiam na saída de IA (queda vs. 40% em 2024). Confiança é decisiva — os gates e a sanitização devem virar **argumento de marketing**, não só detalhe técnico.
5. **Baixa DAP do topo do funil:** monetizar Persona A isoladamente é difícil; a receita real tende a vir de C e B.

### Recomendações de GTM
- **Cunhar a categoria:** "de conteúdo bruto a skill confiável para seu agente". Mensagem única em landing, pricing e diretórios.
- **Entrar pelo ecossistema aberto (C):** distribuir via diretórios de skills e MCP Hubs; transformar o Skiller em fornecedor de skills de alta qualidade da própria comunidade.
- **Wedge → expansão:** conquistar o dev individual (A/C) e expandir para o time (B) com workspace/compartilhamento.
- **Confiança como diferencial:** publicar como o Skiller sanitiza e valida (anti-prompt-injection, gates) — vira vantagem num mercado onde curadoria é o gargalo.
- **Provar as métricas de valor:** tempo economizado por skill e taxa de skills usadas de fato pelo agente; usar em estudos de caso para B.

---

## Fontes

- Grand View Research — AI Code Assistants Market Report: https://www.grandviewresearch.com/industry-analysis/ai-code-assistants-market-report
- Mordor Intelligence — AI Code Generation and Developer Assistant Market: https://www.mordorintelligence.com/industry-reports/ai-code-generation-and-developer-assistant-market
- SNS Insider (via Yahoo Finance) — AI Code Assistant Market: https://finance.yahoo.com/news/ai-code-assistant-market-set-143000983.html
- Mordor Intelligence — Knowledge Management Software Market: https://www.mordorintelligence.com/industry-reports/knowledge-management-software-market
- Fortune Business Insights — Knowledge Management Software Market: https://www.fortunebusinessinsights.com/knowledge-management-software-market-110376
- Straits Research — Knowledge Management Software Market: https://straitsresearch.com/report/knowledge-management-software-market
- Mordor Intelligence — E-learning Market: https://www.mordorintelligence.com/industry-reports/global-elearning-market
- Fact.MR — Corporate E-Learning Market: https://www.factmr.com/report/corporate-e-learning-market
- Custom Market Insights — E-Learning Market: https://www.custommarketinsights.com/report/e-learning-market/
- NoteLM.ai — Best AI YouTube Video Summarizer Tools 2026: https://www.notelm.ai/blog/youtube-video-summarizer-ai
- BibiGPT — YouTube Video Summarizer Tools 2026: https://bibigpt.co/en/blog/posts/youtube-video-summarizer-tools-comprehensive-guide-2026
- Ekamoira — NoteGPT YouTube Summarizer Guide 2026: https://www.ekamoira.com/blog/notegpt-youtube-summarizer-complete-guide-to-features-limits-better-alternatives-2026
- Agentman — The Agent Skills Ecosystem in 2026: https://agentman.ai/blog/agent-skills-ecosystem-report-2026
- Totalum — Agent Skills Marketplace 2026: https://www.totalum.app/blog/agent-skills-marketplaces-2026
- Get Claude Skills — Agent Plugins Explained: https://www.getclaudeskills.com/blog/agent-plugins-explained
- Firecrawl — Best Claude Code Skills 2026: https://www.firecrawl.dev/blog/best-claude-code-skills
- JetBrains AI Pulse / adoção de devs (via Exceeds.ai): https://blog.exceeds.ai/ai-coding-tools-adoption-rates/
- Digital Applied — AI Coding Adoption 2026 (50 data points): https://www.digitalapplied.com/blog/ai-coding-adoption-statistics-2026-50-data-points
- Future Processing — How Many Software Developers Are There in the World: https://www.future-processing.com/blog/how-many-software-developers-are-there-in-the-world/

---

*Documento gerado em ago/2026. Números de terceiros conforme fontes; faixas refletem divergência entre consultorias. Itens marcados **[estimativa Skiller]** são modelagens próprias de ordem de grandeza e devem ser refinados com dados de funil reais.*
