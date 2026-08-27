'use client';

/**
 * A porta de entrada.
 *
 * Quatro caminhos numa tela só, porque são a mesma decisão para quem chega:
 * "como eu entro?". Separar em páginas obrigaria a voltar e escolher de novo.
 *
 * O modo padrão é o link mágico: não pede senha para criar nem para lembrar, e
 * o e-mail já precisa ser confirmado de qualquer forma.
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, KeyRound, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { LogoText } from '@/components/ui/Logo/LogoText';
import {
  useAuth, entrarComProvedor, entrarComSenha, criarConta,
  pedirLinkMagico, pedirRedefinicao, ErroAuth,
} from '@/lib/auth-client';
import styles from './entrar.module.css';

type Modo = 'link' | 'senha' | 'criar' | 'esqueci';

const ERROS_DO_PROVEDOR: Record<string, string> = {
  estado_invalido: 'A sessão de login expirou. Tente de novo.',
  provedor_falhou: 'O provedor não respondeu. Tente de novo em instantes.',
  email_nao_verificado:
    'Seu e-mail não está confirmado no provedor. Confirme lá e tente de novo — ' +
    'sem isso não dá para saber que a conta é sua.',
  resposta_incompleta: 'Resposta incompleta do provedor. Tente de novo.',
  access_denied: 'Você cancelou a autorização.',
};

export default function EntrarClient({ lang }: { lang: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usuario, provedores, carregado } = useAuth();

  const proximo = searchParams.get('next') ?? `/${lang}/dashboard`;
  const erroUrl = searchParams.get('erro');

  const [modo, setModo] = useState<Modo>('link');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [termos, setTermos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Já logado não tem o que fazer aqui.
  useEffect(() => {
    if (carregado && usuario) router.replace(proximo);
  }, [carregado, usuario, proximo, router]);

  useEffect(() => {
    if (erroUrl) setErro(ERROS_DO_PROVEDOR[erroUrl] ?? 'Não foi possível entrar por este provedor.');
  }, [erroUrl]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);

    try {
      if (modo === 'link') {
        setAviso(await pedirLinkMagico(email.trim(), proximo));
      } else if (modo === 'esqueci') {
        setAviso(await pedirRedefinicao(email.trim()));
      } else if (modo === 'senha') {
        await entrarComSenha(email.trim(), senha);
        router.replace(proximo);
      } else {
        await criarConta({ email: email.trim(), password: senha, name: nome.trim() || undefined, acceptTerms: termos });
        router.replace(proximo);
      }
    } catch (e) {
      setErro(e instanceof ErroAuth ? e.message : 'Não foi possível concluir. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const titulo = modo === 'criar' ? 'Criar sua conta'
    : modo === 'esqueci' ? 'Recuperar acesso'
    : 'Entrar no Skiller';

  const subtitulo = modo === 'criar'
    ? 'Leva um minuto. Depois você escolhe o plano.'
    : modo === 'esqueci'
      ? 'Mandamos um link para você definir uma senha nova.'
      : modo === 'link'
        ? 'Sem senha: enviamos um link de acesso para o seu e-mail.'
        : 'Use o e-mail e a senha da sua conta.';

  const rotuloBotao = modo === 'link' ? 'Enviar link de acesso'
    : modo === 'esqueci' ? 'Enviar link de recuperação'
    : modo === 'criar' ? 'Criar conta'
    : 'Entrar';

  const podeEnviar = email.trim().length > 3
    && (modo === 'link' || modo === 'esqueci' || senha.length > 0)
    && (modo !== 'criar' || termos);

  return (
    <div className={styles.tela}>
      {/*
        Dois painéis, padrão Stripe. O da esquerda é argumento e não decoração:
        quem chega aqui vindo da landing precisa lembrar por que estava vindo,
        e um formulário sozinho no meio da tela não diz nada.
      */}
      <aside className={styles.painel}>
        <Link href={`/${lang}`} className={styles.marca}><LogoText height={26} /></Link>

        <div className={styles.painelCorpo}>
          <h2 className={styles.painelTitulo}>
            Vire conhecimento em <em>skill</em> para a sua IA.
          </h2>
          <p className={styles.painelTexto}>
            Playlists, documentação e conversas viram instruções que o Claude, o Cursor
            e o Copilot carregam direto.
          </p>

          <ul className={styles.provas}>
            <li><Check size={14} /> Seis formatos a partir de uma extração só</li>
            <li><Check size={14} /> Conector MCP para a sua IDE</li>
            <li><Check size={14} /> Teste de 3 dias, cancele sem cobrança</li>
          </ul>
        </div>

        <p className={styles.painelRodape}>
          <Link href={`/${lang}/legal/termos`}>Termos</Link>
          <span>·</span>
          <Link href={`/${lang}/legal/privacidade`}>Privacidade</Link>
        </p>
      </aside>

      <main className={styles.lado}>
        <div className={styles.cartao}>
          <Link href={`/${lang}`} className={styles.marcaMobile}><LogoText height={24} /></Link>
          <h1 className={styles.titulo}>{titulo}</h1>
          <p className={styles.subtitulo}>{subtitulo}</p>

        {/* Já logado: o efeito acima redireciona. Enquanto isso, avisa — em vez
            de trocar a página por um spinner, que era o que deixava a tela em
            branco para TODO MUNDO até o JavaScript responder. */}
        {carregado && usuario && (
          <p className={`${styles.mensagem} ${styles.mensagemOk}`}>
            <Loader2 size={15} className={styles.girando} />
            Você já está em {usuario.email}. Levando você adiante…
          </p>
        )}

        {modo === 'esqueci' && (
          <button className={styles.voltar} onClick={() => { setModo('senha'); setErro(null); setAviso(null); }}>
            <ArrowLeft size={13} /> voltar
          </button>
        )}

        {carregado && provedores.length > 0 && modo !== 'esqueci' && (
          <>
            <div className={styles.provedores}>
              {provedores.map((p) => (
                <button
                  key={p.id}
                  className={styles.btnProvedor}
                  onClick={() => entrarComProvedor(p.id, proximo)}
                  disabled={ocupado}
                >
                  <span className={styles.iconeProvedor} aria-hidden>
                    {p.id === 'google' && (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          fill="#EA4335"
                        />
                      </svg>
                    )}
                    {p.id === 'github' && (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                        />
                      </svg>
                    )}
                  </span>
                  Continuar com {p.nome}
                </button>
              ))}
            </div>
            <div className={styles.separador}><span>ou</span></div>
          </>
        )}

        <form onSubmit={enviar} className={styles.form}>
          {modo === 'criar' && (
            <label className={styles.campo}>
              <span>Como podemos te chamar</span>
              <input
                className={styles.input}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </label>
          )}

          <label className={styles.campo}>
            <span>E-mail</span>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
              required
            />
          </label>

          {(modo === 'senha' || modo === 'criar') && (
            <label className={styles.campo}>
              <span>
                Senha
                {modo === 'criar' && <em className={styles.dica}>pelo menos 10 caracteres</em>}
              </span>
              <input
                className={styles.input}
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                required
              />
            </label>
          )}

          {modo === 'criar' && (
            <label className={styles.termos}>
              <input type="checkbox" checked={termos} onChange={(e) => setTermos(e.target.checked)} />
              <span>
                Li e aceito os <Link href={`/${lang}/legal/termos`} target="_blank">Termos de Uso</Link> e a{' '}
                <Link href={`/${lang}/legal/privacidade`} target="_blank">Política de Privacidade</Link>.
              </span>
            </label>
          )}

          {erro && (
            <p className={`${styles.mensagem} ${styles.mensagemErro}`}>
              <AlertCircle size={15} /> {erro}
            </p>
          )}
          {aviso && (
            <p className={`${styles.mensagem} ${styles.mensagemOk}`}>
              <CheckCircle2 size={15} /> {aviso}
            </p>
          )}

          <button type="submit" className={styles.btnPrincipal} disabled={ocupado || !podeEnviar}>
            {ocupado ? <Loader2 size={15} className={styles.girando} /> : modo === 'link' ? <Mail size={15} /> : <KeyRound size={15} />}
            {ocupado ? 'Aguarde…' : rotuloBotao}
          </button>
        </form>

        <div className={styles.alternativas}>
          {modo === 'link' && (
            <>
              <button onClick={() => { setModo('senha'); setErro(null); setAviso(null); }}>Entrar com senha</button>
              <span>·</span>
              <button onClick={() => { setModo('criar'); setErro(null); setAviso(null); }}>Criar conta</button>
            </>
          )}
          {modo === 'senha' && (
            <>
              <button onClick={() => { setModo('link'); setErro(null); setAviso(null); }}>Entrar sem senha</button>
              <span>·</span>
              <button onClick={() => { setModo('esqueci'); setErro(null); setAviso(null); }}>Esqueci a senha</button>
              <span>·</span>
              <button onClick={() => { setModo('criar'); setErro(null); setAviso(null); }}>Criar conta</button>
            </>
          )}
          {modo === 'criar' && (
            <button onClick={() => { setModo('link'); setErro(null); setAviso(null); }}>Já tenho conta</button>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
