# 🚀 Skiller: Roadmap & Architecture Split

Este documento descreve a divisão de features entre a camada atual de desenvolvimento focada no desenvolvedor individual (**Skiller Pro**) e a visão de longo prazo para adoção corporativa que será desenvolvida no futuro (**Skiller Enterprise**).

---

## 🟢 1. Skiller Pro (Foco Atual / Devs Individuais)

O objetivo do plano Pro é ser um canivete suíço para engenheiros e makers que desejam escalar seu próprio conhecimento convertendo materiais (especialmente vídeos) em ferramentas para Agentes IA. O foco aqui é **Extração** e **Usabilidade Pessoal**.

### Features Principais
- **Motor de Extração Multimodal Básico:**
  - Ingestão focada em Playlists e Vídeos do YouTube.
  - Processamento assíncrono (MapReduce) via BullMQ para extrair resumos, transcrições e Key Concepts.
- **Geração de Assets (CAS - Content-Addressable Storage):**
  - Geração automática de `SKILL.md` (Documentação em Markdown otimizada para o LLM ler).
  - Geração de *Plugin Packages* com estrutura baseada em FileTree e blobs (`sha`).
- **Dashboard Premium (Estúdio de Análise):**
  - A interface que acabamos de refinar: Dark mode (Radiant Obsidian) com UI/UX premium.
  - **Aba de Transcrição:** Player embutido + texto limpo escrolável.
  - **Aba de Índice (Node Map):** Gráfico Interativo com física `react-force-graph-2d` mapeando de onde veio o conhecimento (Knowledge Sources) e o que ele gerou (Generated Artifacts).
- **Skiller MCP Local:**
  - Servidor MCP (Model Context Protocol) rodando na máquina do dev para permitir que o Claude Desktop / Cursor instale as skills geradas localmente.

---

## 🏢 2. Skiller Enterprise (Próximos Passos / B2B)

Esta frente tem o foco em **Memória Compartilhada**, **Distribuição em Larga Escala** e **Qualidade Profunda de Dados**. É aqui que entram os novos épicos arquiteturais para discutir com o Claude:

### A. Universal Knowledge Ingestion (Além do YouTube)
- Expandir os conectores do backend para suportar não só YouTube, mas **Repositórios do GitHub, PDFs, Confluence, Notion e Google Drive**.
- Os dados ingeridos entram na mesma arquitetura de "Sources" que o Node Map atual já suporta visualmente.

### B. Karpathy-style Indexing Pipeline & Shared Memory
- Substituir o armazenamento simples por um pipeline focado em qualidade (*Data Parsing* e *Data Cleaning* extremo).
- **Memória Compartilhada:** Implantação de um Vector Database (Pinecone, Weaviate ou PgVector). 
- O conhecimento extraído de uma skill será "embeddado" e conectado a um **Grafo de Conhecimento Global** da empresa, permitindo RAG (Retrieval-Augmented Generation) cruzado. O modelo conectará conceitos do Time de Frontend com as skills criadas pelo Time de Backend.

### C. Enterprise Internal Marketplace
- Uma "App Store" de Skills e Plugins interna para a empresa.
- Engenheiros podem buscar skills já processadas há meses por outros times e instalá-las com 1 clique (reaproveitamento do Content-Addressable Storage / Git-based system).
- **RBAC (Role-Based Access Control):** Quem pode criar skills, quem pode aprovar e quem pode instalar.

### D. Centralized MCP Gateway (O Hub Universal)
- A verdadeira ponte do Skiller Enterprise: em vez de apenas um servidor rodando na máquina do dev para o Claude Desktop, o Enterprise fornecerá um **Hub MCP na Nuvem**.
- Isso permite que as skills geradas sejam consumidas **por dentro do sistema de qualquer IA** corporativa (OpenAI, Gemini, Agentes internos, Slack bots), agindo como o cérebro e biblioteca unificada da empresa.

### E. Multi-Tenancy & Dashboards de Uso (Analytics)
- **Sistema Multi-Tenant B2B:** Isolamento arquitetural de dados onde cada empresa cliente tem o seu próprio workspace (com seus próprios usuários, roles, e billing).
- **Dashboards de Analytics:** Visão administrativa de consumo de API, custos de tokens por extração de skill, e métricas de quais Agentes/Equipes estão acessando mais as ferramentas via MCP.

---

### 📝 Estratégia de Transição
A interface de *Dashboard* que construímos no **Skiller Pro** foi desenhada para aguentar as expansões do Enterprise:
- A Sidebar de *FileTree* (da aba Plugin) está pronta para suportar commits e versionamento.
- O *Node Map* foi reescrito hoje para lidar perfeitamente com fontes que não sejam vídeos e artefatos complexos sem precisar de reescrita.
