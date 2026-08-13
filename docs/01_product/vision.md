# 2. Product Vision Document

## Problema

Desenvolvedores e profissionais técnicos consomem horas assistindo playlists educacionais no YouTube, mas o conhecimento se perde — não é referenciável, não é buscável, não é reutilizável. Não existe ferramenta que transforme uma playlist inteira em um documento de referência estruturado e acionável.

## Proposta de Valor

O Skiller transforma qualquer playlist pública do YouTube em uma **Skill** — um documento Markdown estruturado no padrão SKILL.md — que pode ser:
- Usado como referência técnica pessoal
- Importado como skill em AI coding assistants (Antigravity, Claude Code, Cursor)
- Compartilhado e versionado via Git
- Buscado semanticamente via embeddings

## Personas

### Persona Principal: "O Autodidata Técnico"
- Desenvolvedor que aprende por YouTube
- Frustrado por não conseguir "buscar" algo que viu em um vídeo 3 meses atrás
- Usa AI assistants no dia a dia e entende o valor de skills/plugins

### Persona Secundária: "O Curador de Conhecimento"
- Tech Lead ou educador que monta curricula
- Quer transformar playlists recomendadas em material de referência para a equipe

## Métricas de Sucesso (V1)

| Métrica | Target |
|:---|:---|
| Skills geradas com sucesso (sem falha total) | > 95% |
| Tempo médio de geração (playlist 50 vídeos) | < 5 min |
| Custo médio por skill gerada | < $2.00 |
| Schema validation pass rate (Zod) | > 98% |
| Vídeos que precisam de fallback multimodal | < 15% |
