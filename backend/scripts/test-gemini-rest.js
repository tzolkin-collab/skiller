async function main() {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await res.json();
    console.log("Modelos suportados:", data.models.map(m => m.name).filter(n => n.includes("gemini")));
  } catch(e) {
    console.error(e.message);
  }
}
main();
