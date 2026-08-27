/**
 * Stripe falso, só o suficiente para exercitar nossas rotas de cobrança.
 *
 * Não substitui um teste contra a conta real — substitui *não ter teste
 * nenhum*, que é onde o código de pagamento estava. Aponte
 * `STRIPE_API_BASE=http://localhost:12111` e o SDK fala com isto.
 *
 * O estado da sessão é controlado pelo próprio id, para o teste escolher o
 * cenário sem precisar de rota de configuração:
 *   cs_pago_<userId>      → pagamento aprovado
 *   cs_pendente_<userId>  → aprovado no Stripe mas ainda não capturado
 *   cs_outro_<userId>     → pertence a outra conta
 *
 *   pnpm --filter backend run billing:mock
 */
import http from 'http';

const PORT = Number(process.env.BILLING_MOCK_PORT ?? 12111);

function sessao(id: string) {
  const [, cenario, userId] = id.split('_');
  const pago = cenario === 'pago';

  return {
    id,
    object: 'checkout.session',
    status: 'complete',
    payment_status: pago ? 'paid' : 'unpaid',
    // Só quando o id parece um UUID: `cs_pago_x` representa compra ANÔNIMA,
    // e inventar referência ali esconderia justamente o caso que importa.
    client_reference_id: /^[0-9a-f-]{36}$/i.test(userId ?? '') ? userId : null,
    customer: 'cus_mock_' + (userId ?? 'x'),
    currency: 'brl',
    amount_total: 9999,
    metadata: { userId: userId ?? '', plan: 'pro', period: 'monthly' },
    customer_details: {
      email: 'cliente@exemplo.com.br',
      address: { country: 'BR', city: 'São Paulo' },
      tax_ids: [{ type: 'br_cpf', value: '111.444.777-35' }],
    },
    subscription: {
      id: 'sub_mock',
      object: 'subscription',
      status: 'active',
      cancel_at_period_end: false,
      customer: 'cus_mock_' + (userId ?? 'x'),
      metadata: { userId: userId ?? '', plan: 'pro' },
      items: {
        object: 'list',
        data: [{
          id: 'si_mock',
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          price: {
            id: 'price_mock', object: 'price', currency: 'brl', unit_amount: 9999,
            lookup_key: 'skiller_pro_monthly', recurring: { interval: 'month' },
          },
        }],
      },
    },
  };
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Request-Id', 'req_mock');

  const m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(url.pathname);
  if (m) {
    res.end(JSON.stringify(sessao(decodeURIComponent(m[1]))));
    return;
  }

  // Assinatura avulsa, para exercitar a reconciliacao. O id decide o estado:
  //   sub_ativa_*     -> continua valendo
  //   sub_cancelada_* -> o Stripe ja encerrou (o banco e quem esta desatualizado)
  //   sub_sumida_*    -> nao existe mais
  const ms = /^\/v1\/subscriptions\/([^/]+)$/.exec(url.pathname);
  if (ms) {
    const id = decodeURIComponent(ms[1]);
    if (id.startsWith('sub_sumida')) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'No such subscription: ' + id } }));
      return;
    }
    const uid = id.split('_')[2] ?? 'x';
    const base = sessao('cs_pago_' + uid).subscription;
    res.end(JSON.stringify({
      ...base,
      id,
      status: id.startsWith('sub_cancelada') ? 'canceled' : 'active',
    }));
    return;
  }

  // Criacao do checkout. Devolve um id que codifica "pago", para o retorno
  // conseguir confirmar sem que ninguem digite nada.
  if (url.pathname === '/v1/checkout/sessions' && req.method === 'POST') {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const p = new URLSearchParams(corpo);
      const uid = p.get('client_reference_id') ?? p.get('metadata[userId]') ?? 'x';
      const id = 'cs_pago_' + uid;
      res.end(JSON.stringify({
        ...sessao(id),
        url: 'http://localhost:12111/checkout-falso/' + id,
      }));
    });
    return;
  }

  if (url.pathname === '/v1/billing_portal/sessions' && req.method === 'POST') {
    res.end(JSON.stringify({ id: 'bps_mock', object: 'billing_portal.session', url: 'http://localhost:12111/portal-falso' }));
    return;
  }

  if (url.pathname === '/v1/prices') {
    res.end(JSON.stringify({
      object: 'list',
      data: [{
        id: 'price_mock', object: 'price', active: true, currency: 'brl',
        unit_amount: 9999, lookup_key: url.searchParams.get('lookup_keys[0]'),
        recurring: { interval: 'month' },
      }],
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'mock: ' + url.pathname } }));
});

servidor.listen(PORT, () => console.log('stripe falso em http://localhost:' + PORT));
