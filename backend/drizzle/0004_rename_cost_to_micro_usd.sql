-- Custo passa a ser guardado em micro-dólares (1 USD = 1_000_000).
-- A coluna anterior era `integer` com o nome em USD, o que só permitia
-- registrar valores inteiros de dólar — inútil para jobs de centavos.
-- Nunca foi escrita, então o rename não perde dado.
ALTER TABLE "pipeline_logs" RENAME COLUMN "estimated_cost_usd" TO "estimated_cost_micro_usd";
