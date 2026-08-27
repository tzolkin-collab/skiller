import Link from 'next/link';
import { LogoText } from '@/components/ui/Logo/LogoText';
import styles from './legal.module.css';

/**
 * Moldura dos documentos legais.
 *
 * Um layout só porque os três precisam da mesma navegacao entre si e do mesmo
 * rodape — e porque documento legal que diverge de versao entre paginas vira
 * problema juridico, nao estetico.
 */
export default async function LegalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  return (
    <div className={styles.pagina}>
      <header className={styles.topo}>
        <Link href={`/${lang}`} className={styles.marca}><LogoText height={24} /></Link>
        <nav className={styles.abas}>
          <Link href={`/${lang}/legal/termos`}>Termos de Uso</Link>
          <Link href={`/${lang}/legal/privacidade`}>Privacidade</Link>
          <Link href={`/${lang}/legal/reembolso`}>Reembolso</Link>
        </nav>
      </header>
      <article className={styles.documento}>{children}</article>
      <footer className={styles.rodape}>
        <Link href={`/${lang}`}>← Voltar ao Skiller</Link>
      </footer>
    </div>
  );
}
