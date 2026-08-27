'use client';

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { ZoomIn, ZoomOut, Maximize2, Layers, Play, Pause, X, Terminal, Cpu, FileCode, CheckCircle, ShieldCheck } from 'lucide-react';
import type { SkillDetail, TreeNode } from '@/types/api';
import styles from './nodeMap.module.css';

type NodeCategory = 'core' | 'module' | 'command' | 'principle' | 'connector' | 'file';

interface FGNode {
  id: string;
  name: string;
  category: NodeCategory;
  val: number;
  markdown: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface SkillNodeMapProps {
  skill: SkillDetail;
  isVisible?: boolean;
}

interface ForceGraphInstance {
  graphData: (data: unknown) => ForceGraphInstance;
  nodeRelSize: (size: number) => ForceGraphInstance;
  nodeColor: (color: string) => ForceGraphInstance;
  nodeVal: (val: string) => ForceGraphInstance;
  linkColor: (fnOrColor: string | ((link: unknown) => string)) => ForceGraphInstance;
  linkWidth: (fn: (link: unknown) => number) => ForceGraphInstance;
  enableNodeDrag: (enable: boolean) => ForceGraphInstance;
  enableZoomInteraction: (enable: boolean) => ForceGraphInstance;
  enablePanInteraction: (enable: boolean) => ForceGraphInstance;
  cooldownTicks: (ticks: number) => ForceGraphInstance;
  onEngineStop: (fn: () => void) => ForceGraphInstance;
  onNodeClick: (fn: (node: unknown) => void) => ForceGraphInstance;
  onNodeHover: (fn: (node: unknown) => void) => ForceGraphInstance;
  nodeCanvasObject: (fn: (nodeObj: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => void) => ForceGraphInstance;
  nodePointerAreaPaint: (fn: (nodeObj: unknown, color: string, ctx: CanvasRenderingContext2D) => void) => ForceGraphInstance;
  zoomToFit: (duration: number, padding: number) => void;
  centerAt: (x: number, y: number, duration: number) => void;
  zoom: {
    (): number;
    (scale: number, duration?: number): ForceGraphInstance;
  };
  pauseAnimation: () => void;
  resumeAnimation: () => void;
  _destructor: () => void;
  width: (w: number) => void;
  height: (h: number) => void;
}

export function SkillNodeMap({ skill, isVisible = true }: SkillNodeMapProps) {
  const fgRef = useRef<ForceGraphInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverNodeRef = useRef<FGNode | null>(null);
  const selectedNodeRef = useRef<FGNode | null>(null);

  const [selectedNode, setSelectedNode] = useState<FGNode | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  const doc = skill.skillDocument;

  // Monta a estrutura de nós com Markdown para cada nó
  const graphData = useMemo(() => {
    const nodes: FGNode[] = [];
    const links: { source: string; target: string }[] = [];

    // 1. Nó Raiz (Core Skill)
    const rootId = 'root_skill';
    const goalText = doc?.goal ? `### Objetivo Principal\n\n${doc.goal}\n\n` : '';
    const descText = doc?.description ? `### Descrição\n\n${doc.description}\n\n` : '';
    const guideText = doc?.humanGuide?.summary ? `### Guia Rápido\n\n${doc.humanGuide.summary}` : '';

    nodes.push({
      id: rootId,
      name: doc?.title || skill.name || skill.playlistTitle || 'Core Skill',
      category: 'core',
      val: 18,
      markdown: `# ${doc?.title || skill.name || 'Core Skill'}\n\n${goalText}${descText}${guideText}`,
    });

    // 2. Módulos & Arquitetura
    if (doc?.modules && doc.modules.length > 0) {
      doc.modules.forEach((mod, i) => {
        const modId = `mod_${i}`;
        const secMarkdown = mod.sections
          .map((s) => `### ${s.heading}\n\n${s.body}`)
          .join('\n\n');

        nodes.push({
          id: modId,
          name: mod.title,
          category: 'module',
          val: 11,
          markdown: `# Módulo: ${mod.title}\n\n**Visão Geral:**\n${mod.summary}\n\n${secMarkdown}`,
        });
        links.push({ source: rootId, target: modId });
      });
    }

    // 3. Comandos & Workflows Operacionais
    if (doc?.commands && doc.commands.length > 0) {
      const hubCmdId = 'hub_commands';
      nodes.push({
        id: hubCmdId,
        name: 'Workflows & Comandos',
        category: 'command',
        val: 13,
        markdown: `# Workflows & Comandos do Agente\n\nEste grupo reúne todos os comandos e procedimentos operacionais padronizados (SOPs) que o agente pode executar utilizando esta skill.`,
      });
      links.push({ source: rootId, target: hubCmdId });

      doc.commands.forEach((cmd, i) => {
        const cmdId = `cmd_${i}`;
        const stepsMarkdown = cmd.steps.map((st, sIdx) => `${sIdx + 1}. ${st}`).join('\n');
        nodes.push({
          id: cmdId,
          name: `/${cmd.name}`,
          category: 'command',
          val: 8,
          markdown: `# Comando: /${cmd.name}\n\n**Descrição:** ${cmd.description}\n\n### Passos de Execução:\n\n${stepsMarkdown}`,
        });
        links.push({ source: hubCmdId, target: cmdId });
      });
    }

    // 4. Princípios & Regras (ADRs)
    if (doc?.principles && doc.principles.length > 0) {
      const hubPrincId = 'hub_principles';
      nodes.push({
        id: hubPrincId,
        name: 'Regras & Princípios',
        category: 'principle',
        val: 12,
        markdown: `# Regras & Princípios Técnicos (ADRs)\n\nPadrões arquiteturais e restrições mandatórias que o agente deve seguir rigorosamente.`,
      });
      links.push({ source: rootId, target: hubPrincId });

      doc.principles.forEach((pr, i) => {
        const prId = `princ_${i}`;
        nodes.push({
          id: prId,
          name: pr.title,
          category: 'principle',
          val: 7,
          markdown: `# ADR-${String(i + 1).padStart(3, '0')}: ${pr.title}\n\n### Regra Obrigatória\n\n${pr.rule}`,
        });
        links.push({ source: hubPrincId, target: prId });
      });
    }

    // 5. Conectores & MCP
    if (doc?.connectors && doc.connectors.length > 0) {
      const hubMcpId = 'hub_connectors';
      nodes.push({
        id: hubMcpId,
        name: 'Conectores & MCP',
        category: 'connector',
        val: 12,
        markdown: `# Conectores de Ambiente & MCP\n\nFerramentas externas e APIs que o agente necessita para operar em capacidade máxima.`,
      });
      links.push({ source: rootId, target: hubMcpId });

      doc.connectors.forEach((conn, i) => {
        const connId = `conn_${i}`;
        nodes.push({
          id: connId,
          name: conn.id,
          category: 'connector',
          val: 7,
          markdown: `# Conector: ${conn.id}\n\n- **Obrigatório:** ${conn.required ? 'Sim' : 'Opcional'}\n- **Motivo de Uso:** ${conn.reason}`,
        });
        links.push({ source: hubMcpId, target: connId });
      });
    }

    // 6. Arquivos do Pacote
    if (skill.skillPackage?.root) {
      const hubPkgId = 'hub_package';
      nodes.push({
        id: hubPkgId,
        name: 'Arquivos do Pacote',
        category: 'file',
        val: 11,
        markdown: `# Arquivos do Pacote de Skill\n\nEstrutura de arquivos gerada e disponibilizada para importação no Claude, Copilot ou Antigravity.`,
      });
      links.push({ source: rootId, target: hubPkgId });

      const addFiles = (node: TreeNode, parentId: string) => {
        const fId = `file_${Math.random().toString(36).slice(2, 8)}`;
        const blobContent = node.sha && skill.skillPackage?.blobs[node.sha]?.content;
        const fileMd = blobContent
          ? `# Arquivo: ${node.name}\n\n\`\`\`markdown\n${blobContent}\n\`\`\``
          : `# Pasta: ${node.name}\n\nContêiner de arquivos da skill.`;

        nodes.push({
          id: fId,
          name: node.name,
          category: 'file',
          val: node.type === 'directory' ? 5 : 3.5,
          markdown: fileMd,
        });
        links.push({ source: parentId, target: fId });
        if (node.children) {
          node.children.forEach((c) => addFiles(c, fId));
        }
      };

      if (skill.skillPackage.root.children) {
        skill.skillPackage.root.children.forEach((c) => addFiles(c, hubPkgId));
      }
    }

    // Filtros
    if (filter !== 'all') {
      const filteredNodes = nodes.filter((n) => n.category === 'core' || n.category === filter);
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      const filteredLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
      return { nodes: filteredNodes, links: filteredLinks };
    }

    return { nodes, links };
  }, [skill, doc, filter]);

  // Inicializa o ForceGraph nativo com suporte a pan, scroll-zoom, anéis brancos com buraco e hover preciso
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;

    const fgContainer = document.createElement('div');
    fgContainer.style.width = '100%';
    fgContainer.style.height = '100%';
    host.appendChild(fgContainer);

    import('force-graph').then((module) => {
      if (disposed) return;

      const ForceGraph = module.default;
      const graph = (ForceGraph as unknown as () => (element: HTMLElement) => unknown)()(fgContainer) as ForceGraphInstance;

      graph
        .graphData(graphData)
        .nodeRelSize(1)
        .enableNodeDrag(true)
        .enableZoomInteraction(true)
        .enablePanInteraction(true)
        .cooldownTicks(120)
        .linkColor((link: unknown) => {
          const s = (link as { source: FGNode }).source;
          const t = (link as { target: FGNode }).target;
          const activeNode = hoverNodeRef.current || selectedNodeRef.current;
          const isConnected = activeNode && (activeNode.id === s?.id || activeNode.id === t?.id);
          return isConnected ? '#ff3333' : 'rgba(255, 255, 255, 0.08)';
        })
        .linkWidth((link: unknown) => {
          const s = (link as { source: FGNode }).source;
          const t = (link as { target: FGNode }).target;
          const activeNode = hoverNodeRef.current || selectedNodeRef.current;
          const isConnected = activeNode && (activeNode.id === s?.id || activeNode.id === t?.id);
          return isConnected ? 2.5 : 1;
        })
        .onEngineStop(() => {
          if (!selectedNodeRef.current) graph.zoomToFit(500, 70);
        })
        .onNodeClick((node: unknown) => {
          const fgNode = node as FGNode;
          setSelectedNode(fgNode);
          selectedNodeRef.current = fgNode;
          graph.centerAt(fgNode.x || 0, fgNode.y || 0, 700);
          graph.zoom(4.5, 700);
        })
        .onNodeHover((node: unknown) => {
          const fgNode = node as FGNode | null;
          hoverNodeRef.current = fgNode;
          if (containerRef.current) {
            containerRef.current.style.cursor = fgNode ? 'pointer' : 'grab';
          }
        })
        .nodePointerAreaPaint((nodeObj: unknown, color: string, ctx: CanvasRenderingContext2D) => {
          const node = nodeObj as FGNode;
          const r = node.category === 'core' ? 14 : node.val;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, r * 1.6, 0, 2 * Math.PI, false);
          ctx.fill();
        })
        .nodeCanvasObject((nodeObj: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const node = nodeObj as FGNode;
          const label = node.name;
          const isHovered = hoverNodeRef.current?.id === node.id;
          const isSelected = selectedNodeRef.current?.id === node.id;
          const isCore = node.category === 'core';

          const nx = node.x || 0;
          const ny = node.y || 0;
          const baseRadius = isCore ? 12 : node.val;
          const radius = isHovered || isSelected ? baseRadius * 1.25 : baseRadius;
          const innerRadius = radius * 0.48; // Buraco central suave

          ctx.save();

          // Anel Branco Antisserrilhado com Buraco Central
          ctx.beginPath();
          ctx.arc(nx, ny, radius, 0, 2 * Math.PI, false);
          ctx.arc(nx, ny, innerRadius, 0, 2 * Math.PI, true); // Recorte do buraco

          if (isHovered || isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ff3333';
            ctx.shadowBlur = 18;
          } else if (isCore) {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
            ctx.shadowBlur = 8;
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 0;
          }

          ctx.fill('evenodd');
          ctx.restore();

          // Rótulo do nó com tipografia limpa
          if (globalScale > 0.6 || isCore || isSelected || isHovered) {
            const fontSize = Math.max(10 / globalScale, 3.2);
            ctx.font = `${isCore ? '600 ' : '400 '}${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isSelected || isHovered ? '#ffffff' : '#94a3b8';

            const yOffset = radius + 4 / globalScale;
            ctx.fillText(label, nx, ny + yOffset);
          }
        });

      if (disposed) {
        try { graph._destructor(); } catch { /* noop */ }
        return;
      }

      if (host.clientWidth > 0 && host.clientHeight > 0) {
        graph.width(host.clientWidth);
        graph.height(host.clientHeight);
      }

      fgRef.current = graph;
    });

    return () => {
      disposed = true;
      const graph = fgRef.current;
      fgRef.current = null;
      if (fgContainer.parentNode) {
        fgContainer.parentNode.removeChild(fgContainer);
      }
      if (graph) {
        try { graph._destructor(); } catch { /* noop */ }
      }
    };
  }, []);

  // Atualiza grafo se dados/filtros mudarem
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.graphData(graphData);
    }
  }, [graphData]);

  // Redimensionamento responsivo
  useEffect(() => {
    const handleResize = () => {
      if (fgRef.current && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          fgRef.current.width(clientWidth);
          fgRef.current.height(clientHeight);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible]);

  const handleZoomIn = useCallback(() => {
    if (!fgRef.current) return;
    const current = fgRef.current.zoom();
    fgRef.current.zoom(current * 1.5, 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!fgRef.current) return;
    const current = fgRef.current.zoom();
    fgRef.current.zoom(current / 1.5, 300);
  }, []);

  const handleFit = useCallback(() => {
    if (fgRef.current) fgRef.current.zoomToFit(500, 70);
  }, []);

  const togglePause = useCallback(() => {
    if (!fgRef.current) return;
    if (isPaused) {
      fgRef.current.resumeAnimation();
      setIsPaused(false);
    } else {
      fgRef.current.pauseAnimation();
      setIsPaused(true);
    }
  }, [isPaused]);

  const getCategoryIcon = (category: NodeCategory) => {
    switch (category) {
      case 'core': return <Cpu size={16} className={styles.iconCore} />;
      case 'command': return <Terminal size={16} className={styles.iconCommand} />;
      case 'module': return <Layers size={16} className={styles.iconModule} />;
      case 'principle': return <ShieldCheck size={16} className={styles.iconPrinciple} />;
      case 'connector': return <CheckCircle size={16} className={styles.iconConnector} />;
      case 'file': return <FileCode size={16} className={styles.iconFile} />;
      default: return <Cpu size={16} />;
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Controles Flutuantes (HUD) */}
      <div className={styles.hudTopRight}>
        <div className={styles.filterGroup}>
          <button
            className={`${styles.filterBtn} ${filter === 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'command' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('command')}
          >
            Comandos
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'module' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('module')}
          >
            Módulos
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'principle' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('principle')}
          >
            Regras
          </button>
        </div>

        <div className={styles.controlButtons}>
          <button className={styles.iconBtn} onClick={handleZoomIn} title="Aproximar (+)">
            <ZoomIn size={16} />
          </button>
          <button className={styles.iconBtn} onClick={handleZoomOut} title="Afastar (-)">
            <ZoomOut size={16} />
          </button>
          <button className={styles.iconBtn} onClick={handleFit} title="Centralizar Tudo">
            <Maximize2 size={16} />
          </button>
          <button className={styles.iconBtn} onClick={togglePause} title={isPaused ? 'Retomar Física' : 'Congelar'}>
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
      </div>

      {/* Inspetor Lateral com Leitor de Markdown Formatado */}
      {selectedNode && (
        <aside className={styles.inspector}>
          <header className={styles.inspectorHeader}>
            <div className={styles.inspectorTitleWrap}>
              {getCategoryIcon(selectedNode.category)}
              <h3 className={styles.inspectorTitle}>{selectedNode.name}</h3>
            </div>
            <button className={styles.closeBtn} onClick={() => setSelectedNode(null)}>
              <X size={15} />
            </button>
          </header>

          <div className={styles.inspectorContent}>
            <div className={styles.markdownBody}>
              <ReactMarkdown>{selectedNode.markdown}</ReactMarkdown>
            </div>
          </div>
        </aside>
      )}

      {/* Canvas do Grafo Interativo */}
      <div ref={containerRef} className={styles.graphContainer} />
    </div>
  );
}
