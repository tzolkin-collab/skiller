/**
 * Túnel HTTPS para o backend local.
 *
 *   pnpm tunnel                        (da raiz)
 *   pnpm --filter backend run tunnel   (equivalente)
 *
 * Existe porque o Claude exige `https` para servidor MCP remoto, e o backend em
 * desenvolvimento fala `http://localhost:3001`. O mesmo vale para o webhook do
 * Stripe, que só entrega em endereço público.
 *
 * TRÊS MODOS, escolhidos pelo que existir no `.env`:
 *
 *  1. **ngrok** — `NGROK_AUTHTOKEN`. Com `NGROK_DOMAIN` o endereço é fixo (o
 *     plano grátis reserva um). Não exige domínio próprio nem mexer em DNS.
 *
 *  2. **Cloudflare nomeado** — `CLOUDFLARE_TUNNEL_TOKEN`. Endereço fixo sob um
 *     domínio SEU, mas exige que o DNS do domínio esteja na Cloudflare.
 *
 *  3. **Cloudflare rápido** — nada configurado. A Cloudflare sorteia um
 *     `*.trycloudflare.com` a cada execução. Serve para um teste solto.
 *
 * O `localtunnel` foi descartado: serve uma página intersticial de aviso antes
 * do conteúdo, e isso quebra o handshake do MCP.
 */
import { spawn } from 'node:child_process';
import { bin, install } from 'cloudflared';
import { existsSync } from 'node:fs';

const PORTA = Number(process.env.BACKEND_PORT ?? 3001);
const ALVO = `http://localhost:${PORTA}`;

const TOKEN = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
const HOSTNAME = process.env.TUNNEL_HOSTNAME?.trim();

const NGROK_TOKEN = process.env.NGROK_AUTHTOKEN?.trim();
/** Domínio reservado no painel do ngrok. Sem ele, o endereço é sorteado. */
const NGROK_DOMINIO = process.env.NGROK_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

/**
 * Hostname do PAINEL, quando ele também sai pelo túnel.
 *
 * Necessário sempre que a interface for aberta de fora desta máquina: o
 * navegador lê `NEXT_PUBLIC_API_URL`, e uma página servida por https que aponta
 * para `http://localhost` é bloqueada como conteúdo misto. Tunelar só o backend
 * funciona no seu computador e falha em qualquer outro.
 */
const HOSTNAME_APP = process.env.TUNNEL_HOSTNAME_APP?.trim();

/** A URL do túnel rápido sai no meio do banner, em stdout ou stderr. */
const PADRAO_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function moldura(linhas: string[]): void {
  const largura = Math.min(100, Math.max(...linhas.map((l) => l.length)));
  console.log('\n' + '─'.repeat(largura));
  for (const l of linhas) console.log(l);
  console.log('─'.repeat(largura) + '\n');
}

function comoUsar(url: string, fixo: boolean): string[] {
  const app = HOSTNAME_APP?.replace(/\/+$/, '') ?? null;

  return [
    `Backend no ar:  ${url}`,
    ...(app ? [`Painel no ar:   ${app}`] : []),
    fixo ? '  (endereço fixo — não muda entre execuções)' : '  (endereço sorteado — muda a cada execução)',
    '',
    'MCP no Claude Code:',
    `  claude mcp add --transport http skiller ${url}/api/mcp \\`,
    '    --header "Authorization: Bearer SEU_TOKEN_sk_"',
    '',
    'Webhook do Stripe:',
    `  stripe listen --forward-to ${url}/api/billing/webhook`,
    '',
    ...(fixo
      ? [
          // Com endereço fixo vale registrar os callbacks uma vez nos
          // provedores. Com endereço sorteado seria refazer a cada execução —
          // que é justamente por que ninguém configurava OAuth em dev.
          'Callbacks a registrar no Google e no GitHub (uma vez só):',
          `  ${url}/api/auth/google/callback`,
          `  ${url}/api/auth/github/callback`,
          '',
          'No .env, uma vez só:',
          `  API_URL=${url}`,
          `  NEXT_PUBLIC_API_URL=${url}`,
          ...(app
            ? [`  APP_URL=${app}`, `  FRONTEND_URL=${app}`]
            : [
                '',
                'O painel continua em localhost. Para abri-lo de outro aparelho,',
                'aponte um segundo hostname para a porta 3000 e defina',
                'TUNNEL_HOSTNAME_APP — sem isso o navegador bloqueia as chamadas',
                'à API por conteúdo misto (página https falando com http).',
              ]),
        ]
      : [
          'No .env, e de novo a cada execução:',
          `  API_URL=${url}`,
          `  NEXT_PUBLIC_API_URL=${url}`,
          '',
          'Para parar de trocar isto toda hora, use um túnel nomeado:',
          '  1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel',
          '  2. Aponte um hostname seu para  http://localhost:' + PORTA,
          '  3. Copie o token para CLOUDFLARE_TUNNEL_TOKEN no .env',
        ]),
    '',
    'Ctrl+C encerra.',
  ];
}

async function backendDePe(): Promise<boolean> {
  try {
    // A raiz do backend, e não uma rota de cobrança: `/api/billing/*` responde
    // 503 quando não há chave do Stripe, o que faria o script recusar-se a
    // abrir o túnel num ambiente perfeitamente saudável.
    const r = await fetch(`${ALVO}/`, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Túnel pelo ngrok.
 *
 * Escolhido quando há `NGROK_AUTHTOKEN`. Não exige domínio próprio nem trocar
 * nameserver — é o caminho para quem tem o domínio fora da Cloudflare.
 *
 * O plano grátis dá UM endereço reservado e UM túnel por vez. Por isso aqui só
 * o backend sai: é ele que precisa ser público para o conector MCP e para o
 * webhook. O painel continua em `localhost`.
 */
async function viaNgrok(): Promise<void> {
  const ngrok = await import('@ngrok/ngrok');

  let listener: Awaited<ReturnType<typeof ngrok.forward>>;
  try {
    listener = await ngrok.forward({
      addr: PORTA,
      authtoken: NGROK_TOKEN,
      ...(NGROK_DOMINIO ? { domain: NGROK_DOMINIO } : {}),
    });
  } catch (e) {
    // Os dois tropeços de primeira execução, ditos em português e com o que
    // fazer — o erro cru do ngrok diz o código e pouco mais.
    const msg = e instanceof Error ? e.message : String(e);

    if (/authtoken/i.test(msg)) {
      console.error(
        '\nO ngrok recusou o authtoken.\n' +
          'Pegue o seu em  https://dashboard.ngrok.com/get-started/your-authtoken\n' +
          'e cole em NGROK_AUTHTOKEN no .env da raiz.\n'
      );
    } else if (NGROK_DOMINIO && /domain|not found|reserved/i.test(msg)) {
      console.error(
        `\nO ngrok não reconheceu o domínio "${NGROK_DOMINIO}".\n` +
          'Reserve-o em  https://dashboard.ngrok.com/domains  e use exatamente\n' +
          'o endereço que aparece lá, sem "https://".\n'
      );
    } else {
      console.error('\nO ngrok não subiu: ' + msg + '\n');
    }
    process.exit(1);
  }

  const url = listener.url();
  if (!url) {
    console.error('O ngrok subiu sem devolver endereço.');
    process.exit(1);
  }

  moldura([
    `Backend no ar:  ${url}`,
    NGROK_DOMINIO
      ? '  (endereço fixo — reservado na sua conta do ngrok)'
      : '  (endereço sorteado — reserve um domínio no painel do ngrok para fixá-lo)',
    '',
    'MCP no Claude:',
    `  claude mcp add --transport http skiller ${url}/api/mcp \\`,
    '    --header "Authorization: Bearer SEU_TOKEN_sk_"',
    '',
    'Webhook do Stripe:',
    `  stripe listen --forward-to ${url}/api/billing/webhook`,
    '',
    // A ressalva que evita quebrar o login: o cookie de sessão é `SameSite=Lax`,
    // e `localhost` com `*.ngrok-free.app` são sites diferentes. O navegador não
    // manda o cookie entre eles, então o painel deixaria de reconhecer quem
    // está logado.
    'NÃO troque NEXT_PUBLIC_API_URL nem APP_URL por este endereço.',
    'O painel e o backend precisam ficar no mesmo site para o cookie de sessão',
    'viajar — deixe os dois em localhost. Este túnel serve para o conector MCP',
    'e para o webhook, que não usam cookie.',
    '',
    'Ctrl+C encerra.',
  ]);

  const encerrar = async () => {
    clearInterval(batimento);
    await listener.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  /**
   * Segura o processo de pé.
   *
   * Um `await` numa promise que nunca resolve NÃO basta: o Node encerra quando
   * não há mais handles do event loop, e promise pendente não é handle. O túnel
   * do ngrok roda no runtime nativo, sem registrar handle no lado JavaScript —
   * então o processo saía com código 0 logo após imprimir o endereço, e o
   * endereço respondia ERR_NGROK_3200 (endpoint offline) segundos depois.
   *
   * Um timer é handle de verdade, e mantém o loop vivo.
   */
  const batimento = setInterval(() => {}, 60_000);

  await new Promise(() => {});
}

async function main(): Promise<void> {
  // Um túnel para porta morta sobe normalmente e devolve 502 — erro que não
  // diz o que fazer. Melhor recusar aqui, antes de qualquer download.
  if (!(await backendDePe())) {
    console.error(
      `\nNada respondendo em ${ALVO}.\n` +
        `Suba o backend primeiro:  pnpm --filter backend run dev\n`
    );
    process.exit(1);
  }

  if (NGROK_TOKEN) {
    console.log(`Abrindo túnel ngrok para ${ALVO}…`);
    await viaNgrok();
    return;
  }

  // O pacote npm traz só o instalador; o binário desce na primeira execução.
  if (!existsSync(bin)) {
    console.log('Baixando o cloudflared (só na primeira vez)…');
    await install(bin);
  }

  const nomeado = Boolean(TOKEN);
  console.log(`Abrindo túnel ${nomeado ? 'nomeado' : 'rápido'} para ${ALVO}…`);

  const args = nomeado
    ? ['tunnel', 'run', '--token', TOKEN!]
    : ['tunnel', '--url', ALVO];

  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  if (nomeado) {
    if (HOSTNAME) {
      moldura(comoUsar(HOSTNAME.replace(/\/+$/, ''), true));
    } else {
      moldura([
        'Túnel nomeado no ar.',
        '',
        'Defina TUNNEL_HOSTNAME no .env com o endereço que você apontou na',
        'Cloudflare, e este aviso passa a imprimir os comandos prontos.',
        '',
        'Ctrl+C encerra.',
      ]);
    }
  }

  let anunciada = false;
  // Acumula em vez de casar por pedaço: o `data` chega em fatias arbitrárias, e
  // a URL pode cair entre duas — o padrão nunca casaria, e o script ficaria
  // rodando em silêncio como se nada tivesse acontecido.
  let acumulado = '';

  const procurar = (buf: Buffer) => {
    if (anunciada || nomeado) return;
    acumulado += buf.toString();
    const achado = acumulado.match(PADRAO_URL);
    if (!achado) {
      // Não deixa o buffer crescer sem limite numa execução longa.
      if (acumulado.length > 64_000) acumulado = acumulado.slice(-4_000);
      return;
    }
    anunciada = true;
    moldura(comoUsar(achado[0], false));
  };

  proc.stdout.on('data', procurar);
  proc.stderr.on('data', procurar);

  proc.on('exit', (code) => {
    if (!anunciada && !nomeado) {
      console.error(
        '\nO cloudflared saiu sem anunciar uma URL. Saída completa:\n' +
          acumulado.slice(-2000)
      );
    }
    console.log(`\nTúnel encerrado (código ${code ?? 0}).`);
    process.exit(code ?? 0);
  });

  // Ctrl+C precisa derrubar o filho também, senão o cloudflared fica órfão
  // segurando a porta e o próximo `tunnel` sobe um segundo em paralelo.
  const encerrar = () => {
    proc.kill();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
