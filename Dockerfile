# ---------- build ----------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copiar arquivos de dependência (cache de camada)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/

# Instalar todas as deps do backend (incluindo devDependencies para compilar)
RUN pnpm install --frozen-lockfile --filter backend...

# Copiar código-fonte do backend
COPY backend/ ./backend/

# Compilar TypeScript → backend/dist/
RUN cd backend && pnpm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copiar manifests para instalar só produção
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --filter backend... --prod

# Copiar artefatos compilados
COPY --from=builder /app/backend/dist ./backend/dist

# Entrypoint: roda migrations e só então sobe o servidor.
# Se a migration falhar o container sai com código não-zero — o EasyPanel
# mantém o container anterior servindo tráfego em vez de subir um quebrado.
COPY backend/entrypoint.sh ./backend/entrypoint.sh
RUN chmod +x ./backend/entrypoint.sh

WORKDIR /app/backend

ENV NODE_ENV=production
ENV BACKEND_PORT=3001

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
