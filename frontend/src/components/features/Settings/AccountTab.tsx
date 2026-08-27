'use client';

/**
 * A aba de Conta.
 *
 * Extraída em componente próprio: `SettingsContent` já passava de 600 linhas, e
 * perfil, vínculos, dispositivos, cartões e exclusão são cinco assuntos com
 * estado próprio. Amontoá-los lá dentro deixaria o arquivo ilegível.
 *
 * Até aqui a aba mostrava "Pro User / user@example.com / Agosto 2026" escrito
 * no HTML, em campos `readOnly`. Agora tudo vem da conta de verdade.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Check, Loader2, LogOut, Monitor, CreditCard, Download, Trash2, AlertTriangle, Link2,
} from 'lucide-react';
import { useAuth, entrarComProvedor, type UsuarioLogado } from '@/lib/auth-client';
import {
  salvarPerfil, listarVinculos, desvincular, listarSessoes, encerrarSessao,
  listarCartoes, baixarMeusDados, pedirExclusao, descreverDispositivo, NOME_PROVEDOR,
  type Vinculo, type SessaoAberta, type Cartao,
} from '@/lib/account';
import { definirSenha, ErroAuth } from '@/lib/auth-client';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './Settings.module.css';

interface Props {
  lang: string;
  usuario: UsuarioLogado;
  dict: { settings: { account: Record<string, string> } };
}

export function AccountTab({ lang, usuario, dict }: Props) {
  const { recarregar, provedores } = useAuth();

  const [nome, setNome] = useState(usuario.name ?? '');
  const [locationEnabled, setLocationEnabled] = useState(usuario.preferences?.locationTrackingEnabled ?? false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [vinculos, setVinculos] = useState<Vinculo[] | null>(null);
  const [sessoes, setSessoes] = useState<SessaoAberta[] | null>(null);
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [semCobranca, setSemCobranca] = useState(false);

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [textoConfirmacao, setTextoConfirmacao] = useState('');
  const [avisoExclusao, setAvisoExclusao] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Estado do cadastro de senha pós-checkout
  const pedindoSenha = searchParams.get('setup_password') === 'true' && !usuario.hasPassword;
  const [senhaNova, setSenhaNova] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [senhaSalva, setSenhaSalva] = useState(false);

  const carregar = useCallback(async () => {
    const [v, s, c] = await Promise.all([listarVinculos(), listarSessoes(), listarCartoes()]);
    setVinculos(v);
    setSessoes(s);
    setCartoes(c.methods);
    setSemCobranca(Boolean(c.unavailable));
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvarNome = async () => {
    setErro(null);
    setSalvando(true);
    try {
      await salvarPerfil({ name: nome, preferences: { locationTrackingEnabled: locationEnabled } });
      await recarregar();
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarNovaSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroSenha(null);
    setSalvandoSenha(true);
    try {
      await definirSenha(senhaNova);
      setSenhaSalva(true);
      // Remove o parâmetro da URL de forma limpa
      router.replace(`/${lang}/dashboard/settings`);
      await recarregar(); // atualiza o usuario.hasPassword
    } catch (err) {
      setErroSenha(err instanceof ErroAuth ? err.message : 'Não foi possível salvar a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  };

  const naoVinculados = provedores.filter((p) => !usuario.identities.includes(p.id));
  const podeExcluir = textoConfirmacao.trim().toUpperCase() === 'EXCLUIR';

  return (
    <div className={styles.tabContent}>
      {/* ---------------------------------------------------------- perfil */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{dict.settings.account.profile}</h3>
          <p className={styles.cardDesc}>{lang === 'pt' ? 'Gerencie as informações públicas do seu perfil' : 'Manage your public profile information'}</p>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.profileSection}>
            <div className={styles.avatarLarge}>
              {usuario.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={usuario.avatarUrl} alt="" className={styles.avatarImagemCheia} />
                : (usuario.name ?? usuario.email).charAt(0).toUpperCase()}
            </div>

            <div className={styles.profileDetails}>
              <div className={styles.fieldGroup}>
                <label>{dict.settings.account.name}</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => { setNome(e.target.value); setSalvo(false); }}
                  className={`${styles.input} ${styles.campoEstreito}`}
                  placeholder="Seu nome"
                  maxLength={80} 
                />
              </div>

              <div className={styles.fieldGroup}>
                <label>{dict.settings.account.email}</label>
                {/* Somente leitura de propósito: trocar o e-mail é trocar de
                    identidade, e exige confirmar o endereço novo antes. */}
                <input type="email" value={usuario.email} readOnly className={`${styles.input} ${styles.campoEstreito}`}  />
                {!usuario.emailVerified && (
                  <span className={`${styles.helpText} ${styles.textoDestaque}`} >
                    E-mail ainda não confirmado — recibos e avisos de cobrança não chegam até você confirmar.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.cardFooter}>
          <span className={`${styles.helpText} ${styles.empurraDireita}`} >
            {lang === 'pt' ? 'Use no máximo 80 caracteres.' : 'Use up to 80 characters.'}
          </span>
          <button
            className={`${styles.planoBtn} ${styles.planoBtnPrimario} ${styles.botaoCompacto}`} 
            onClick={salvarNome}
            disabled={salvando || (nome === (usuario.name ?? '') && locationEnabled === (usuario.preferences?.locationTrackingEnabled ?? false))}
          >
            {salvando ? <Loader2 size={14} className={styles.girando} /> : salvo ? <Check size={14} /> : null}
            {salvando ? '' : salvo ? '' : (lang === 'pt' ? 'Salvar Alterações' : 'Save Changes')}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- Privacidade */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{lang === 'pt' ? 'Privacidade' : 'Privacy'}</h3>
          <p className={styles.cardDesc}>{lang === 'pt' ? 'Gerencie os dados que coletamos' : 'Manage the data we collect'}</p>
        </div>
        <div className={styles.cardBody}>
          <div className={`${styles.infoRow} ${styles.linhaSemRegua}`} >
            <div>
              <strong className={styles.blocoTexto}>
                {lang === 'pt' ? 'Coleta de Localização' : 'Location Tracking'}
              </strong>
              <span className={styles.helpText}>
                {lang === 'pt' 
                  ? 'Permitir coleta de localização para melhorar a experiência no app.' 
                  : 'Allow location collection to improve app experience.'}
              </span>
            </div>
            <div className={styles.linhaCentro}>
              <input
                type="checkbox"
                id="location-toggle"
                checked={locationEnabled}
                onChange={(e) => {
                  setLocationEnabled(e.target.checked);
                  setSalvo(false);
                }}
                className={styles.caixaSelecao}
              />
            </div>
          </div>
        </div>
        <div className={styles.cardFooter}>
          <span className={`${styles.helpText} ${styles.empurraDireita}`} >
            {lang === 'pt' 
              ? 'Clique em salvar para aplicar a preferência.' 
              : 'Click save to apply this preference.'}
          </span>
          <button
            className={`${styles.planoBtn} ${styles.planoBtnPrimario} ${styles.botaoCompacto}`} 
            onClick={salvarNome}
            disabled={salvando || (nome === (usuario.name ?? '') && locationEnabled === (usuario.preferences?.locationTrackingEnabled ?? false))}
          >
            {salvando ? <Loader2 size={14} className={styles.girando} /> : salvo ? <Check size={14} /> : null}
            {salvando ? '' : salvo ? '' : (lang === 'pt' ? 'Salvar' : 'Save')}
          </button>
        </div>
      </div>

      {pedindoSenha && !senhaSalva && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{lang === 'pt' ? 'Cadastre sua senha' : 'Setup your password'}</h3>
            <p className={styles.cardDesc}>
              {lang === 'pt'
                ? 'Para voltar à sua conta depois, crie uma senha. Você também pode pular se preferir entrar sempre usando link mágico por e-mail.'
                : 'Create a password to access your account later, or skip if you prefer using email magic links.'}
            </p>
          </div>
          <div className={styles.cardBody}>
            <form id="password-form" onSubmit={salvarNovaSenha} className={styles.colunaMedia}>
              <div className={styles.fieldGroup}>
                <label>Nova Senha</label>
                <input
                  type="password"
                  className={`${styles.input} ${styles.campoEstreito}`} 
                  placeholder={lang === 'pt' ? 'Pelo menos 10 caracteres' : 'At least 10 characters'}
                  value={senhaNova}
                  onChange={(e) => setSenhaNova(e.target.value)}
                  autoComplete="new-password"
                  required
                  autoFocus
                />
              </div>
              
              {erroSenha && (
                <p className={`${styles.planDesc} ${styles.destaqueSemMargem}`} >
                  {erroSenha}
                </p>
              )}
            </form>
          </div>
          <div className={styles.cardFooter}>
             <button
                type="button"
                className={`${styles.btnDiscreto} ${styles.empurraDireita}`}
                onClick={() => router.replace(`/${lang}/dashboard/settings`)}
              >
                {lang === 'pt' ? 'Definir depois' : 'Set up later'}
              </button>
              <button
                type="submit"
                form="password-form"
                className={`${styles.planoBtn} ${styles.planoBtnPrimario} ${styles.botaoCompacto}`} 
                disabled={salvandoSenha || senhaNova.length < 10}
              >
                {salvandoSenha ? <Loader2 size={14} className={styles.girando} /> : null}
                {salvandoSenha ? (lang === 'pt' ? 'Salvando…' : 'Saving…') : (lang === 'pt' ? 'Salvar senha' : 'Save password')}
              </button>
          </div>
        </div>
      )}

      {senhaSalva && (
        <div className={styles.avisoSucesso}>
          <Check size={16} className={styles.iconeInline} />
          {lang === 'pt' ? 'Senha cadastrada com sucesso!' : 'Password saved successfully!'}
        </div>
      )}

      {erro && <p className={`${styles.planDesc} ${styles.textoDestaque}`} >{erro}</p>}

      {/* -------------------------------------------------------- vínculos */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{lang === 'pt' ? 'Como você entra' : 'How you log in'}</h3>
          <p className={styles.cardDesc}>{lang === 'pt' ? 'Conexões de provedores sociais vinculadas à sua conta' : 'Social provider connections linked to your account'}</p>
        </div>
        <div className={`${styles.cardBody} ${styles.semRecuo}`} >
          <ul className={`${styles.listaSimples} ${styles.semMoldura}`} >
            {vinculos === null && <li className={styles.linhaVazia}><Loader2 size={14} className={styles.girando} /> Carregando…</li>}
            {vinculos?.map((v) => (
              <li key={v.id} className={`${styles.linhaItem} ${styles.recuoLinha}`} >
                <Link2 size={18} className={styles.iconeItem} />
                <div className={styles.itemInfo}>
                  <strong className={styles.textoCorpo}>{NOME_PROVEDOR[v.provider] ?? v.provider}</strong>
                  <span>
                    {v.email ?? '—'}
                    {v.lastUsedAt ? ` · usado em ${new Date(v.lastUsedAt).toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang)}` : ''}
                  </span>
                </div>
                {(vinculos.length > 1 || usuario.hasPassword) && (
                  <button
                    className={styles.btnDiscreto}
                    onClick={async () => { await desvincular(v.id); await carregar(); await recarregar(); }}
                  >
                    Desvincular
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        {naoVinculados.length > 0 && (
          <div className={styles.cardFooter}>
            <div className={`${styles.acoesInline} ${styles.acaoDireita}`} >
              {naoVinculados.map((p) => (
                <button key={p.id} className={styles.planoBtn} onClick={() => entrarComProvedor(p.id, `/${lang}/dashboard/settings`)}>
                  Vincular {p.nome}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- dispositivos */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{lang === 'pt' ? 'Sessões abertas' : 'Active sessions'}</h3>
          <p className={styles.cardDesc}>{lang === 'pt' ? 'Dispositivos atualmente logados na sua conta' : 'Devices currently logged into your account'}</p>
        </div>
        <div className={`${styles.cardBody} ${styles.semRecuo}`} >
          <ul className={`${styles.listaSimples} ${styles.semMoldura}`} >
            {sessoes === null && <li className={styles.linhaVazia}><Loader2 size={14} className={styles.girando} /> Carregando…</li>}
            {sessoes?.map((s) => (
              <li key={s.id} className={`${styles.linhaItem} ${styles.recuoLinha}`} >
                <Monitor size={18} className={styles.iconeItem} />
                <div className={styles.itemInfo}>
                  <strong className={styles.textoCorpo}>{descreverDispositivo(s.userAgent)}</strong>
                  <span>
                    {s.ipAddress ?? 'IP desconhecido'} · visto em{' '}
                    {new Date(s.lastSeenAt).toLocaleString(lang === 'pt' ? 'pt-BR' : lang)}
                  </span>
                </div>
                <button
                  className={styles.btnDiscreto}
                  onClick={async () => { await encerrarSessao(s.id); await carregar(); }}
                >
                  <LogOut size={14} /> Encerrar
                </button>
              </li>
            ))}
            {sessoes?.length === 0 && <li className={`${styles.linhaVazia} ${styles.recuoSecao}`} >Nenhuma sessão registrada.</li>}
          </ul>
        </div>
      </div>

      {/* ---------------------------------------------------------- cartões */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{lang === 'pt' ? 'Formas de pagamento' : 'Payment methods'}</h3>
          <p className={styles.cardDesc}>{lang === 'pt' ? 'Cartões salvos para faturamento automático' : 'Cards saved for automatic billing'}</p>
        </div>
        <div className={`${styles.cardBody} ${styles.semRecuo}`} >
          {semCobranca ? (
            <div className={styles.recuoSecao}>
              <p className={styles.helpText}>Cobrança não configurada neste ambiente.</p>
            </div>
          ) : cartoes === null ? (
            <div className={styles.recuoSecao}>
              <p className={styles.helpText}><Loader2 size={14} className={styles.girando} /> Carregando…</p>
            </div>
          ) : cartoes.length === 0 ? (
            <div className={styles.recuoSecao}>
              <p className={styles.helpText}>
                Nenhum cartão salvo. O cartão usado na primeira assinatura fica guardado com segurança
                na Stripe e é oferecido automaticamente na próxima compra — o número nunca passa pelos
                nossos servidores.
              </p>
            </div>
          ) : (
            <ul className={`${styles.listaSimples} ${styles.semMoldura}`} >
              {cartoes.map((c) => (
                <li key={c.id} className={`${styles.linhaItem} ${styles.recuoLinha}`} >
                  <CreditCard size={18} className={styles.iconeItem} />
                  <div className={styles.itemInfo}>
                    <strong className={styles.textoCorpo}>{c.brand.toUpperCase()} •••• {c.last4}</strong>
                    <span>
                      {c.expMonth && c.expYear ? `válido até ${String(c.expMonth).padStart(2, '0')}/${c.expYear}` : '—'}
                      {c.isDefault ? ' · padrão' : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- LGPD */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{lang === 'pt' ? 'Seus dados' : 'Your data'}</h3>
          <p className={styles.cardDesc}>{lang === 'pt' ? 'Exportação e gerenciamento de conta' : 'Data export and account management'}</p>
        </div>
        <div className={styles.cardBody}>
          <div className={`${styles.infoRow} ${styles.linhaSemRegua}`} >
            <div>
              <strong className={styles.blocoTexto}>
                {lang === 'pt' ? 'Exportar Dados' : 'Export Data'}
              </strong>
              <span className={`${styles.helpText} ${styles.blocoLargo}`} >
                {lang === 'pt' 
                  ? 'Baixe um arquivo JSON com tudo que guardamos sobre você. Senha e tokens não constam — são guardados só como hash.' 
                  : 'Download a JSON file with all your data. Passwords and tokens are not included.'}
              </span>
            </div>
            <button className={`${styles.planoBtn} ${styles.botaoCompacto}`}  onClick={() => { void baixarMeusDados(); }}>
              <Download size={14} /> {lang === 'pt' ? 'Baixar' : 'Download'}
            </button>
          </div>
        </div>
      </div>

      <div className={`${styles.card} ${styles.zonaPerigo}`}>
        <div className={`${styles.cardHeader} ${styles.reguaDestaque}`} >
          <div className={styles.zonaPerigoTopo}>
            <AlertTriangle size={16} />
            <strong className={styles.tituloLinha}>{lang === 'pt' ? 'Excluir a conta' : 'Delete account'}</strong>
          </div>
        </div>
        <div className={styles.cardBody}>
          {avisoExclusao ? (
            <p className={`${styles.planDesc} ${styles.textoForte}`} >{avisoExclusao}</p>
          ) : !confirmandoExclusao ? (
            <>
              <p className={styles.planDesc}>
                {lang === 'pt' 
                  ? 'A conta é desativada na hora e apagada em 30 dias. Nesse período dá para voltar atrás — basta entrar de novo. Registros fiscais de compras já feitas são mantidos pelo prazo que a lei exige.'
                  : 'The account is deactivated immediately and deleted in 30 days. You can recover it by logging in again during this period.'}
              </p>
              <div>
                <button className={styles.btnPerigo} onClick={() => setConfirmandoExclusao(true)}>
                  <Trash2 size={14} /> {lang === 'pt' ? 'Quero excluir minha conta' : 'I want to delete my account'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.planDesc}>
                {lang === 'pt' ? 'Digite ' : 'Type '}
                <strong className={styles.textoDestaque}>EXCLUIR</strong> 
                {lang === 'pt' ? ' para confirmar. Todas as suas sessões serão encerradas.' : ' to confirm. All sessions will be terminated.'}
              </p>
              <div className={styles.linhaLarga}>
                <input
                  className={`${styles.input} ${styles.campoCurto}`}
                  value={textoConfirmacao}
                  onChange={(e) => setTextoConfirmacao(e.target.value)}
                  placeholder="EXCLUIR"
                />
                <button
                  className={styles.btnPerigo}
                  disabled={!podeExcluir}
                  onClick={async () => {
                    try {
                      setAvisoExclusao(await pedirExclusao());
                    } catch (e) {
                      setAvisoExclusao(e instanceof Error ? e.message : 'Não foi possível concluir.');
                    }
                  }}
                >
                  {lang === 'pt' ? 'Confirmar exclusão' : 'Confirm deletion'}
                </button>
                <button className={`${styles.btnDiscreto} ${styles.semBorda}`}  onClick={() => { setConfirmandoExclusao(false); setTextoConfirmacao(''); }}>
                  {lang === 'pt' ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

