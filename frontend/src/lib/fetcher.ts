/**
 * Chamada à API com o cookie de sessão.
 *
 * `credentials: 'include'` não é detalhe: sem ele o navegador não manda o
 * cookie para outra origem, e o backend — que identifica a pessoa por ele
 * desde que saiu do `?userId=` — responde 401 em toda rota autenticada. O
 * sintoma é a biblioteca vazia e a skill que não abre, sem nada indicando
 * que o problema é de credencial.
 *
 * Fica no default e não em cada chamada porque esquecer numa é o suficiente
 * para reproduzir o bug — e foi assim que ele apareceu.
 */
export const fetcher = async (url: string, options?: RequestInit) => {
  const method = options?.method || 'GET';
  const startTime = performance.now();

  try {
    const res = await fetch(url, { credentials: 'include', ...options });
    const duration = Math.round(performance.now() - startTime);
    
    // Nice colored console log for the frontend
    const color = res.ok ? '#10b981' : '#ef4444';
    console.log(
      `%c[API] ${method} %c${url} %c${res.status} ${res.statusText} %c(${duration}ms)`,
      'color: #8b5cf6; font-weight: bold;',
      'color: inherit;',
      `color: ${color}; font-weight: bold;`,
      'color: #6b7280;'
    );

    if (!res.ok) {
      throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    console.error(
      `%c[API ERROR] ${method} %c${url} %c(${duration}ms)`,
      'color: #ef4444; font-weight: bold;',
      'color: inherit;',
      'color: #6b7280;',
      error
    );
    throw error;
  }
};
