"use client";

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { SkillDetail, SkillVideo, TreeNode } from '@/types/api';

type NodeCustomProps = {
  id: string;
  name: string;
  val: number;
  color: string;
  textColor: string;
};
type FGNode = NodeCustomProps & { x?: number; y?: number; fx?: number; fy?: number };

interface SkillNodeMapProps {
  skill: SkillDetail;
  focusedNodeId?: string | null;
  onNodeFocus?: (id: string) => void;
  isVisible?: boolean;
}

type ForceGraphInstance = {
  graphData: (data: unknown) => ForceGraphInstance;
  nodeRelSize: (size: number) => ForceGraphInstance;
  nodeColor: (color: string) => ForceGraphInstance;
  nodeVal: (val: string) => ForceGraphInstance;
  linkColor: (color: string) => ForceGraphInstance;
  linkWidth: {
    (fn: (link: unknown) => number): ForceGraphInstance;
    (): (link: unknown) => number;
  };
  enableNodeDrag: (enable: boolean) => ForceGraphInstance;
  cooldownTicks: (ticks: number) => ForceGraphInstance;
  onEngineStop: (fn: () => void) => ForceGraphInstance;
  onNodeClick: (fn: (node: unknown) => void) => ForceGraphInstance;
  onNodeHover: (fn: (node: unknown) => void) => ForceGraphInstance;
  nodeCanvasObject: (fn: (nodeObj: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => void) => ForceGraphInstance;
  zoomToFit: (duration: number, padding: number) => void;
  centerAt: (x: number, y: number, duration: number) => void;
  zoom: (scale: number, duration: number) => void;
  _destructor: () => void;
  width: (w: number) => void;
  height: (h: number) => void;
};

export function SkillNodeMap({ skill, focusedNodeId, onNodeFocus, isVisible = true }: SkillNodeMapProps) {
  const fgRef = useRef<ForceGraphInstance | null>(null);
  const currentFocusRef = useRef<string | null | undefined>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentFocusRef.current = focusedNodeId;
  }, [focusedNodeId]);

  const graphData = useMemo(() => {
    const nodes: FGNode[] = [];
    const links: Record<string, unknown>[] = [];
    
    // Configurações Globais Obsidian
    const LINK_COLOR = 'rgba(255, 255, 255, 0.15)';
    const CORE_COLOR = '#f8fafc';
    const SECTION_COLOR = '#94a3b8';
    const ITEM_COLOR = '#475569';
    const TEXT_COLOR = '#e2e8f0';

    const rootId = 'root';
    nodes.push({ 
      id: rootId, 
      name: skill.playlistTitle || skill.name || 'Core Skill', 
      val: 18, 
      color: CORE_COLOR,
      textColor: TEXT_COLOR
    });

    if (skill.videos && skill.videos.length > 0) {
      let previousVidId = rootId;

      skill.videos.forEach((v: SkillVideo, index: number) => {
         const vidId = `vid_${v.id}`;
         nodes.push({ 
           id: vidId, 
           name: `${index + 1}. ${v.title || 'Video'}`, 
           val: 10, 
           color: SECTION_COLOR,
           textColor: '#cbd5e1'
         });
         
         links.push({ source: previousVidId, target: vidId, color: LINK_COLOR });
         previousVidId = vidId;

         if (v.extractedCard) {
           const card = v.extractedCard;

           // If there is a GOAL, attach it explicitly
           if (card.goal) {
             const goalId = `goal_${v.id}`;
             nodes.push({
               id: goalId,
               name: `🎯 Goal: ${card.goal}`,
               val: 8,
               color: '#10b981', // Emerald green for goals
               textColor: '#ecfdf5'
             });
             links.push({ source: vidId, target: goalId, color: 'rgba(16, 185, 129, 0.4)' });

             // Attach reasoning to the goal
             if (card.reasoning) {
               const reasoningId = `reasoning_${v.id}`;
               nodes.push({
                 id: reasoningId,
                 name: `🧠 Reasoning: ${card.reasoning}`,
                 val: 6,
                 color: '#8b5cf6', // Purple for reasoning
                 textColor: '#f5f3ff'
               });
               links.push({ source: goalId, target: reasoningId, color: 'rgba(139, 92, 246, 0.4)' });
             }
           }

           // Attach setup requirements
           if (card.setupRequirements && card.setupRequirements.length > 0) {
              const setupRootId = `setup_${v.id}`;
              nodes.push({
                id: setupRootId,
                name: `⚙️ Setup Requirements`,
                val: 6,
                color: '#f59e0b', // Amber
                textColor: '#fffbeb'
              });
              links.push({ source: card.goal ? `goal_${v.id}` : vidId, target: setupRootId, color: 'rgba(245, 158, 11, 0.4)' });

              card.setupRequirements.forEach((req: string, i: number) => {
                 const reqId = `req_${v.id}_${i}`;
                 nodes.push({ id: reqId, name: req, val: 4, color: ITEM_COLOR, textColor: '#cbd5e1' });
                 links.push({ source: setupRootId, target: reqId, color: LINK_COLOR });
              });
           }

           // Attach key concepts
           if (card.keyConcepts && card.keyConcepts.length > 0) {
             // Attach to reasoning if exists, otherwise goal, otherwise video directly
             const parentId = card.reasoning ? `reasoning_${v.id}` : (card.goal ? `goal_${v.id}` : vidId);

             card.keyConcepts.slice(0, 5).forEach((kc, kcIndex) => {
               const conceptId = `concept_${v.id}_${kcIndex}`;
               nodes.push({
                 id: conceptId,
                 name: kc,
                 val: 4,
                 color: ITEM_COLOR,
                 textColor: '#94a3b8'
               });
               links.push({ source: parentId, target: conceptId, color: LINK_COLOR });
             });
           }
         }
      });
    }

    const artifactsId = 'artifacts';
    if (skill.skillPackage && skill.skillPackage.root) {
      nodes.push({ id: artifactsId, name: 'Generated Plugin', val: 14, color: SECTION_COLOR, textColor: TEXT_COLOR });
      links.push({ source: rootId, target: artifactsId, color: LINK_COLOR });

      const mapTree = (node: TreeNode, parentId: string) => {
         const nodeId = `pkg_${Math.random().toString(36).substring(2, 9)}`;
         nodes.push({ 
           id: nodeId, 
           name: node.name, 
           val: node.type === 'directory' ? 6 : 4, 
           color: ITEM_COLOR, 
           textColor: '#cbd5e1' 
         });
         links.push({ source: parentId, target: nodeId, color: LINK_COLOR });
         
         if (node.children) {
            node.children.forEach((child: TreeNode) => mapTree(child, nodeId));
         }
      };
      
      if (skill.skillPackage.root.children) {
        skill.skillPackage.root.children.forEach(child => mapTree(child, artifactsId));
      } else {
        mapTree(skill.skillPackage.root, artifactsId);
      }
    }

    return { nodes, links };
  }, [skill]);

  // Inicializa o ForceGraph vanilla apenas 1 vez e o atualiza via API nativa
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;
    let hoverNode: FGNode | null = null;

    // O React renderiza `host` e nada dentro dele. O grafo recebe um filho
    // próprio, criado aqui, para que o React nunca encontre um nó que não criou.
    const fgContainer = document.createElement('div');
    fgContainer.style.width = '100%';
    fgContainer.style.height = '100%';
    host.appendChild(fgContainer);

    import('force-graph').then((module) => {
      if (disposed) return;

      const ForceGraph = module.default;
      const graph = (ForceGraph as unknown as () => (element: HTMLElement) => unknown)()(fgContainer) as ForceGraphInstance;
      
      graph.graphData(graphData)
        .nodeRelSize(1)
        .nodeColor('color')
        .nodeVal('val')
        .linkColor('color')
        .linkWidth((link: unknown) => {
          const s = (link as { source: FGNode }).source;
          const t = (link as { target: FGNode }).target;
          const currentFocus = currentFocusRef.current;
          const isFocusedOrHovered = (currentFocus === s?.id || currentFocus === t?.id) || 
                                     (hoverNode && (hoverNode.id === s?.id || hoverNode.id === t?.id));
          return isFocusedOrHovered ? 2 : 1;
        })
        .enableNodeDrag(true)
        .cooldownTicks(100)
        .onEngineStop(() => {
          if (!currentFocusRef.current) graph.zoomToFit(400, 60);
        })
        .onNodeClick((node: unknown) => {
          const fgNode = node as FGNode;
          if (onNodeFocus) onNodeFocus(fgNode.id);
          else {
            graph.centerAt(fgNode.x || 0, fgNode.y || 0, 800);
            graph.zoom(8, 800);
          }
        })
        .onNodeHover((node: unknown) => {
          hoverNode = node as FGNode;
          if (containerRef.current) {
            containerRef.current.style.cursor = node ? 'pointer' : 'default';
          }
          // Redraw for hover effects
          graph.linkWidth(graph.linkWidth() as (link: unknown) => number);
        })
        .nodeCanvasObject((nodeObj: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const node = nodeObj as FGNode;
          const label = node.name;
          const fontSize = Math.max(10 / globalScale, 3);
          ctx.font = `${fontSize}px Inter, sans-serif`;
          
          const currentFocus = currentFocusRef.current;
          const isHovered = (hoverNode && hoverNode.id === node.id) || (currentFocus === node.id);
          const isActiveFocus = !!currentFocus || !!hoverNode;
          const isDimmed = isActiveFocus && !isHovered && node.id !== 'root';

          const nx = node.x || 0;
          const ny = node.y || 0;
          
          if (isHovered) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#60a5fa';
          } else {
            ctx.shadowBlur = 0;
          }
          
          ctx.beginPath();
          ctx.arc(nx, ny, isHovered ? node.val * 1.1 : node.val, 0, 2 * Math.PI, false);
          ctx.fillStyle = isHovered ? '#ffffff' : (isDimmed ? '#1e293b' : node.color);
          ctx.fill();
          
          ctx.shadowBlur = 0;
          
          ctx.lineWidth = 1.5 / globalScale;
          ctx.strokeStyle = isHovered ? '#93c5fd' : (isDimmed ? 'transparent' : 'rgba(255,255,255,0.1)');
          ctx.stroke();

          if (!isDimmed || globalScale > 1.2 || node.val > 10) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isHovered ? '#ffffff' : (isDimmed ? '#475569' : (node.textColor || '#e2e8f0'));
            
            if (isHovered || globalScale > 0.6) {
              const yOffset = isHovered ? node.val * 1.1 : node.val;
              ctx.fillText(label, nx, ny + yOffset + (4 / globalScale));
            }
          }
        });

      // O import pode resolver durante a desmontagem; nesse caso o grafo nasce
      // já órfão e precisa ser destruído aqui, senão vaza.
      if (disposed) {
        try { graph._destructor(); } catch { /* já desmontado */ }
        return;
      }

      // A medição inicial acontece aqui porque o efeito de resize roda antes
      // deste import resolver — sem isto o grafo nasce no tamanho padrão.
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

      // Desanexa ANTES de destruir. O `_destructor()` do force-graph mexe no
      // próprio DOM; com o contêiner já fora da árvore, nada que ele faça
      // alcança nós que o React ainda espera remover — que era a origem do
      // "Cannot read properties of null (reading 'removeChild')".
      if (fgContainer.parentNode) {
        fgContainer.parentNode.removeChild(fgContainer);
      }
      if (graph) {
        try { graph._destructor(); } catch { /* já desmontado */ }
      }
    };
  }, []); // Run once on mount

  // Sync graph data when it changes
  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.graphData(graphData);
    }
  }, [graphData]);

  // Handle external resize
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

    handleResize(); // Trigger immediately
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible]);

  // Handle external focus
  useEffect(() => {
    if (fgRef.current) {
      if (focusedNodeId) {
        const node = graphData.nodes.find((n: FGNode) => n.id === focusedNodeId);
        if (node && node.x !== undefined && node.y !== undefined) {
          fgRef.current.centerAt(node.x, node.y, 1000);
          fgRef.current.zoom(8, 1000);
        }
      }
      
      // Update linkWidth to force redraw so our internal state (currentFocusRef) is respected
      // This forces a visual update without resetting the graph state!
      fgRef.current.linkWidth(fgRef.current.linkWidth() as (link: unknown) => number);
    }
  }, [focusedNodeId, graphData]);

  return (
    <div style={{ width: '100%', height: '100%', background: 'transparent' }}>
      <div 
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
