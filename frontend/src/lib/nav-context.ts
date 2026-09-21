/**
 * Parâmetros de URL que acompanham a pessoa por busca -> vídeo -> carrinho.
 *
 * O carrinho lê o contexto direto da URL, então quem navega dentro do fluxo
 * precisa repassá-lo. `editSkillId` já era repassado à mão em cada lugar;
 * `sessao` não era — e por isso "Selecionar Fontes" quebrava na primeira busca:
 * a URL virava `/dashboard?q=...`, o carrinho não achava a sessão do agente e
 * voltava a dizer "Generate Skill". A seleção nunca chegava ao agente, que
 * ficava "aguardando" para sempre.
 */
const CONTEXTO = ['editSkillId', 'sessao'] as const;

/** Monta a query string de `base` mais o contexto que já estava na URL atual. */
export function comContexto(
  atual: { get(nome: string): string | null },
  base: Record<string, string>
): string {
  const params = new URLSearchParams(base);
  for (const nome of CONTEXTO) {
    const valor = atual.get(nome);
    if (valor) params.set(nome, valor);
  }
  return params.toString();
}
