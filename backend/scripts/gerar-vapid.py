"""
Gera um par de chaves VAPID para Web Push.

    python scripts/gerar-vapid.py

VAPID (RFC 8292) e' um par ECDSA na curva P-256. Nao ha cadastro nem custo: o
par so identifica este servidor para os servicos de push da Apple, Google e
Mozilla. A privada assina o JWT de cada envio.

O formato e' o que importa, e e' onde da errado:

  - privada: os 32 bytes do escalar, base64url, SEM padding
  - publica: o ponto nao-comprimido, 65 bytes (0x04 || X || Y), base64url

Nao e' PEM, nao e' DER, nao e' o SubjectPublicKeyInfo que a maioria das
bibliotecas devolve por padrao. Entregar qualquer um desses no lugar faz o
`setVapidDetails` recusar com "should be 32 bytes long when decoded" — que foi
exatamente o erro que apareceu em producao.

ATENCAO: trocar o par INVALIDA todas as inscricoes existentes. Cada aparelho
precisa ativar de novo, porque a inscricao e' amarrada a chave publica com que
foi criada.
"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(dados: bytes) -> str:
    """Base64url sem padding, como o protocolo exige."""
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode("ascii")


def gerar() -> tuple[str, str]:
    chave = ec.generate_private_key(ec.SECP256R1())

    # O escalar privado com 32 bytes fixos. `to_bytes` com tamanho explicito
    # evita o erro classico: um escalar que por acaso comeca com zero sairia
    # com 31 bytes e a chave seria recusada na hora de usar.
    privada = chave.private_numbers().private_value.to_bytes(32, "big")

    # Ponto nao-comprimido: 0x04 seguido de X e Y, 65 bytes no total.
    publica = chave.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    assert len(privada) == 32, f"privada com {len(privada)} bytes"
    assert len(publica) == 65 and publica[0] == 0x04, f"publica com {len(publica)} bytes"

    return b64url(publica), b64url(privada)


if __name__ == "__main__":
    pub, priv = gerar()
    print("VAPID_PUBLIC_KEY=" + pub)
    print("VAPID_PRIVATE_KEY=" + priv)
    print("VAPID_SUBJECT=mailto:brtzolkin@gmail.com")
    print()
    print(f"# publica: {len(base64.urlsafe_b64decode(pub + '=='))} bytes decodificados")
    print(f"# privada: {len(base64.urlsafe_b64decode(priv + '=='))} bytes decodificados")
