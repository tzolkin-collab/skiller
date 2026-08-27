"use client";

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useSWR from 'swr';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card/Card';
import { Progress } from '@/components/ui/Progress/Progress';
import { Button } from '@/components/ui/Button/Button';
import { CheckCircle2, CircleDashed, Download, Loader2, RotateCcw, Copy, Check, Video, LayoutList, Puzzle, BrainCircuit, Box, Lightbulb, Youtube, X, Target, Settings, Play, Send, MessageSquare, Pencil, Eye, Save } from 'lucide-react';
import JSZip from 'jszip';
import { fetcher } from '@/lib/fetcher';
import type { Dictionary } from '@/types/dictionary';
import type { QueueJobStatus, SkillDetail, SkillVideo, TreeNode, SkillDocument } from '@/types/api';
import { FileTree } from '@/components/ui/FileTree/FileTree';
import styles from './page.module.css';
import { HumanWorkspace } from './HumanWorkspace';
import { CodeEditor } from '@/components/ui/CodeEditor/CodeEditor';
import { SkillEditor } from '@/components/ui/SkillEditor/SkillEditor';
import { SkillConnectors } from '@/components/ui/SkillConnectors/SkillConnectors';
import { SkillNodeMap } from './SkillNodeMap';
import humanStyles from './human.module.css';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface SkillClientProps {
  dict: Dictionary;
  skillId: string;
}

export default function SkillClient({ dict, skillId }: SkillClientProps) {
  const router = useRouter();
  const params = useParams();
  const lang = params?.lang || 'en';

  const { data: skillData, error: skillError, mutate } = useSWR<SkillDetail>(`${BASE_URL}/api/skills/${skillId}`, fetcher, {
    refreshInterval: (data) => (data && (data.status === 'completed' || data.status === 'failed')) ? 0 : 2000
  });

  const { data: jobData } = useSWR<QueueJobStatus>(
    (skillData && skillData.status !== 'completed' && skillData.status !== 'failed') 
      ? `${BASE_URL}/api/queue/jobs/${skillId}`
      : null, 
    fetcher,
    { refreshInterval: 1000 }
  );

  const [isRetrying, setIsRetrying] = useState(false);

  // Formato do download. Começa no que a skill foi gerada — hoje sempre
  // AGENTS.md, o universal — e pode virar qualquer outro sem gerar de novo.
  const [formatoDownload, setFormatoDownload] = useState('generic');
  const [baixando, setBaixando] = useState(false);
  const [erroDownload, setErroDownload] = useState<string | null>(null);
  
  // ==========================================
  // STATE: Main Tab Control
  // ==========================================
  const [mainTab, setMainTab] = useState<'plugin' | 'nodemap' | 'human' | 'transcricao' | 'conexoes'>('plugin');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [playerTime, setPlayerTime] = useState<number>(0);

  // Tools State
  const [activeSha, setActiveSha] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [copiedInstall, setCopiedInstall] = useState(false);


  // Editor state
  const [editorMode, setEditorMode] = useState<'preview' | 'code'>('preview');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleSaveDocument = async (doc: SkillDocument) => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${BASE_URL}/api/skills/${skillId}/document`, {
        credentials: 'include',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error('Failed to save document');
      setSaveStatus('saved');
      mutate();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };


  /**
   * Baixa o pacote no formato escolhido.
   *
   * A geração não pergunta mais o formato — sai em AGENTS.md, que qualquer
   * agente lê. A escolha mora aqui porque renderizar é função pura sobre o
   * documento estruturado: trocar de formato não exige gerar de novo.
   *
   * Quando o formato é o mesmo que a geração produziu, usa o pacote que já está
   * em memória. Para os outros, pede ao backend, que renderiza na hora.
   */
  const handleDownload = async (formato?: string) => {
    const alvo = formato ?? formatoDownload;
    const baseName = (skillData?.name || 'plugin').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    const compactar = async (arquivos: { path: string; content: string }[]) => {
      const zip = new JSZip();
      for (const f of arquivos) {
        zip.file(f.path, f.content, { base64: f.path.includes('assets/') });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}-${alvo}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };

    // Formato diferente do gerado: o backend renderiza a partir do documento.
    if (alvo !== (skillData?.targetFormat || 'generic')) {
      setBaixando(true);
      try {
        const res = await fetch(`${BASE_URL}/api/skills/${skillId}/package?format=${alvo}`, { credentials: 'include' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.message ?? 'Não foi possível gerar este formato.');
        await compactar(d.files);
      } catch (e) {
        setErroDownload(e instanceof Error ? e.message : 'Falha ao baixar.');
      } finally {
        setBaixando(false);
      }
      return;
    }

    // Mesmo formato: o pacote já está aqui, não precisa de rede.
    if (skillData?.skillPackage?.blobs && skillData?.skillPackage?.root) {
      const arquivos: { path: string; content: string }[] = [];
      const percorrer = (node: TreeNode, caminho: string) => {
        const completo = caminho ? `${caminho}/${node.name}` : node.name;
        if (node.type === 'file' && node.sha) {
          arquivos.push({ path: completo, content: skillData.skillPackage!.blobs[node.sha].content });
        } else if (node.children) {
          node.children.forEach((filho) => percorrer(filho, completo));
        }
      };
      skillData.skillPackage.root.children?.forEach((filho) => percorrer(filho, ''));
      await compactar(arquivos);
      return;
    }

    window.location.href = `${BASE_URL}/api/skills/${skillId}/download?format=${alvo}`;
  };

  const handleCopyInstallCommand = () => {
    const installCmd = `@workspace Install the AI Plugin from ${BASE_URL}/api/skills/${skillId}/plugin`;
    navigator.clipboard.writeText(installCmd);
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      await fetch(`${BASE_URL}/api/skills/${skillId}/retry`, {
        credentials: 'include',
        method: 'POST'
      });
      setIsRetrying(false);
    } catch (error) {
      console.error(error);
      setIsRetrying(false);
    }
  };

  const handleVideoSelect = (vidId: string) => {
    setSelectedVideoId(vidId);
    setPlayerTime(0);
  };

  // Inject base64 images from assets folder into markdown
  const markdownComponents: Components = {
    img: ({ node, src, alt, ...props }) => {
      if (src && typeof src === 'string' && (src.startsWith('./assets/') || src.startsWith('assets/'))) {
        const filename = src.replace('./assets/', '').replace('assets/', '');
        
        const findAsset = (tree: TreeNode[], currentPath: string): TreeNode | undefined => {
          for (const child of tree) {
            const fullPath = currentPath ? `${currentPath}/${child.name}` : child.name;
            if (fullPath === `assets/${filename}` || fullPath === `./assets/${filename}`) {
              return child;
            }
            if (child.children) {
              const found = findAsset(child.children, fullPath);
              if (found) return found;
            }
          }
          return undefined;
        };

        if (skillData?.skillPackage?.root?.children) {
          const fileNode = findAsset(skillData.skillPackage.root.children, '');
          if (fileNode?.sha && skillData.skillPackage.blobs[fileNode.sha]) {
            const base64 = skillData.skillPackage.blobs[fileNode.sha].content;
            const ext = filename.split('.').pop()?.toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
            return <img {...props} src={`data:${mime};base64,${base64}`} alt={alt} style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', border: '1px solid var(--border-light)' }} />;
          }
        }
      }
      return <img {...props} src={src} alt={alt} />;
    }
  };

  if (skillError) return <div className={styles.container}>{dict.skill.errorLoading}</div>;
  if (!skillData) {
    return (
      <div className={styles.skeletonContainer}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonSubtitle} />
        <div className={styles.skeletonCard} />
      </div>
    );
  }
  const status = skillData.status;
  const progress = jobData?.progress || 0;
  
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const selectedVideoObj = skillData.videos?.find(v => v.id === selectedVideoId) || (skillData.videos?.[0]);

  return (
    <main className={styles.main}>
      
      {/* 2 COLUNAS: 1fr | 350px */}
      <div className={styles.contentSplit}>

        {/* ========================================================
            ESQUERDA: MAIN WORKSPACE (GIGANTE COM ABAS)
            ======================================================== */}
        <div className={styles.mainWorkspace}>
          
          <div className={styles.workspaceTabsHeader}>
              <button 
                className={`${styles.workspaceTabButton} ${mainTab === 'plugin' ? styles.workspaceTabButtonActive : ''}`} 
                onClick={() => setMainTab('plugin')}
              >
                <Puzzle size={16} />
                {dict.skillClient.tabs.pluginSource}
              </button>
              <button 
                className={`${styles.workspaceTabButton} ${mainTab === 'nodemap' ? styles.workspaceTabButtonActive : ''}`} 
                onClick={() => setMainTab('nodemap')}
              >
                <BrainCircuit size={16} />
                Grafo de Nós
              </button>
              <button 
                className={`${styles.workspaceTabButton} ${mainTab === 'human' ? styles.workspaceTabButtonActive : ''}`} 
                onClick={() => setMainTab('human')}
              >
                <LayoutList size={16} />
                {dict.skillClient.tabs.humanView}
              </button>
              <button 
                className={`${styles.workspaceTabButton} ${mainTab === 'transcricao' ? styles.workspaceTabButtonActive : ''}`} 
                onClick={() => setMainTab('transcricao')}
              >
                <Video size={16} />
                {dict.skillClient.tabs.visualTranscript}
              </button>
              <button 
                className={`${styles.workspaceTabButton} ${mainTab === 'conexoes' ? styles.workspaceTabButtonActive : ''}`} 
                onClick={() => setMainTab('conexoes')}
              >
                <Puzzle size={16} />
                Conectores
              </button>
          </div>

          <div className={styles.workspaceContent}>
            
            {/* CONTEÚDO 1: PLUGIN */}
            {mainTab === 'plugin' && isCompleted && skillData.skillPackage && skillData.skillPackage.root && (
              <Card glass className={styles.markdownCard}>
                <div className={styles.markdownContentWrapper}>
                  <div className={styles.floatingEditorToolbar}>
                    {editorMode === 'code' && (
                      <Button
                        variant="primary"
                        className={styles.editorSaveBtn}
                        disabled={isSaving}
                        onClick={async () => {
                          const filePath = activePath || (() => {
                            const firstFile = skillData.skillPackage?.root.children?.find(c => c.type === 'file');
                            return firstFile?.name || '';
                          })();
                          if (!filePath) return;
                          setIsSaving(true);
                          setSaveStatus('idle');
                          try {
                            const res = await fetch(`${BASE_URL}/api/skills/${skillId}/file`, {
                              credentials: 'include',
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ path: filePath, content: editContent }),
                            });
                            if (!res.ok) throw new Error('Failed to save');
                            setSaveStatus('saved');
                            mutate();
                            setTimeout(() => setSaveStatus('idle'), 2000);
                          } catch {
                            setSaveStatus('error');
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        {isSaving ? <Loader2 size={14} className={styles.spinning} /> : <Save size={14} />}
                        <span style={{ marginLeft: '0.4rem' }}>
                          {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
                        </span>
                      </Button>
                    )}
                    <button
                      className={`${styles.editorToggleBtn} ${editorMode === 'preview' ? styles.editorToggleBtnActive : ''}`}
                      onClick={() => setEditorMode('preview')}
                      title="Preview"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      className={`${styles.editorToggleBtn} ${editorMode === 'code' ? styles.editorToggleBtnActive : ''}`}
                      onClick={() => {
                        if (editorMode !== 'code') {
                          // Populate editContent with the current file content
                          let content = '';
                          if (activeSha && skillData.skillPackage?.blobs[activeSha]) {
                            content = skillData.skillPackage.blobs[activeSha].content;
                          } else {
                            const firstFile = skillData.skillPackage?.root.children?.find(c => c.type === 'file');
                            if (firstFile?.sha) content = skillData.skillPackage!.blobs[firstFile.sha].content;
                          }
                          setEditContent(content);
                        }
                        setEditorMode('code');
                      }}
                      title="Edit (Code)"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>

                  {editorMode === 'code' ? (
                    <CodeEditor
                      value={editContent}
                      language={activePath || 'markdown'}
                      onChange={setEditContent}
                    />
                  ) : (
                    <div className={styles.markdownContent}>
                      {(() => {
                        let content = '';
                        let ext = '';
                        if (activeSha && skillData.skillPackage?.blobs[activeSha]) {
                          content = skillData.skillPackage.blobs[activeSha].content;
                          ext = activePath || '';
                        } else {
                          const firstFile = skillData.skillPackage?.root.children?.find(c => c.type === 'file');
                          if (firstFile && firstFile.sha) {
                            content = skillData.skillPackage.blobs[firstFile.sha].content;
                            ext = firstFile.name;
                          }
                        }
                        
                        if (ext.endsWith('.json')) {
                          return <pre><code>{content}</code></pre>;
                        }
                        if (ext.match(/\.(png|jpe?g|gif|webp)$/i)) {
                          const mime = ext.toLowerCase().endsWith('png') ? 'image/png' : ext.toLowerCase().endsWith('webp') ? 'image/webp' : ext.toLowerCase().endsWith('gif') ? 'image/gif' : 'image/jpeg';
                          return <div style={{display: 'flex', justifyContent: 'center', padding: '2rem'}}><img src={`data:${mime};base64,${content}`} alt={ext} style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', border: '1px solid var(--border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} /></div>;
                        }
                        return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
                      })()}
                    </div>
                  )}
                </div>
              </Card>
            )}
            
            {mainTab === 'plugin' && isCompleted && !skillData.skillPackage && skillData.skillMdContent && (
              <Card glass className={styles.markdownCard}>
                <CardContent className={styles.markdownContent}>
                  <ReactMarkdown components={markdownComponents}>{skillData.skillMdContent}</ReactMarkdown>
                </CardContent>
              </Card>
            )}

            {/* CONTEÚDO: NODE MAP OBSIDIAN FORCE GRAPH */}
            {mainTab === 'nodemap' && isCompleted && (
              <SkillNodeMap skill={skillData} isVisible={mainTab === 'nodemap'} />
            )}

            {/* CONTEÚDO NOVO: HUMAN VIEW */}
            {mainTab === 'human' && (
              <HumanWorkspace skillData={skillData} dict={dict} />
            )}

            {/* CONTEÚDO 2: TRANSCRICAO */}
            {mainTab === 'transcricao' && (
              <div className={styles.transcricaoWorkspace}>
                {selectedVideoObj ? (
                  <>
                    <div className={styles.youtubePlayerContainer}>
                      <iframe 
                        className={styles.youtubeIframe}
                        src={`https://www.youtube-nocookie.com/embed/${selectedVideoObj.videoId?.trim()}?enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}${playerTime > 0 ? `&start=${Math.floor(playerTime)}&autoplay=1` : ''}`} 
                        title="YouTube video player" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen>
                      </iframe>
                      <div style={{marginTop: '1rem', textAlign: 'center'}}>
                        <a href={`https://www.youtube.com/watch?v=${selectedVideoObj.videoId?.trim()}${playerTime > 0 ? `&t=${Math.floor(playerTime)}s` : ''}`} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent)', fontSize: '14px'}}>
                          Vídeo não carrega? Clique aqui para assistir no YouTube
                        </a>
                      </div>
                    </div>
                    <Card className={styles.transcriptCard}>
                      <CardHeader className={styles.transcriptHeader}>
                        <CardTitle className={styles.transcriptTitle}>{selectedVideoObj.title}</CardTitle>
                      </CardHeader>
                      <CardContent className={styles.transcriptContentBlock}>
                        <div className={styles.transcriptScrollArea}>
                          {(() => {
                            const paragraphs = selectedVideoObj.extractedCard?.transcriptParagraphs;
                            
                            // Fallback to old raw transcript format if LLM hasn't processed paragraphs yet
                            if (!paragraphs || paragraphs.length === 0) {
                              const txt = selectedVideoObj.transcriptContent;
                              if (!txt) return <pre className={styles.transcriptText}>{dict.skillClient.transcript.notAvailable}</pre>;
                              
                              return txt.split('\n').map((line, idx) => {
                                const match = line.match(/^\[(\d+)s\]\s(.*)/);
                                if (match) {
                                  const seconds = parseInt(match[1]);
                                  const textContent = match[2];
                                  const displayTime = new Date(seconds * 1000).toISOString().substring(14, 19); 
                                  return (
                                    <div key={idx} className={styles.transcriptLine} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0, width: '120px' }}>
                                        <button className={styles.timeBadge} onClick={() => setPlayerTime(seconds)} style={{ width: 'fit-content' }}>
                                          {displayTime}
                                        </button>
                                      </div>
                                      <span className={styles.transcriptTextItem} style={{ flex: 1, marginTop: '0.2rem', lineHeight: 1.6 }}>{textContent}</span>
                                    </div>
                                  );
                                }
                                return <div key={idx} className={styles.transcriptLine}>{line}</div>;
                              });
                            }
                            
                            // Render intelligent paragraphs
                            return paragraphs.map((p: NonNullable<NonNullable<typeof selectedVideoObj.extractedCard>['transcriptParagraphs']>[number], idx: number) => {
                              const seconds = p.startTime;
                              const displayTime = new Date(seconds * 1000).toISOString().substring(14, 19); 
                              
                              return (
                                <div key={idx} className={styles.transcriptLine} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0, width: '120px' }}>
                                    <button className={styles.timeBadge} onClick={() => setPlayerTime(seconds)} style={{ width: 'fit-content' }}>
                                      {displayTime}
                                    </button>
                                    
                                    {p.isImportant && (
                                      <div style={{ 
                                        width: '120px', 
                                        height: '68px', 
                                        borderRadius: '6px', 
                                        overflow: 'hidden', 
                                        backgroundImage: `url(https://img.youtube.com/vi/${selectedVideoObj.videoId}/mqdefault.jpg)`, 
                                        backgroundSize: 'cover', 
                                        backgroundPosition: 'center', 
                                        border: '1px solid var(--border-light)',
                                        cursor: 'pointer'
                                      }} onClick={() => setPlayerTime(seconds)} title="Ir para este momento no vídeo" />
                                    )}
                                  </div>
                                  <span className={styles.transcriptTextItem} style={{ flex: 1, marginTop: '0.2rem', lineHeight: 1.6 }}>{p.text}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className={styles.emptyState}>{dict.skillClient.transcript.selectVideo}</div>
                )}
              </div>
            )}

            {mainTab === 'conexoes' && (
              <SkillConnectors 
                connectors={skillData.skillDocument?.connectors || []} 
                skillName={skillData.skillDocument?.title || 'Skill'}
              />
            )}
          </div>
        </div>

        {/* ========================================================
            DIREITA: SIDEBAR (DINÂMICA BASEADA NA ABA DO MAIN)
            ======================================================== */}
        <div className={styles.rightSidebar}>
          
          <header className={styles.sidebarHeader}>
            <h1 className={styles.sidebarTitle}>{skillData.playlistTitle || dict.skill.processingPlaylist}</h1>
            <div className={styles.sidebarMeta}>
              {skillData.channelName && (
                <p className={styles.sidebarSubtitle}>{dict.skill.by} {skillData.channelName}</p>
              )}
              {skillData.targetFormat && (
                <span className={styles.formatBadge}>{skillData.targetFormat.toUpperCase()}</span>
              )}
            </div>

            {isCompleted && (
              <div className={styles.sidebarGlobalActions}>
                <Button onClick={() => router.push(`/${lang}/dashboard?editSkillId=${skillId}`)} variant="secondary" className={styles.fullBtn}>
                  {dict.skillClient.sidebar.addSource}
                </Button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button onClick={handleCopyInstallCommand} variant="secondary" className={styles.fullBtn}>
                    {copiedInstall ? <Check size={16} /> : <Copy size={16} />}
                  </Button>
                  <Button onClick={() => handleDownload()} variant="primary" className={styles.fullBtn} disabled={baixando}>
                    <Download size={16} />
                    {baixando ? '…' : dict.skillClient.sidebar.download}
                  </Button>
                </div>

                {/* A escolha do formato mora aqui, e não na geração: renderizar
                    é função pura sobre o documento estruturado, então trocar
                    não custa uma nova geração. */}
                <select
                  value={formatoDownload}
                  onChange={(e) => { setFormatoDownload(e.target.value); setErroDownload(null); }}
                  className={styles.seletorFormato}
                  aria-label="Formato do download"
                >
                  <option value="generic">AGENTS.md (universal)</option>
                  <option value="claude">Claude Code</option>
                  <option value="cursor">Cursor</option>
                  <option value="copilot">GitHub Copilot</option>
                  <option value="gemini">Gemini / Antigravity</option>
                  <option value="mcp">Servidor MCP</option>
                </select>

                {erroDownload && <p className={styles.erroDownload}>{erroDownload}</p>}
              </div>
            )}
          </header>

          {!isCompleted && !isFailed && (
            <div style={{ padding: '1rem' }}>
              <Card glass className={styles.progressCard}>
                <CardHeader style={{ padding: '1rem' }}>
                  <CardTitle style={{ fontSize: '0.9rem' }}>{dict.skill.generationInProgress}</CardTitle>
                </CardHeader>
                <CardContent style={{ padding: '1rem', paddingTop: 0 }}>
                  <div className={styles.progressWrapper}>
                    <div className={styles.progressLabels}>
                      <span>{
                        progress < 20 ? 'Iniciando processamento...' : 
                        progress < 85 ? dict.skill.extracting : 
                        progress < 100 ? 'Sintetizando a Skill com IA...' : 
                        'Finalizando pacote...'
                      }</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {isFailed && (
            <div style={{ padding: '1rem' }}>
              <Card className={styles.errorCard}>
                <CardContent style={{ padding: '1rem' }}>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--error)' }}>{dict.skill.generationFailed}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{dict.skill.errorMsg}</p>
                  <Button onClick={handleRetry} disabled={isRetrying} className={styles.retryBtn}>
                    {isRetrying ? <Loader2 size={16} className={styles.spinner} /> : <RotateCcw size={16} />}
                    {dict.skillClient.sidebar.retry}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          <div className={styles.sidebarDynamicContent}>
            
            {/* SE O MAIN É "HUMAN" -> MOSTRA AUDIO OVERVIEW E CHAT */}
            {mainTab === 'human' && (
              <div className={humanStyles.toolsPane} style={{ padding: '0 1rem', width: '100%', maxWidth: 'none', borderLeft: 'none' }}>
                {/* AUDIO OVERVIEW MOCK */}
                <Card className={humanStyles.audioCard} glass>
                  <div className={humanStyles.audioHeader}>
                    <h3 className={humanStyles.audioTitle}>Audio Overview</h3>
                    <span className={humanStyles.betaBadge}>BETA</span>
                  </div>
                  <p className={humanStyles.audioDesc}>Ouça um podcast gerado por IA debatendo os principais conceitos deste conteúdo.</p>
                  <button className={humanStyles.audioPlayBtn}>
                    <Play size={18} fill="currentColor" />
                    <span>Gerar e Ouvir (Mock)</span>
                  </button>
                </Card>

                {/* EDIT SKILL GUIDE MOCK */}
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.25rem', marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                    <Settings size={18} />
                    <span style={{ fontWeight: 600 }}>Como alterar sua Skill</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1rem' }}>
                    A IA já programou os passos corretos. Para modificar o comportamento ou incluir regras da sua empresa, basta editar as instruções do plugin.
                  </p>
                  <ul style={{ color: 'var(--text-muted)', fontSize: '0.85rem', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <li>Acesse a aba <strong>Plugin Source</strong>.</li>
                    <li>Edite os passos diretamente na seção <code>commands</code>.</li>
                    <li>Restrinja comportamentos ajustando os <code>principles</code>.</li>
                  </ul>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem', fontStyle: 'italic' }}>
                    * O editor visual de steps (no-code) chegará em breve.
                  </p>
                </div>
              </div>
            )}

            
            {/* SE O MAIN É "PLUGIN" -> MOSTRA FILE TREE */}
            {mainTab === 'plugin' && isCompleted && skillData.skillPackage && skillData.skillPackage.root && (
              <div className={styles.fileTreeContainer}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 className={styles.sidebarSectionTitle} style={{ margin: 0 }}>{dict.skillClient.sidebar.pluginFiles}</h3>
                  <Button variant="secondary" onClick={() => handleDownload()} disabled={baixando}>
                    <Download size={14} style={{ marginRight: '0.5rem' }} />
                    Download .zip
                  </Button>
                </div>
                <FileTree 
                  node={skillData.skillPackage.root}
                  activeSha={activeSha}
                  onSelectFile={(sha, path) => {
                    setActiveSha(sha);
                    setActivePath(path);
                  }}
                />
              </div>
            )}
            
            {/* SE O MAIN É "TRANSCRICAO" -> MOSTRA LISTA DE VÍDEOS */}
            {mainTab === 'transcricao' && skillData.videos && skillData.videos.length > 0 && (
              <div className={styles.videosListContainer}>
                <h3 className={styles.sidebarSectionTitle}>{dict.skillClient.sidebar.sources} ({skillData.videos.length})</h3>
                <div className={styles.videosGrid}>
                  {skillData.videos.map((video) => {
                    const isSelected = selectedVideoId === video.id || (!selectedVideoId && skillData.videos?.[0].id === video.id);
                    return (
                      <Card 
                        key={video.id} 
                        className={`${styles.videoCardSmall} ${isSelected ? styles.videoCardSelected : ''}`}
                        onClick={() => handleVideoSelect(video.id)}
                      >
                        {video.thumbnailUrl && (
                          <img src={video.thumbnailUrl} alt={video.title ?? ''} className={styles.thumbnailSmall} />
                        )}
                        <CardContent className={styles.videoCardContentSmall}>
                          <h4 className={styles.videoTitleSmall}>{video.title}</h4>
                          {video.error && (
                            <div className={styles.videoErrorLog}>
                              <span className={styles.errorLogTag}>{dict.skillClient.sidebar.apiLog}</span>
                              <code>{video.error}</code>
                            </div>
                          )}
                        </CardContent>
                        <div className={styles.videoStatusSmall}>
                          {video.processingStatus === 'completed' ? (
                            <CheckCircle2 size={14} className={styles.successIcon} />
                          ) : (
                            <CircleDashed size={14} className={styles.pendingIcon} />
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}


          </div>

        </div>

      </div>


    </main>
  );
}
