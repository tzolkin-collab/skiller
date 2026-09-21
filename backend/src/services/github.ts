export async function extractFromGithub(url: string) {
  // Simple extraction for now. Can be enhanced to clone and read all files.
  // We can use the Github API to get the readme
  let repoPath = url.replace('https://github.com/', '');
  if (repoPath.endsWith('/')) repoPath = repoPath.slice(0, -1);
  
  const apiURL = `https://api.github.com/repos/${repoPath}/readme`;
  try {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3.raw' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    let res = await fetch(apiURL, { headers });

    // Token recusado derruba TAMBÉM as leituras públicas: a API responde 401 a
    // qualquer chamada autenticada com credencial inválida, mesmo num
    // repositório aberto. Repetir sem o cabeçalho mantém o README público
    // funcionando enquanto o token é trocado — e o aviso deixa claro que ele
    // precisa ser trocado.
    if (res.status === 401 && headers['Authorization']) {
      console.warn('[github] GITHUB_TOKEN recusado (401). Repetindo sem token; gere um novo para elevar o limite de requisições.');
      delete headers['Authorization'];
      res = await fetch(apiURL, { headers });
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch github readme for ${repoPath}: ${res.status}`);
    }
    const text = await res.text();
    
    return {
      title: `${repoPath} Repository`,
      channelName: repoPath.split('/')[0],
      channelImageUrl: `https://github.com/${repoPath.split('/')[0]}.png`,
      text: text,
      source: url,
      language: 'en'
    };
  } catch (error) {
    // `cause` preserva o erro original: sem ele, a pilha para aqui e a causa
    // real (rede, 404, JSON malformado) some do log.
    throw new Error(`Error fetching from Github: ${error}`, { cause: error });
  }
}
