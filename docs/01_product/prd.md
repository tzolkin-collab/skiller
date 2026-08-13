# 3. PRD — Product Requirements Document

## Escopo V1

### ✅ In-Scope

| ID | Feature | Descrição |
|:---|:---|:---|
| F01 | Input de Playlist | Usuário cola URL de playlist pública do YouTube |
| F02 | Extração de Metadados | Listar todos os vídeos da playlist via YouTube Data API v3 |
| F03 | Extração de Transcrição | Obter legendas/transcrição de cada vídeo |
| F04 | Fallback Multimodal | Para vídeos sem legenda, usar Gemini multimodal |
| F05 | Pipeline Map | Extrair ficha de conceitos (JSON) de cada vídeo |
| F06 | Pipeline Synthesize | Sintetizar todas as fichas em uma skill coerente |
| F07 | Render SKILL.md | Converter JSON em Markdown no padrão SKILL.md |
| F08 | Dashboard | Visualizar skills geradas, status de processamento |
| F09 | Download | Baixar SKILL.md gerado |
| F10 | Queue Status | Ver progresso do pipeline em tempo real |
| F11 | Logs | Sistema de logs estruturados para avaliar qualidade do LLM |
| F12 | Atualização Incremental | Reprocessar playlist adicionando apenas vídeos novos |
| F13 | Retry/Fallback | Marcar vídeos que falharam, gerar skill com os restantes |

### ❌ Out-of-Scope (V1)

| Feature | Motivo |
|:---|:---|
| Autenticação / Multi-user | V1 é uso pessoal |
| Billing / Planos pagos | Prematura |
| Vídeos privados/não-listados | Requer OAuth do owner |
| Edição manual da skill no browser | Complexidade de UI desproporcional |
| RAG / busca semântica | V2+ (pgvector já provisionado para futuro) |
| Integração direta com Antigravity/Claude | V2+ |
| Suporte a TikTok/Instagram/outras plataformas | V2+ |
| Geração de skills a partir de vídeo individual | Poderia ser V1.1 |

## User Stories

### Core Flow

```
US-01: Como usuário, quero colar a URL de uma playlist do YouTube
       para que o sistema comece a gerar uma skill.

US-02: Como usuário, quero ver o progresso do processamento em tempo real
       para saber quantos vídeos já foram processados e quantos faltam.

US-03: Como usuário, quero visualizar a skill gerada no browser
       para avaliar a qualidade antes de baixar.

US-04: Como usuário, quero baixar o arquivo SKILL.md
       para usar em meu AI coding assistant ou repositório.

US-05: Como usuário, quero que o sistema processe automaticamente
       apenas vídeos novos quando a playlist é atualizada.
```

### Edge Cases

```
US-06: Como usuário, quero ser notificado se um vídeo falhou
       e ver qual fallback foi tentado, para entender a cobertura da skill.

US-07: Como usuário, quero que a skill seja gerada mesmo que
       alguns vídeos falhem, usando os que funcionaram.

US-08: Como usuário, quero ver logs detalhados de cada execução
       para avaliar custos e qualidade do processamento.
```

## Requisitos Não-Funcionais

| Req | Especificação |
|:---|:---|
| **Performance** | Processar 1 vídeo em < 10s (extração + ficha LLM) |
| **Resiliência** | Retry 3x com backoff exponencial em falhas de API |
| **Consistência** | Toda skill gerada deve passar validação Zod |
| **Observabilidade** | Todo job deve gerar log estruturado completo |
| **Custo** | Pipeline completo < $2.00 por playlist de 50 vídeos |
| **Idempotência** | Reprocessar playlist não deve duplicar dados |
