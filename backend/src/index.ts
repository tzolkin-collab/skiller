import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '../.env') })
import { skillsRouter } from './routes/skills.js'
import { queueRouter } from './routes/queue.js'
import { oauthRouter } from './routes/oauth.js'
import { youtubeRouter } from './routes/youtube.js'
import './queue/worker.js' // initialize the worker

const app = new Hono()

app.use('/api/*', cors())

app.get('/', (c) => {
  return c.text('Skiller API is running')
})

import { mcpRouter } from './routes/mcp.js'

app.route('/api/skills', skillsRouter)
app.route('/api/queue', queueRouter)
app.route('/api/oauth', oauthRouter)
app.route('/api/youtube', youtubeRouter)
app.route('/api/mcp', mcpRouter)

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