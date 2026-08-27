// CJS — garante que dotenv carrega ANTES de qualquer import de src/
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

async function main() {
  const { enviarEmail } = await import('../src/lib/email.js');

  const resultado = await enviarEmail({
    para: 'brtzolkin@gmail.com',
    assunto: 'Teste support.tzolkin.cloud',
    html: '<p>E-mail de teste enviado com o domínio verificado support.tzolkin.cloud</p>',
    texto: 'E-mail de teste enviado com o domínio verificado support.tzolkin.cloud',
    template: 'teste',
    userId: null,
  });

  console.log(JSON.stringify(resultado, null, 2));
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
