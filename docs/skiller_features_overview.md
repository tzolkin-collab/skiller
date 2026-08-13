# 📋 Skiller: Application Features Overview

Uma visão consolidada de todas as funcionalidades, capacidades e infraestrutura atual do Skiller (focado no Plano Pro / Atual).

## ⚙️ Core Engine & Backend (Hono + BullMQ + PostgreSQL + Gemini)
*   **Ingestão de Playlists (YouTube):** Capacidade de receber uma URL do YouTube, descobrir todos os vídeos e enfileirar para processamento.
*   **Processamento Distribuído (MapReduce):** Utiliza BullMQ e Redis no backend para realizar extrações pesadas em background (não trava o cliente HTTP).
*   **Extração Baseada em LLM:** Usa Gemini Flash para analisar as transcrições e extrair *Key Concepts*, resumos e scripts.
*   **Content-Addressable Storage (Arquitetura Git):** Armazenamento inteligente dos outputs gerados no banco de dados. Os arquivos e pastas de um plugin são persistidos como `TreeNodes` e `blobs` via `sha`, prevenindo duplicação de dados e permitindo escalabilidade absurda.

## 🎨 UI/UX & Frontend (Next.js App Router)
*   **Design Premium (Estúdio):** Tema "Radiant Obsidian" com UI extremamente moderna. Scrollbars minimalistas customizadas, paleta rigorosa e design fluído de 2 colunas focado em produtividade.
*   **Sidebar Dinâmica Contextual:** A barra lateral direita se adapta magicamente ao contexto do usuário (Lista de Fontes vs. FileTree de Plugin).

### 🖥️ Dashboard de Análise de Skill (Módulos)
1.  **Módulo de Transcrição:**
    *   Player do YouTube embutido responsivo.
    *   Status individual de processamento por vídeo em tempo real (Log tracking).
2.  **Módulo de Índice (Node Map Interativo):**
    *   **Engine Gráfica:** Gráfico vetorial 2D utilizando física de repulsão (`react-force-graph`).
    *   **Topologia de Processamento:** Mapeia visualmente a entrada de dados (Vídeos/Fontes) e o resultado gerado (Árvore de Arquivos do Plugin).
    *   **Interatividade de Estúdio:** Efeitos Glow neon em Hover, ponteiros inteligentes, pan (movimento) de câmera suave e Auto-Zoom (8x) ao clicar nos nós.
    *   **Doc Preview Overlay:** Leitor de Markdown renderizado (`react-markdown`) que sobrepõe o gráfico em uma interface glassmorphism para leitura profunda do `SKILL.md` sem sair da tela.
3.  **Módulo de Plugin:**
    *   **File Tree Explorer:** Navegador de arquivos no estilo VSCode que renderiza pastas recolhíveis e arquivos extraídos do banco de dados (da estrutura `TreeNode`).

## 🔌 Integração (Em Desenvolvimento / Próximos Passos Pro)
*   **Instalação MCP Local:** Ferramentas e botões sendo finalizados para permitir que o usuário ligue um servidor MCP (Model Context Protocol) na própria máquina para baixar o plugin gerado dinamicamente para o Claude Desktop ou Cursor.
*   **Exportação ZIP:** Download direto do artefato.

---
*(Para a visão completa do futuro envolvendo Pinecone, Múltiplas Fontes e Universal Hub, consulte o documento `roadmap_pro_vs_enterprise.md`)*
