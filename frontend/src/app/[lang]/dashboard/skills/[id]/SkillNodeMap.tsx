"use client";

import React, { useRef, useMemo, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { SkillDetail, SkillVideo, TreeNode } from '@/types/api';

// Disable SSR for react-force-graph-2d since it relies on window/canvas
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

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

export function SkillNodeMap({ skill, focusedNodeId, onNodeFocus, isVisible = true }: SkillNodeMapProps) {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverNode, setHoverNode] = useState<FGNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-resize
  useEffect(() => {
    if (isVisible && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    }
    const handleResize = () => {
      if (isVisible && containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible]);

  const graphData = useMemo(() => {
    const nodes: FGNode[] = [];
    const links: Record<string, unknown>[] = [];
    
    // Configurações Globais Obsidian
    const LINK_COLOR = 'rgba(255, 255, 255, 0.15)';
    const CORE_COLOR = '#f8fafc'; // Branco puro
    const SECTION_COLOR = '#94a3b8'; // Cinza claro
    const ITEM_COLOR = '#475569'; // Cinza escuro
    const TEXT_COLOR = '#e2e8f0';

    // Root Node (The Skill)
    const rootId = 'root';
    nodes.push({ 
      id: rootId, 
      name: skill.playlistTitle || skill.name || 'Core Skill', 
      val: 18, 
      color: CORE_COLOR,
      textColor: TEXT_COLOR
    });

    // BRANCH 1: KNOWLEDGE SEQUENCE & CONCEPTS
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
         
         // Connect sequentially to create a timeline/line of reasoning
         links.push({ source: previousVidId, target: vidId, color: LINK_COLOR });
         previousVidId = vidId;

         // Concepts Network
         if (v.extractedCard?.keyConcepts && v.extractedCard.keyConcepts.length > 0) {
           v.extractedCard.keyConcepts.slice(0, 5).forEach((kc, kcIndex) => {
             const conceptId = `concept_${v.id}_${kcIndex}`;
             nodes.push({
               id: conceptId,
               name: kc,
               val: 4,
               color: ITEM_COLOR,
               textColor: '#94a3b8'
             });
             links.push({ source: vidId, target: conceptId, color: LINK_COLOR });
           });
         }
      });
    }

    // BRANCH 2: GENERATED ARTIFACTS (FILES & PLUGIN)
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
      
      // Start mapping from root's children
      if (skill.skillPackage.root.children) {
        skill.skillPackage.root.children.forEach(child => mapTree(child, artifactsId));
      } else {
        mapTree(skill.skillPackage.root, artifactsId);
      }
    }

    return { nodes, links };
  }, [skill]);

  // Handle external focus
  useEffect(() => {
    if (focusedNodeId && fgRef.current) {
      const node = graphData.nodes.find((n: FGNode) => n.id === focusedNodeId);
      if (node && node.x !== undefined && node.y !== undefined) {
        fgRef.current.centerAt(node.x, node.y, 1000);
        fgRef.current.zoom(8, 1000);
        setHoverNode(node as FGNode);
      }
    } else if (!focusedNodeId && hoverNode) {
      setHoverNode(null);
    }
  }, [focusedNodeId, graphData]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }}>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeRelSize={1}
        nodeColor="color"
        nodeVal="val"
        linkColor="color"
        linkWidth={(link: Record<string, unknown>) => {
          const s = link.source as FGNode;
          const t = link.target as FGNode;
          const isFocusedOrHovered = (focusedNodeId === s?.id || focusedNodeId === t?.id) || 
                                     (hoverNode && (hoverNode.id === s?.id || hoverNode.id === t?.id));
          return isFocusedOrHovered ? 2 : 1;
        }}
        enableNodeDrag={true}
        cooldownTicks={100}
        onEngineStop={() => {
          if (!focusedNodeId) {
            fgRef.current?.zoomToFit(400, 60);
          }
        }}
        onNodeClick={(node: unknown) => {
          const n = node as FGNode;
          if (onNodeFocus) onNodeFocus(n.id);
          else {
            fgRef.current?.centerAt(n.x || 0, n.y || 0, 800);
            fgRef.current?.zoom(8, 800);
          }
        }}
        onNodeHover={(node: unknown) => {
          const n = node as FGNode | null;
          if (!focusedNodeId) setHoverNode(n || null);
          if (containerRef.current) {
            containerRef.current.style.cursor = n ? 'pointer' : 'default';
          }
        }}
        nodePointerAreaPaint={(nodeObj: unknown, color: string, ctx: CanvasRenderingContext2D) => {
          const node = nodeObj as FGNode;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x || 0, node.y || 0, node.val * 2, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        nodeCanvasObject={(nodeObj: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const node = nodeObj as FGNode;
          const label = node.name;
          const fontSize = Math.max(10 / globalScale, 3);
          ctx.font = `${fontSize}px Inter, sans-serif`;
          
          const isHovered = (hoverNode && hoverNode.id === node.id) || (focusedNodeId === node.id);
          // If there is an active focus, nodes that are NOT focused and NOT root get slightly dimmed
          const isActiveFocus = !!focusedNodeId || !!hoverNode;
          const isDimmed = isActiveFocus && !isHovered && node.id !== 'root';

          const nx = node.x || 0;
          const ny = node.y || 0;
          
          // Obsidian style Glow (subtle neon around the bright core)
          if (isHovered) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#60a5fa'; // Blueish glow
          } else {
            ctx.shadowBlur = 0;
          }
          
          // Node Circle
          ctx.beginPath();
          ctx.arc(nx, ny, isHovered ? node.val * 1.1 : node.val, 0, 2 * Math.PI, false);
          ctx.fillStyle = isHovered ? '#ffffff' : (isDimmed ? '#1e293b' : node.color);
          ctx.fill();
          
          // Clear shadow for stroke and text
          ctx.shadowBlur = 0;
          
          // Node Stroke
          ctx.lineWidth = 1.5 / globalScale;
          ctx.strokeStyle = isHovered ? '#93c5fd' : (isDimmed ? 'transparent' : 'rgba(255,255,255,0.1)');
          ctx.stroke();

          // Label
          if (!isDimmed || globalScale > 1.2 || node.val > 10) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isHovered ? '#ffffff' : (isDimmed ? '#475569' : (node.textColor || '#e2e8f0'));
            
            if (isHovered || globalScale > 0.6) {
              const yOffset = isHovered ? node.val * 1.1 : node.val;
              ctx.fillText(label, nx, ny + yOffset + (4 / globalScale));
            }
          }
        }}
      />
    </div>
  );
}
