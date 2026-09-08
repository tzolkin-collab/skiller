/**
 * Exercita a validacao de inscricao de push, sem banco e sem rede.
 *
 *   npx tsx scripts/verify-push.ts
 *
 * Existe por causa de um zumbi. Uma inscricao com chave malformada falha na
 * cifragem ANTES de qualquer requisicao — entao ela nunca recebe o 404 que
 * apagaria uma inscricao morta, e fica no banco sendo reprocessada em todo
 * envio, para sempre. Foi o teste que pegou: a linha continuou la' depois da
 * limpeza.
 *
 * O conserto e' recusar na porta, e os tamanhos sao fixos pelo protocolo:
 * p256dh e' um ponto nao-comprimido da P-256 (65 bytes) e auth tem 16.
 */
import crypto from 'node:crypto';
import { chavesValidas } from '../src/lib/push.js';

let pass = 0;
let fail = 0;
const ok = (name: string) => { console.log(`  ok    ${name}`); pass++; };
const bad = (name: string, why: string) => { console.log(`  FALHA ${name} — ${why}`); fail++; };
const conferir = (name: string, cond: boolean, why: string) => (cond ? ok(name) : bad(name, why));

/** Uma chave publica de verdade, como o navegador entrega. */
function p256dhReal(): string {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return ecdh.getPublicKey().toString('base64url');
}
const authReal = () => crypto.randomBytes(16).toString('base64url');

console.log('\nInscricao legitima passa');
conferir('chaves do navegador', chavesValidas(p256dhReal(), authReal()), 'recusou inscricao boa');

console.log('\nMalformada e recusada na porta');
conferir('p256dh curta', !chavesValidas('invalida', authReal()), 'aceitou p256dh de 6 bytes');
conferir('p256dh vazia', !chavesValidas('', authReal()), 'aceitou p256dh vazia');
conferir('auth curta', !chavesValidas(p256dhReal(), 'aaa'), 'aceitou auth fora de 16 bytes');
conferir('auth vazia', !chavesValidas(p256dhReal(), ''), 'aceitou auth vazia');
conferir(
  'p256dh de 64 bytes',
  !chavesValidas(crypto.randomBytes(64).toString('base64url'), authReal()),
  'aceitou ponto de tamanho errado'
);
conferir(
  'auth de 17 bytes',
  !chavesValidas(p256dhReal(), crypto.randomBytes(17).toString('base64url')),
  'aceitou auth de 17 bytes'
);

console.log('\nTamanho e' + ' o criterio, nao o conteudo');
// 65 bytes aleatorios nao formam um ponto valido da curva, e o web-push so'
// descobre na hora de cifrar. A porta nao tem como saber — e tudo bem: esse
// caso lanca ERR_CRYPTO no envio, que o `avisar` ja' trata como morte.
conferir(
  '65 bytes aleatorios passam na porta',
  chavesValidas(crypto.randomBytes(65).toString('base64url'), authReal()),
  'a porta esta mais rigida do que consegue ser'
);

console.log(`\n${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
