#!/bin/sh
# Roda as migrations antes de subir o servidor.
# Se o banco estiver inacessível ou a migration falhar, o container sai com
# código não-zero — o EasyPanel não marca o deploy como bem-sucedido e o
# container antigo continua servindo tráfego.
set -e
echo "→ rodando migrations..."
node dist/db/migrate.js
echo "→ migrations ok, iniciando servidor..."
exec node dist/index.js
