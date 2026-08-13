"use client";

import { useState } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card/Card';
import { Progress } from '@/components/ui/Progress/Progress';
import { Button } from '@/components/ui/Button/Button';
import { CheckCircle2, CircleDashed, Download, Loader2, RotateCcw, Copy, Check, Video, LayoutList, Puzzle, BrainCircuit, Box, Lightbulb, Youtube, X } from 'lucide-react';
import JSZip from 'jszip';
import { fetcher } from '@/lib/fetcher';
import type { Dictionary } from '@/types/dictionary';
import type { QueueJobStatus, SkillDetail, SkillVideo, TreeNode } from '@/types/api';
import { FileTree } from '@/components/ui/FileTree/FileTree';
import { Modal } from '@/components/ui/Modal/Modal';
import styles from './page.module.css';
import { SkillNodeMap } from './SkillNodeMap';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SkillClientProps {
  dict: Dictionary;
  skillId: string;
}

export default function SkillClient({ dict, skillId }: SkillClientProps) {
  const { data: skillData, error: skillError } = useSWR<SkillDetail>(`${BASE_URL}/api/skills/${skillId}`, fetcher, {
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
  
  // ==========================================
  // STATE: Main Tab Control
  // ==========================================
  const [mainTab, setMainTab] = useState<'plugin' | 'human' | 'transcricao' | 'indice'>('plugin');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [playerTime, setPlayerTime] = useState<number>(0);

  // Tools State
  const [activeSha, setActiveSha] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [appendUrl, setAppendUrl] = useState('');
  const [isAppending, setIsAppending] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAppend = async () => {
    if (!appendUrl) return;
    try {
      setIsAppending(true);
      const res = await fetch(`${BASE_URL}/api/skills/${skillId}/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistUrl: appendUrl })
      });
      if (res.ok) {
        setAppendUrl('');
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAppending(false);
    }
  };

  const handleDownload = async () => {
    if (skillData?.skillPackage?.blobs && skillData?.skillPackage?.root) {
      const zip = new JSZip();
      
      const traverseTree = (node: TreeNode, currentPath: string) => {
        const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
        if (node.type === 'file' && node.sha) {
           const content = skillData.skillPackage!.blobs[node.sha].content;
           zip.file(fullPath, content);
        } else if (node.children) {
           node.children.forEach(child => traverseTree(child, fullPath));
        }
      };

      if (skillData.skillPackage.root.children) {
        // Inicializamos com 'plugin' para que todos os arquivos fiquem dentro dessa pasta raiz
        skillData.skillPackage.root.children.forEach(child => traverseTree(child, 'plugin'));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(skillData.name || 'plugin').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.skill`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      window.location.href = `${BASE_URL}/api/skills/${skillId}/download`;
    }
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
                className={`${styles.workspaceTabButton} ${mainTab === 'indice' ? styles.workspaceTabButtonActive : ''}`} 
                onClick={() => setMainTab('indice')}
              >
                <LayoutList size={16} />
                {dict.skillClient.tabs.nodeMap}
              </button>
          </div>

          <div className={styles.workspaceContent}>
            
            {/* CONTEÚDO 1: PLUGIN */}
            {mainTab === 'plugin' && isCompleted && skillData.skillPackage && skillData.skillPackage.root && (
              <Card glass className={styles.markdownCard}>
                <div className={styles.markdownContentWrapper}>
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
                      return <ReactMarkdown>{content}</ReactMarkdown>;
                    })()}
                  </div>
                </div>
              </Card>
            )}
            
            {mainTab === 'plugin' && isCompleted && !skillData.skillPackage && skillData.skillMdContent && (
              <Card glass className={styles.markdownCard}>
                <CardContent className={styles.markdownContent}>
                  <ReactMarkdown>{skillData.skillMdContent}</ReactMarkdown>
                </CardContent>
              </Card>
            )}

            {/* CONTEÚDO NOVO: HUMAN VIEW */}
            {mainTab === 'human' && isCompleted && skillData.humanMdContent && (
              <Card glass className={styles.markdownCard}>
                <div className={styles.markdownContentWrapper}>
                  <div className={styles.markdownContent}>
                    <ReactMarkdown>{skillData.humanMdContent}</ReactMarkdown>
                  </div>
                </div>
              </Card>
            )}
            {mainTab === 'human' && isCompleted && !skillData.humanMdContent && (
              <div className={styles.emptyState}>{dict.skillClient.transcript.notAvailable}</div>
            )}

            {/* CONTEÚDO 2: TRANSCRICAO */}
            {mainTab === 'transcricao' && (
              <div className={styles.transcricaoWorkspace}>
                {selectedVideoObj ? (
                  <>
                    <div className={styles.youtubePlayerContainer}>
                      <iframe 
                        className={styles.youtubeIframe}
                        src={`https://www.youtube.com/embed/${selectedVideoObj.videoId}?start=${playerTime}&autoplay=${playerTime > 0 ? 1 : 0}`} 
                        title="YouTube video player" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen>
                      </iframe>
                    </div>
                    <Card className={styles.transcriptCard}>
                      <CardHeader className={styles.transcriptHeader}>
                        <CardTitle className={styles.transcriptTitle}>{selectedVideoObj.title}</CardTitle>
                      </CardHeader>
                      <CardContent className={styles.transcriptContentBlock}>
                        <div className={styles.transcriptScrollArea}>
                          {(() => {
                            const txt = selectedVideoObj.transcriptContent;
                            if (!txt) return <pre className={styles.transcriptText}>{dict.skillClient.transcript.notAvailable}</pre>;
                            
                            return txt.split('\n').map((line, idx) => {
                              const match = line.match(/^\[(\d+)s\]\s(.*)/);
                              if (match) {
                                const seconds = parseInt(match[1]);
                                const textContent = match[2];
                                const displayTime = new Date(seconds * 1000).toISOString().substring(14, 19); 
                                
                                return (
                                  <div key={idx} className={styles.transcriptLine}>
                                    <button className={styles.timeBadge} onClick={() => setPlayerTime(seconds)}>
                                      {displayTime}
                                    </button>
                                    <span className={styles.transcriptTextItem}>{textContent}</span>
                                  </div>
                                );
                              }
                              return <p key={idx} className={styles.transcriptText}>{line}</p>;
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

            {/* CONTEÚDO 3: INDICE (NODE MAP) */}
            <div className={styles.nodeMapCard} style={{ position: 'relative', display: mainTab === 'indice' ? 'flex' : 'none', overflow: 'hidden' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <SkillNodeMap 
                  skill={skillData} 
                  focusedNodeId={focusedNodeId}
                  onNodeFocus={setFocusedNodeId}
                  isVisible={mainTab === 'indice'}
                />
              </div>
              
              {/* FLOATING READING PANEL */}
              {focusedNodeId && (
                <div className={styles.readingPanel} style={{
                  position: 'absolute',
                  right: 20,
                  top: 20,
                  bottom: 20,
                  width: '400px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  overflowY: 'auto',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'slideIn 0.3s ease-out'
                }}>
                  <button 
                    onClick={() => setFocusedNodeId(null)}
                    style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={20} />
                  </button>
                  {(() => {
                    if (focusedNodeId === 'root') {
                      return (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem', paddingRight: '2rem' }}>
                            <BrainCircuit size={20} className="text-primary" /> 
                            {skillData.playlistTitle || skillData.name || 'Core Skill'}
                          </h3>
                          <strong style={{ color: '#93c5fd', display: 'block', marginBottom: '0.5rem' }}>Visão Geral</strong>
                          <p style={{ color: '#cbd5e1' }}>Esta é a raiz do conhecimento consolidado.</p>
                          <p style={{ color: '#cbd5e1', marginTop: '1rem' }}>Formato Alvo: <strong>{skillData.targetFormat}</strong></p>
                        </div>
                      );
                    }

                    if (focusedNodeId === 'artifacts' || focusedNodeId.startsWith('pkg_')) {
                      return (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#f59e0b', marginBottom: '1rem', paddingRight: '2rem' }}>
                            <Box size={20} />
                            Arquivo Gerado (Plugin)
                          </h3>
                          <p style={{ color: 'var(--text-secondary)' }}>Este nó representa a saída de código/arquivos gerada pela IA após compreender toda a base de conhecimento.</p>
                          <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>Vá para a aba <strong>Plugin Source</strong> para ver o código fonte completo!</p>
                        </div>
                      );
                    }

                    if (focusedNodeId.startsWith('concept_')) {
                      return (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600, color: '#a78bfa', marginBottom: '1rem', paddingRight: '2rem' }}>
                            <Lightbulb size={20} />
                            Conceito Chave
                          </h3>
                          <p style={{ color: 'var(--text-secondary)' }}>A IA identificou este conceito de forma autônoma a partir da fonte de conhecimento.</p>
                          <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>No futuro, a IA poderá expandir este conceito iterativamente ao ler mais fontes e cruzar referências.</p>
                        </div>
                      );
                    }

                    // Caso seja um vídeo
                    const vidId = focusedNodeId.replace('vid_', '');
                    const video = skillData.videos?.find(v => v.id === vidId);
                    
                    if (!video) return <p style={{ color: 'var(--text-muted)' }}>Nó desconhecido.</p>;
                    
                    return (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem', paddingRight: '2rem' }}>
                          <Youtube size={20} className="text-red-500" />
                          {video.title}
                        </h3>
                        {video.extractedCard?.summary && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '0.5rem' }}>Resumo</strong>
                            <p>{video.extractedCard.summary}</p>
                          </div>
                        )}
                        {video.extractedCard?.keyConcepts && video.extractedCard.keyConcepts.length > 0 && (
                          <div>
                            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '0.5rem' }}>Conceitos Chave Derivados</strong>
                            <ul style={{ paddingLeft: '1.2rem' }}>
                              {video.extractedCard.keyConcepts.map((kc, idx) => (
                                <li key={idx} style={{ marginBottom: '0.5rem' }}>{kc}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

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
                <Button onClick={() => setIsModalOpen(true)} variant="secondary" className={styles.fullBtn}>
                  {dict.skillClient.sidebar.addSource}
                </Button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button onClick={handleCopyInstallCommand} variant="secondary" className={styles.fullBtn}>
                    {copiedInstall ? <Check size={16} /> : <Copy size={16} />}
                  </Button>
                  <Button onClick={handleDownload} variant="primary" className={styles.fullBtn}>
                    <Download size={16} />
                    {dict.skillClient.sidebar.download}
                  </Button>
                </div>
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
                      <span>{dict.skill.extracting}</span>
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
            
            {/* SE O MAIN É "PLUGIN" -> MOSTRA FILE TREE */}
            {mainTab === 'plugin' && isCompleted && skillData.skillPackage && skillData.skillPackage.root && (
              <div className={styles.fileTreeContainer}>
                <h3 className={styles.sidebarSectionTitle}>{dict.skillClient.sidebar.pluginFiles}</h3>
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

            {/* SE O MAIN É "INDICE" -> MOSTRA O INDICE COMO LISTA DE TÓPICOS */}
            {mainTab === 'indice' && (
              <div className={styles.indiceToolsContainer}>
                 <h3 className={styles.sidebarSectionTitle}>{dict.skillClient.sidebar.visualization || 'Índice de Conhecimento'}</h3>
                 <p className={styles.sidebarHelpText} style={{ marginBottom: '1rem' }}>
                   Navegue pelos nós do grafo clicando nos tópicos abaixo.
                 </p>
                 <div className={styles.tableOfContents}>
                   <div 
                     className={`${styles.tocItem} ${focusedNodeId === 'root' ? styles.tocItemActive : ''}`}
                     onClick={() => setFocusedNodeId('root')}
                     style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '4px', background: focusedNodeId === 'root' ? 'var(--bg-secondary)' : 'transparent', marginBottom: '0.5rem', borderLeft: focusedNodeId === 'root' ? '2px solid var(--primary)' : '2px solid transparent' }}
                   >
                     <strong>{skillData.playlistTitle || skillData.name || 'Core Skill'}</strong>
                   </div>

                   {skillData.videos && skillData.videos.length > 0 && (
                     <div style={{ paddingLeft: '1rem', borderLeft: '1px solid var(--border)', marginLeft: '0.5rem' }}>
                       {skillData.videos.map((v, idx) => {
                         const vidId = `vid_${v.id}`;
                         const isFocused = focusedNodeId === vidId;
                         return (
                           <div key={v.id} style={{ marginBottom: '0.75rem' }}>
                             <div 
                               className={`${styles.tocItem} ${isFocused ? styles.tocItemActive : ''}`}
                               onClick={() => setFocusedNodeId(vidId)}
                               style={{ cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', background: isFocused ? 'var(--bg-secondary)' : 'transparent', fontSize: '0.9rem', color: isFocused ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                             >
                               {idx + 1}. {v.title || `Vídeo ${idx + 1}`}
                             </div>
                             {v.extractedCard?.keyConcepts && v.extractedCard.keyConcepts.length > 0 && (
                               <ul style={{ paddingLeft: '1.5rem', margin: '0.25rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                 {v.extractedCard.keyConcepts.slice(0, 3).map((kc, i) => (
                                   <li key={i} style={{ marginBottom: '0.1rem' }}>{kc}</li>
                                 ))}
                               </ul>
                             )}
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </div>
              </div>
            )}

          </div>

        </div>

      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={dict.skillClient.modal.addSourceTitle}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          {dict.skillClient.modal.addSourceDesc}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="url" 
            placeholder={dict.skillClient.modal.inputPlaceholder} 
            value={appendUrl}
            onChange={e => setAppendUrl(e.target.value)}
            className={styles.urlInput}
            style={{ width: '100%' }}
          />
          <Button onClick={handleAppend} disabled={isAppending || !appendUrl} style={{ width: '100%' }}>
            {isAppending ? <Loader2 size={16} className={styles.spinner} /> : dict.skillClient.modal.processBtn}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
