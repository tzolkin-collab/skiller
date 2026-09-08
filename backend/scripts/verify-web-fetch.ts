/**
 * Exercita a guarda de destino do skiller_fetch_page.
 *
 *   npx tsx scripts/verify-web-fetch.ts
 *
 * Quem escolhe a URL aqui e' um LLM, e o LLM pode te-la lido numa pagina de
 * terceiro. Ou seja: a requisicao sai de dentro da nossa rede com destino
 * escolhido por alguem de fora. Sem estas guardas, chegar no metadata da nuvem
 * ou num Postgres interno e' uma chamada de tool.
 *
 * Os casos de rede resolvem DNS de verdade; os de forma nao saem da maquina.
 */
import { validarDestino, extrairTexto, FetchBloqueadoError } from '../src/lib/web-fetch.js';

let pass = 0;
let fail = 0;
const ok = (name: string) => { console.log(`  ok    ${name}`); pass++; };
const bad = (name: string, why: string) => { console.log(`  FALHA ${name} — ${why}`); fail++; };

async function deveBloquear(nome: string, url: string) {
  try {
    await validarDestino(url);
    bad(nome, `PASSOU: ${url}`);
  } catch (e) {
    e instanceof FetchBloqueadoError
      ? ok(`${nome} — ${e.message}`)
      : bad(nome, `erro inesperado: ${String(e)}`);
  }
}

async function devePassar(nome: string, url: string) {
  try {
    await validarDestino(url);
    ok(nome);
  } catch (e) {
    bad(nome, `bloqueou destino legitimo: ${String(e)}`);
  }
}

async function main() {
  console.log('\nProtocolo e forma');
  await deveBloquear('file://', 'file:///etc/passwd');
  await deveBloquear('gopher://', 'gopher://exemplo.com/x');
  await deveBloquear('data:', 'data:text/html,<h1>x</h1>');
  await deveBloquear('credencial embutida', 'https://user:senha@exemplo.com/');
  await deveBloquear('lixo', 'nao-e-url');

  console.log('\nEndereco literal interno');
  await deveBloquear('loopback v4', 'http://127.0.0.1:5432/');
  await deveBloquear('zero', 'http://0.0.0.0/');
  await deveBloquear('rede 10', 'http://10.0.0.5/admin');
  await deveBloquear('rede 172.16', 'http://172.16.3.9/');
  await deveBloquear('rede 192.168', 'http://192.168.0.1/');
  await deveBloquear('metadata de nuvem', 'http://169.254.169.254/latest/meta-data/');
  await deveBloquear('CGNAT', 'http://100.64.0.1/');
  await deveBloquear('loopback v6', 'http://[::1]/');
  await deveBloquear('ULA v6', 'http://[fd00::1]/');
  // O parser normaliza o pontilhado para hex, entao as duas formas precisam
  // cair — foi exatamente aqui que a primeira versao vazou.
  await deveBloquear('v4 mapeado em v6', 'http://[::ffff:169.254.169.254]/');
  await deveBloquear('v4 mapeado em hex', 'http://[::ffff:a9fe:a9fe]/');
  await deveBloquear('v4 mapeado loopback', 'http://[::ffff:127.0.0.1]/');
  await devePassar('v6 publico com ffff no meio', 'http://[2001:db8:ffff::1]/');

  console.log('\nNome de host interno');
  await deveBloquear('localhost', 'http://localhost:3001/api/mcp');
  await deveBloquear('sufixo .internal', 'http://banco.internal/');

  console.log('\nDestino publico continua passando');
  await devePassar('https publico', 'https://example.com/artigo');
  await devePassar('http publico', 'http://example.com/');
  await devePassar('com porta e query', 'https://example.com:443/busca?q=mcp');

  console.log('\nExtracao de texto');
  const { title, text } = extrairTexto(
    '<html><head><title>  Guia  do  MCP </title><style>a{color:red}</style></head>' +
      '<body><script>alert(1)</script><h1>Titulo</h1><p>Primeiro.</p><p>Segundo &amp; final.</p></body></html>'
  );
  title === 'Guia do MCP' ? ok('titulo normalizado') : bad('titulo', String(title));
  !text.includes('alert(1)') ? ok('script fora do texto') : bad('script', 'script vazou para o texto');
  !text.includes('color:red') ? ok('style fora do texto') : bad('style', 'style vazou para o texto');
  text.includes('Segundo & final.') ? ok('entidade decodificada') : bad('entidade', text.slice(0, 80));

  console.log(`\n${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
