import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from 'dotenv'
import path from 'path'
// Em produção (Docker/EasyPanel) as variáveis vêm do ambiente — não há ../. env.
// Em dev o env-cmd já carrega, mas este fallback cobre execuções avulsas.
config({ path: path.resolve(process.cwd(), '../.env') })
import { skillsRouter } from './routes/skills.js'
import { queueRouter } from './routes/queue.js'
import { kbRouter } from './routes/kb.js'
import { oauthRouter } from './routes/oauth.js'
import { accountRouter } from './routes/account.js'
import { authRouter } from './routes/auth.js'
import { billingRouter } from './routes/billing.js'
import { youtubeRouter } from './routes/youtube.js'
import './queue/worker.js' // initialize the worker

export const app = new Hono()

// `credentials: true` e origem explicita: com `*` o navegador recusa enviar o
// cookie de sessao, e a autenticacao inteira nao funcionaria em outro dominio.
//
// Em desenvolvimento tambem valem as outras origens locais. Uma unica string
// exata quebrava de um jeito invisivel: abrir o app por `127.0.0.1` em vez de
// `localhost`, ou subir o Next em outra porta, fazia o navegador DESCARTAR a
// resposta — e com ela o `Set-Cookie`. Login e logout falhavam sem erro visivel.
const ORIGEM_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function origemPermitida(origin: string): string | undefined {
  const configurada = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  if (origin === configurada) return origin
  if (process.env.NODE_ENV !== 'production' && ORIGEM_LOCAL.test(origin)) return origin
  return undefined
}

/**
 * Dois CORS, porque são duas superfícies com credenciais diferentes.
 *
 * O painel manda cookie de sessão, então precisa de `credentials: true` — e
 * `credentials: true` só é seguro com origem fechada. Antes havia um CORS só,
 * que quando a origem não batia devolvia `return origin || '*'`: qualquer site
 * do mundo recebia `Allow-Origin` com `Allow-Credentials: true`. O que segurava
 * o buraco era o `SameSite=Lax` do cookie, em outro arquivo — trocar aquele
 * `Lax` por `None` (para embutir o painel num iframe, digamos) abriria a conta
 * de todo mundo, e nada aqui indicaria o porquê.
 *
 * MCP e `.well-known` são a exceção real que motivou o curinga: o cliente é uma
 * IDE, a origem é imprevisível e a credencial é `Authorization: Bearer`, não
 * cookie. Com `credentials: false` o curinga volta a ser inofensivo — o
 * navegador não anexa cookie nenhum nessas chamadas.
 */
const corsPainel = cors({ origin: (origin) => origemPermitida(origin), credentials: true })
const corsPublico = cors({ origin: '*', credentials: false })

/** Superfícies que a IDE consome sem sessão de navegador. */
function ePublica(path: string): boolean {
  return path.startsWith('/api/mcp') || path.startsWith('/.well-known')
}

app.use('/*', (c, next) => (ePublica(c.req.path) ? corsPublico : corsPainel)(c, next))

app.get('/', (c) => {
  return c.text('Skiller API is running')
})

import { mcpRouter } from './routes/mcp.js'
import { sessionsRouter } from './routes/sessions.js'
import { wellKnownRouter } from './routes/well-known.js'

app.route('/.well-known', wellKnownRouter)
app.route('/api/skills', skillsRouter)
app.route('/api/queue', queueRouter)
app.route('/api/kb', kbRouter)
app.route('/api/oauth', oauthRouter)
app.route('/api/auth', authRouter)
app.route('/api/account', accountRouter)
app.route('/api/billing', billingRouter)
app.route('/api/youtube', youtubeRouter)
app.route('/api/mcp', mcpRouter)
app.route('/api/sessions', sessionsRouter)

const port = parseInt(process.env.BACKEND_PORT || '3001')
console.log(`Server is running on port ${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// Graceful shutdown para que o "tsx watch" solte a porta rápido sem dar EADDRINUSE
const gracefulShutdown = () => {
  server.close(() => {
    console.log('Server closed gracefully');
    process.exit(0);
  });
  // Force exit if connections take too long
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Previne que crashs aleatórios matem o watcher dev permanentemente
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});