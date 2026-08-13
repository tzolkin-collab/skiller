const OpenAI = require('openai');

async function main() {
  console.log("------------------------------------------");
  console.log("Iniciando teste de autenticação na OpenAI...");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERRO: A variável OPENAI_API_KEY não foi encontrada no .env!");
    return;
  }
  
  console.log("A chave fornecida inicia com:", apiKey.substring(0, 12) + "...");
  
  const openai = new OpenAI({
    apiKey: apiKey
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Ping' }],
      max_tokens: 5
    });
    console.log("✅ SUCESSO! A chave é válida.");
    console.log("Resposta do Modelo:", response.choices[0].message.content);
  } catch (error) {
    console.error("❌ FALHA DE AUTENTICAÇÃO!");
    console.error("Motivo:", error.message);
  }
  console.log("------------------------------------------");
}

main();
