const { GoogleGenAI } = require('@google/genai');

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const modelsToTest = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro', 'gemini-1.5-flash-latest'];
  
  for (const model of modelsToTest) {
    try {
      console.log(`Testando ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: "Oi"
      });
      console.log(`✅ ${model} SUCESSO! Resposta: ${response.text.substring(0, 10)}...`);
      return; // Stop at first success
    } catch(e) {
      console.error(`❌ ${model} FALHOU: ${e.message}`);
    }
  }
}
main();
