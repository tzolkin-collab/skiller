### ADR-001: Gemini Flash como LLM primário

- **Contexto**: Precisamos de um LLM para extrair fichas e sintetizar skills
- **Decisão**: Gemini 3.6 Flash
- **Alternativas**: Claude Opus (10x mais caro), GPT-5.5 (3x mais caro)
- **Consequência**: Custo ~$0.90/playlist vs $9.00 (Claude). Trade-off: menor qualidade de raciocínio complexo, aceitável para síntese textual
