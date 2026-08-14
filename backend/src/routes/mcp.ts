import { Hono } from 'hono';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../db/db.js';
import { skills } from '../db/schema.js';
import { isNotNull } from 'drizzle-orm';
import crypto from 'crypto';

export const mcpRouter = new Hono();

// Em Hono, podemos usar a API Web Standard nativa!
// Este transporte gerencia múltiplas sessões (stateful mode) se fornecermos um sessionIdGenerator
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});

const server = new Server(
  {
    name: 'skiller-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Registrar tools dinâmicas do banco de dados
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Buscar todas as skills geradas que possuem pacote de ferramenta
  const generatedSkills = await db
    .select()
    .from(skills)
    .where(isNotNull(skills.skillPackage));

  const tools = generatedSkills.map((s) => {
    let pkg: any = {};
    if (typeof s.skillPackage === 'string') {
      try {
        pkg = JSON.parse(s.skillPackage);
      } catch (e) {}
    } else {
      pkg = s.skillPackage;
    }
    
    // Usa o fallback para title ou string vazia, caso não haja pacote estruturado
    const name = pkg?.name || `skill_${s.id.replace(/-/g, '_')}`;
    const description = pkg?.description || s.title || 'Skiller dynamic tool';
    
    return {
      name: name,
      description: description,
      inputSchema: pkg?.inputSchema || {
        type: "object",
        properties: {},
        required: []
      }
    };
  });

  return {
    tools: tools
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments;
  
  // Find the skill matching this name
  const generatedSkills = await db
    .select()
    .from(skills)
    .where(isNotNull(skills.skillPackage));
    
  const skill = generatedSkills.find((s) => {
     const pkg: any = typeof s.skillPackage === 'string' ? JSON.parse(s.skillPackage) : s.skillPackage;
     const name = pkg?.name || `skill_${s.id.replace(/-/g, '_')}`;
     return name === toolName;
  });

  if (!skill) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  // A tool in Skiller is basically instructions and a markdown structure.
  // We execute it by returning the system instructions context back to the agent (Spark)
  // so the agent can execute the task itself, OR if it's an API, we could execute it here.
  return {
    content: [
      {
        type: 'text',
        text: `[System Instruction for ${toolName}]\n\n${skill.markdown || skill.rawText || 'No content provided.'}\n\n[End System Instruction]\n\nExecution args received: ${JSON.stringify(args, null, 2)}`
      }
    ]
  };
});

// Conecta o servidor ao transporte único que gerencia todas as requests
server.connect(transport).catch(console.error);

// O transporte mapeia automaticamente GET / para sse e POST / para mensagens baseadas no Session ID da URL
mcpRouter.all('/sse', async (c) => {
  return transport.handleRequest(c.req.raw);
});

// Para compatibilidade, roteamos a base também caso o cliente não aponte /sse explicitamente,
// ou envia POST /message. 
// Nota: WebStandardStreamableHTTPServerTransport gerencia tanto GET quanto POST na mesma rota raiz.
mcpRouter.all('/*', async (c) => {
  return transport.handleRequest(c.req.raw);
});
