const reset = "\x1b[0m";
const bold = "\x1b[1m";
const white = "\x1b[97m"; // Branco brilhante
const gray = "\x1b[38;2;148;163;184m"; // #94a3b8

const logo = `
${white}  ████████╗███████╗ ██████╗ ██╗     ██╗  ██╗██╗███╗   ██╗
${white}  ╚══██╔══╝╚══███╔╝██╔═══██╗██║     ██║ ██╔╝██║████╗  ██║
${white}     ██║     ███╔╝ ██║   ██║██║     █████╔╝ ██║██╔██╗ ██║
${white}     ██║    ███╔╝  ██║   ██║██║     ██╔═██╗ ██║██║╚██╗██║
${white}     ██║   ███████╗╚██████╔╝███████╗██║  ██╗██║██║ ╚████║
${white}     ╚═╝   ╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot() {
  console.clear();
  console.log("");
  console.log(bold + logo + reset);
  console.log(white + "  [ SYSTEM ]" + reset + gray + " Tzolkin Skiller OS Initialized." + reset);
  console.log(white + "  [ ENGINE ]" + reset + gray + " Booting Multi-Service Environment (Turborepo)..." + reset);
  console.log("");
  
  process.stdout.write("  ");
  const text = "Made your way";
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(white + bold + text[i] + reset);
    await sleep(75); // Velocidade da digitação
  }
  
  console.log("\n");
  
  // Pausa dramática para o usuário conseguir ler a animação antes de abrir as abas do Turborepo
  await sleep(1500); 
}

boot();
