import React, { useState, useEffect } from 'react';
import { Puzzle, X, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './SkillConnectors.module.css';

interface Connector {
  id: string;
  reason: string;
  required: boolean;
}

interface SkillConnectorsProps {
  connectors?: Connector[];
  skillName?: string;
}

export const SkillConnectors: React.FC<SkillConnectorsProps> = ({ connectors, skillName = 'Skill Central' }) => {
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [radius, setRadius] = useState(200);

  // We only show graph if we have connectors
  const hasConnectors = connectors && connectors.length > 0;

  // Responsiveness for radius
  useEffect(() => {
    const handleResize = () => {
      setRadius(window.innerWidth < 768 ? 130 : 200);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <h2 className={styles.title}>
          <Puzzle size={24} className="text-primary" />
          Conectores da Skill
        </h2>
        <p className={styles.subtitle}>
          Serviços externos e integrações que a IA configurou para esta Skill.
        </p>

        {!hasConnectors ? (
          <div className={styles.emptyState}>
            <Puzzle size={48} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>Nenhum conector requerido</h3>
            <p className={styles.emptyText}>
              Esta skill não declarou integração com serviços externos.
            </p>
          </div>
        ) : (
          <div className={styles.graphArea}>
            {/* SVG Layer for Connections */}
            <svg className={styles.svgLayer} aria-hidden="true">
              {connectors.map((conn, idx) => {
                const angle = (idx / connectors.length) * 2 * Math.PI - Math.PI / 2;
                // Center is roughly 50% 50%. Since SVG viewBox works well with absolute pixels or 100%, 
                // we'll draw lines from 50% to the computed X,Y offsets.
                const targetX = `calc(50% + ${Math.cos(angle) * radius}px)`;
                const targetY = `calc(50% + ${Math.sin(angle) * radius}px)`;
                
                return (
                  <g key={`connection-${idx}`}>
                    {/* Base faint line */}
                    <line 
                      x1="50%" y1="50%" 
                      x2={targetX} y2={targetY} 
                      className={styles.connectionLine} 
                    />
                    {/* Animated dashed line on top */}
                    <motion.line 
                      x1="50%" y1="50%" 
                      x2={targetX} y2={targetY} 
                      className={styles.animatedLine}
                      initial={{ strokeDashoffset: 100 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ 
                        duration: 3, 
                        repeat: Infinity, 
                        ease: "linear" 
                      }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Central Node */}
            <motion.div 
              className={styles.hubNode}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
            >
              <Brain size={40} className="text-primary" />
              <div className={styles.hubTitle}>{skillName}</div>
            </motion.div>

            {/* Spoke Nodes */}
            <AnimatePresence>
              {connectors.map((conn, idx) => {
                const angle = (idx / connectors.length) * 2 * Math.PI - Math.PI / 2;
                // Calculate absolute positions
                const leftOffset = Math.cos(angle) * radius;
                const topOffset = Math.sin(angle) * radius;
                const isActive = selectedConnector?.id === conn.id;

                return (
                  <motion.div
                    key={`node-${idx}`}
                    className={`${styles.spokeNode} ${isActive ? styles.spokeNodeActive : ''}`}
                    style={{
                      left: `calc(50% + ${leftOffset}px)`,
                      top: `calc(50% + ${topOffset}px)`,
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ 
                      type: 'spring', 
                      delay: idx * 0.1 + 0.2,
                      bounce: 0.4
                    }}
                    onClick={() => setSelectedConnector(conn)}
                  >
                    <div className={styles.spokeIcon}>
                      <Puzzle size={16} className={conn.required ? "text-primary" : "text-muted"} />
                    </div>
                    <div className={styles.spokeInfo}>
                      <div className={styles.spokeName}>{conn.id}</div>
                      <div className={`${styles.spokeBadge} ${conn.required ? styles.badgeRequired : styles.badgeOptional}`}>
                        {conn.required ? 'Obrigatório' : 'Opcional'}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Side Panel for Details */}
            <AnimatePresence>
              {selectedConnector && (
                <motion.div 
                  className={styles.sidePanel}
                  initial={{ opacity: 0, x: 50, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <button className={styles.closeButton} onClick={() => setSelectedConnector(null)}>
                    <X size={16} />
                  </button>
                  <div className={styles.panelHeader}>
                    <div className={styles.spokeIcon}>
                      <Puzzle size={20} className={selectedConnector.required ? "text-primary" : "text-muted"} />
                    </div>
                    <div>
                      <h4 className={styles.panelTitle}>{selectedConnector.id}</h4>
                      <div className={`${styles.spokeBadge} ${selectedConnector.required ? styles.badgeRequired : styles.badgeOptional}`}>
                        {selectedConnector.required ? 'Requisito Obrigatório' : 'Integração Opcional'}
                      </div>
                    </div>
                  </div>
                  
                  <div className={styles.panelLabel}>Motivo da Inclusão</div>
                  <p className={styles.panelReason}>{selectedConnector.reason}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
