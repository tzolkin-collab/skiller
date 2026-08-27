'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import {
  LayoutGrid, FolderTree, FileText, Check, X, Clock, Sparkles,
  Folder, FolderOpen, ChevronRight, ChevronDown
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { fetcher } from '@/lib/fetcher';
import { useSession } from '@/lib/session';
import type { ContaAtual } from '@/lib/account';
import styles from './base.module.css';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface KbPage {
  path: string;
  title: string | null;
  type: string | null;
  status: string | null;
  tags: string[] | null;
  updatedAt: string;
}

interface CanvasNode {
  id: string;
  type: 'text' | 'file';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
}

interface PendingRemoval {
  path: string;
  title: string | null;
  reason: string | null;
  channel: string | null;
}

const NODE_H = 90;
const DATE_H = 110;

export default function BaseClient() {
  const params = useParams();
  const lang = typeof params?.lang === 'string' ? params.lang : 'pt';
  const pt = lang === 'pt';

  const { userId, pronto: sessaoPronta } = useSession();
  const [view, setView] = useState<'canvas' | 'pastas'>('pastas');
  const [aberta, setAberta] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.55);
  const [criandoBase, setCriandoBase] = useState(false);

  const [pastasAbertas, setPastasAbertas] = useState<Record<string, boolean>>({
    skills: true,
    architecture: true,
    workflows: true,
    decisions: true,
    integrations: true,
    features: true,
    security: true,
  });

  const togglePasta = (nome: string) => {
    setPastasAbertas((prev) => ({ ...prev, [nome]: !prev[nome] }));
  };

  const pronto = sessaoPronta && Boolean(userId);

  const { data: conta } = useSWR<ContaAtual>(
    pronto ? `${BASE_URL}/api/account` : null,
    fetcher
  );

  const temKb = conta ? conta.capabilities?.includes('kb') : null;

  const { data: pages, mutate: recarregarPages } = useSWR<KbPage[]>(
    pronto && temKb ? `${BASE_URL}/api/kb/pages` : null,
    fetcher
  );
  const { data: canvas, mutate: recarregarCanvas } = useSWR<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>(
    pronto && temKb ? `${BASE_URL}/api/kb/canvas` : null,
    fetcher
  );
  const { data: pendentes, mutate: recarregarPendentes } = useSWR<PendingRemoval[]>(
    pronto && temKb ? `${BASE_URL}/api/kb/pending-removal` : null,
    fetcher
  );

  const arquivoAtual = aberta || pages?.[0]?.path || null;

  const { data: pagina } = useSWR<{ frontmatter: Record<string, unknown>; body: string }>(
    pronto && temKb && arquivoAtual ? `${BASE_URL}/api/kb/page?path=${encodeURIComponent(arquivoAtual)}` : null,
    fetcher
  );

  const handleInitBase = async () => {
    setCriandoBase(true);
    try {
      const res = await fetch(`${BASE_URL}/api/kb/init`, {
        credentials: 'include',
        method: 'POST',
      });
      if (res.ok) {
        await Promise.all([recarregarPages(), recarregarCanvas(), recarregarPendentes()]);
      }
    } finally {
      setCriandoBase(false);
    }
  };

  /** Agrupa os arquivos por pasta temática (Obsidian Vault structure). */
  const pastas = useMemo(() => {
    if (!pages) return [];
    const ordem = ['skills', 'architecture', 'workflows', 'decisions', 'integrations', 'features', 'security', 'outros'];
    const map = new Map<string, KbPage[]>();
    ordem.forEach((o) => map.set(o, []));

    pages.forEach((p) => {
      const pasta = p.path.split('/')[1] || p.type || 'outros';
      const arr = map.get(pasta) ?? [];
      arr.push(p);
      map.set(pasta, arr);
    });

    const labels: Record<string, string> = {
      skills: 'Skills',
      architecture: 'Arquitetura',
      workflows: 'Workflows',
      decisions: 'Decisões (ADRs)',
      integrations: 'Integrações',
      features: 'Features',
      security: 'Segurança',
      outros: 'Outros',
    };

    return Array.from(map.entries())
      .filter(([_, files]) => files.length > 0)
      .map(([nome, files]) => ({
        nome,
        label: labels[nome] ?? nome,
        files,
      }));
  }, [pages]);

  /** Normaliza as coordenadas do cofre para o espaço da tela. */
  const layout = useMemo(() => {
    if (!canvas?.nodes?.length) return null;

    const minX = Math.min(...canvas.nodes.map((n) => n.x));
    const datas = canvas.nodes.filter((n) => n.type === 'text').sort((a, b) => a.x - b.x);
    const arquivos = canvas.nodes.filter((n) => n.type === 'file');

    const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
    datas.forEach((n) => pos.set(n.id, { x: n.x - minX, y: 0, w: n.width, h: DATE_H }));

    const porData = new Map<string, number>();
    arquivos.forEach((n) => {
      const aresta = canvas.edges.find((e) => e.toNode === n.id);
      const paiId = aresta?.fromNode ?? '';
      const i = porData.get(paiId) ?? 0;
      porData.set(paiId, i + 1);
      const pai = pos.get(paiId);
      pos.set(n.id, {
        x: pai ? pai.x : n.x - minX,
        y: DATE_H + 60 + i * (NODE_H + 16),
        w: 320,
        h: NODE_H,
      });
    });

    const largura = Math.max(...[...pos.values()].map((p) => p.x + p.w)) + 80;
    const altura = Math.max(...[...pos.values()].map((p) => p.y + p.h)) + 80;
    return { pos, largura, altura };
  }, [canvas]);

  const decidir = async (path: string, decision: 'approve' | 'reject') => {
    await fetch(`${BASE_URL}/api/kb/removal`, {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, decision }),
    });
    recarregarPendentes();
  };

  if (!pronto) {
    return (
      <div className={styles.container}>
        <div className={styles.vazio}>
          <FileText size={40} />
          <h3>Nenhuma conta selecionada</h3>
          <p>A Base da IA é por usuário. Escolha uma conta no canto inferior esquerdo.</p>
        </div>
      </div>
    );
  }

  if (temKb === false) {
    return (
      <div className={styles.container}>
        <div className={styles.vazio}>
          <Sparkles size={40} style={{ color: 'var(--accent-primary)' }} />
          <h3>{pt ? 'Recurso exclusivo do Plano Pro' : 'Exclusive Pro Plan Feature'}</h3>
          <p>{pt ? 'A Base da IA guarda o conhecimento dos seus agentes.' : 'The AI Knowledge Base stores long-term insights.'}</p>
          <a href={`/${lang}/pricing`} className={styles.btnApprove} style={{ marginTop: '0.8rem', padding: '0.6rem 1.2rem', textDecoration: 'none' }}>
            {pt ? 'Ver planos e upgrade' : 'See plans and upgrade'}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Base da IA</h1>
          <p className={styles.subtitle}>
            Cofre de conhecimento do agente (Obsidian / Karpathy LLM-Wiki). Eles escrevem pelo MCP; aqui você navega e audita.
          </p>
        </div>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'pastas' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('pastas')}
          >
            <FolderTree size={15} /> Pastas & Arquivos
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'canvas' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('canvas')}
          >
            <LayoutGrid size={15} /> Cronologia (Canvas)
          </button>
        </div>
      </header>

      {pendentes && pendentes.length > 0 && (
        <section className={styles.pendentes}>
          <h2 className={styles.pendentesTitle}>
            <Clock size={15} /> {pendentes.length} remoção(ões) aguardando sua decisão
          </h2>
          {pendentes.map((p) => (
            <div key={p.path} className={styles.pendenteRow}>
              <div className={styles.pendenteInfo}>
                <strong>{p.title ?? p.path}</strong>
                <span className={styles.pendenteReason}>{p.reason ?? 'sem motivo'}</span>
              </div>
              <div className={styles.pendenteActions}>
                <button className={styles.btnReject} onClick={() => decidir(p.path, 'reject')}>Manter</button>
                <button className={styles.btnApprove} onClick={() => decidir(p.path, 'approve')}>Remover</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Visão 1: Explorador de Pastas do Obsidian com Split View */}
      {view === 'pastas' && (
        <>
          {!pages?.length ? (
            <div className={styles.vazio}>
              <Sparkles size={40} style={{ color: 'var(--accent-primary)' }} />
              <h3>{pt ? 'A base ainda está vazia' : 'The Knowledge Base is empty'}</h3>
              <p>
                {pt
                  ? 'Crie a estrutura inicial da sua Base da IA para importar suas skills e permitir que os agentes registrem novos aprendizados.'
                  : 'Initialize your AI Knowledge Base scaffold to import skills and let agents record knowledge.'}
              </p>
              <button
                className={styles.btnApprove}
                style={{ marginTop: '1rem', padding: '0.6rem 1.4rem', cursor: 'pointer' }}
                onClick={handleInitBase}
                disabled={criandoBase}
              >
                {criandoBase
                  ? (pt ? 'Criando Base…' : 'Creating Base…')
                  : (pt ? 'Criar Base da IA' : 'Create Knowledge Base')}
              </button>
            </div>
          ) : (
            <div className={styles.explorerLayout}>
              {/* Barra lateral de pastas e arquivos */}
              <aside className={styles.explorerSidebar}>
                {pastas.map((pasta) => {
                  const estaAberta = pastasAbertas[pasta.nome] !== false;
                  return (
                    <div key={pasta.nome} className={styles.folderSection}>
                      <button
                        className={styles.folderHeader}
                        onClick={() => togglePasta(pasta.nome)}
                      >
                        <div className={styles.folderLeft}>
                          {estaAberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {estaAberta ? <FolderOpen size={15} className={styles.folderIcon} /> : <Folder size={15} className={styles.folderIcon} />}
                          <span>{pasta.label}</span>
                        </div>
                        <span className={styles.folderBadge}>{pasta.files.length}</span>
                      </button>

                      {estaAberta && (
                        <div className={styles.folderFiles}>
                          {pasta.files.map((f) => {
                            const isAtivo = (arquivoAtual === f.path);
                            return (
                              <button
                                key={f.path}
                                className={`${styles.fileItem} ${isAtivo ? styles.fileItemActive : ''}`}
                                onClick={() => setAberta(f.path)}
                                title={f.title ?? f.path}
                              >
                                <FileText size={13} className={styles.fileItemIcon} />
                                <span className={styles.fileItemTitle}>{f.title ?? f.path.split('/').pop()}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </aside>

              {/* Painel leitor de Markdown */}
              <main className={styles.previewPanel}>
                <header className={styles.previewHeader}>
                  <span className={styles.previewPath}>{arquivoAtual ?? 'Selecione um documento'}</span>
                </header>
                <div className={styles.previewCorpo}>
                  {pagina ? (
                    <ReactMarkdown>{pagina.body}</ReactMarkdown>
                  ) : (
                    <p style={{ color: 'var(--text-muted)' }}>Carregando conteúdo…</p>
                  )}
                </div>
              </main>
            </div>
          )}
        </>
      )}

      {/* Visão 2: Canvas / Linha do Tempo */}
      {view === 'canvas' && (
        <section className={styles.canvasWrap}>
          {!layout ? (
            <div className={styles.vazio}>
              <Sparkles size={40} style={{ color: 'var(--accent-primary)' }} />
              <h3>{pt ? 'A base ainda está vazia' : 'The Knowledge Base is empty'}</h3>
              <button className={styles.btnApprove} onClick={handleInitBase} disabled={criandoBase}>
                {criandoBase ? 'Criando Base…' : 'Criar Base da IA'}
              </button>
            </div>
          ) : (
            <>
              <div className={styles.canvasControls}>
                <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}>−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(1.2, z + 0.1))}>+</button>
              </div>
              <div className={styles.canvasScroll}>
                <div className={styles.canvasStage} style={{ width: layout.largura * zoom, height: layout.altura * zoom }}>
                  <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: layout.largura, height: layout.altura, position: 'relative' }}>
                    <svg className={styles.edges} width={layout.largura} height={layout.altura}>
                      {canvas?.edges.map((e) => {
                        const a = layout.pos.get(e.fromNode);
                        const b = layout.pos.get(e.toNode);
                        if (!a || !b) return null;
                        const mesmaLinha = a.y === b.y;
                        const x1 = mesmaLinha ? a.x + a.w : a.x + 40;
                        const y1 = mesmaLinha ? a.y + a.h / 2 : a.y + a.h;
                        const x2 = mesmaLinha ? b.x : b.x + 40;
                        const y2 = mesmaLinha ? b.y + b.h / 2 : b.y;
                        const d = mesmaLinha ? `M${x1},${y1} H${x2}` : `M${x1},${y1} V${(y1 + y2) / 2} H${x2} V${y2}`;
                        return <path key={e.id} d={d} className={styles.edge} />;
                      })}
                    </svg>

                    {canvas?.nodes.map((n) => {
                      const p = layout.pos.get(n.id);
                      if (!p) return null;
                      const isData = n.type === 'text';
                      return (
                        <div
                          key={n.id}
                          className={isData ? styles.nodeData : styles.nodeArquivo}
                          style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                          onClick={() => {
                            if (!isData && n.file) {
                              setAberta(n.file);
                              setView('pastas');
                            }
                          }}
                        >
                          {isData ? (
                            <>
                              <span className={styles.nodeDataLabel}>{n.text?.split('\n')[0].replace(/^##\s*/, '')}</span>
                              <span className={styles.nodeDataCount}>
                                {Math.max(1, (n.text?.split('\n').length ?? 1) - 1)} registros
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={styles.nodeArquivoTipo}>
                                {n.file?.split('/')[1] ?? 'wiki'}
                              </span>
                              <span className={styles.nodeArquivoNome}>
                                {n.file?.split('/').pop()?.replace(/\.md$/, '')}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
