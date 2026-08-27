'use client';

/**
 * Onde os links do e-mail aterrissam.
 *
 * Três destinos, um componente: os três recebem um `token` na URL, consomem via
 * backend e dizem o que aconteceu. A diferença é qual chamada fazer e para onde
 * mandar depois — não vale três telas quase idênticas divergindo com o tempo.
 *
 * O token é consumido pelo backend, nunca lido aqui. Ele vale UMA vez, então um
 * duplo clique ou um recarregar de página não pode disparar duas chamadas.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { LogoText } from '@/components/ui/Logo/LogoText';
import { consumirLinkMagico, confirmarEmail, redefinirSenha, ErroAuth } from '@/lib/auth-client';
import styles from './entrar.module.css';

type Acao = 'link' | 'confirmar' | 'nova-senha';
type Estado = 'processando' | 'ok' | 'erro' | 'aguardando';

export default function RetornoClient({ lang, acao }: { lang: string; acao: Acao }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const proximo = searchParams.get('next') ?? `/${lang}/dashboard`;

  // `nova-senha` espera a pessoa digitar; os outros dois agem sozinhos.
  const [estado, setEstado] = useState<Estado>(acao === 'nova-senha' ? 'aguardando' : 'processando');
  const [mensagem, setMensagem] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // O token vale uma vez só. Sem esta trava, o efeito rodando duas vezes
  // (StrictMode em desenvolvimento) queimaria o link antes de a pessoa entrar.
  const jaRodou = useRef(false);

  useEffect(() => {
    if (acao === 'nova-senha' || jaRodou.current) return;
    jaRodou.current = true;

    if (!token) {
      setEstado('erro');
      setMensagem('Link incompleto — falta o código de acesso.');
      return;
    }

    const executar = async () => {
      try {
        if (acao === 'link') {
          await consumirLinkMagico(token);
          setEstado('ok');
          setMensagem('Tudo certo. Levando você para o painel…');
          setTimeout(() => router.replace(proximo), 900);
        } else {
          await confirmarEmail(token);
          setEstado('ok');
          setMensagem('E-mail confirmado.');
        }
      } catch (e) {
        setEstado('erro');
        setMensagem(e instanceof ErroAuth ? e.message : 'Não foi possível usar este link.');
      }
    };

    void executar();
  }, [acao, token, proximo, router]);

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setOcupado(true);
    try {
      await redefinirSenha(token, senha);
      setEstado('ok');
      setMensagem('Senha alterada. Levando você para o painel…');
      setTimeout(() => router.replace(`/${lang}/dashboard`), 900);
    } catch (err) {
      setEstado('erro');
      setMensagem(err instanceof ErroAuth ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setOcupado(false);
    }
  };

  const titulo = acao === 'link' ? 'Entrando…'
    : acao === 'confirmar' ? 'Confirmação de e-mail'
    : 'Escolher nova senha';

  return (
    <div className={styles.tela}>
      <div className={styles.cartao}>
        <Link href={`/${lang}`} className={styles.marca}><LogoText height={28} /></Link>
        <h1 className={styles.titulo}>{titulo}</h1>

        {estado === 'processando' && (
          <p className={styles.mensagem}>
            <Loader2 size={15} className={styles.girando} /> Verificando o link…
          </p>
        )}

        {estado === 'ok' && (
          <p className={`${styles.mensagem} ${styles.mensagemOk}`}>
            <CheckCircle2 size={15} /> {mensagem}
          </p>
        )}

        {estado === 'erro' && (
          <>
            <p className={`${styles.mensagem} ${styles.mensagemErro}`}>
              <AlertCircle size={15} /> {mensagem}
            </p>
            <div className={styles.alternativas}>
              <Link href={`/${lang}/entrar`}>Pedir um link novo</Link>
            </div>
          </>
        )}

        {acao === 'nova-senha' && estado === 'aguardando' && (
          <form onSubmit={trocarSenha} className={styles.form}>
            <label className={styles.campo}>
              <span>
                Nova senha
                <em className={styles.dica}>pelo menos 10 caracteres</em>
              </span>
              <input
                className={styles.input}
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                required
                autoFocus
              />
            </label>
            <p className={styles.dica} style={{ margin: 0, fontSize: '0.74rem' }}>
              Trocar a senha encerra todas as outras sessões abertas nesta conta.
            </p>
            <button type="submit" className={styles.btnPrincipal} disabled={ocupado || senha.length < 10 || !token}>
              {ocupado ? <Loader2 size={15} className={styles.girando} /> : null}
              {ocupado ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        {acao === 'confirmar' && estado === 'ok' && (
          <div className={styles.alternativas}>
            <Link href={`/${lang}/dashboard`}>Ir para o painel</Link>
          </div>
        )}
      </div>
    </div>
  );
}
