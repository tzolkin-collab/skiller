import React, { useState } from 'react';
import { Folder, FolderOpen, FileCode, ChevronRight, ChevronDown } from 'lucide-react';
import { TreeNode } from '@/types/api';
import styles from './FileTree.module.css';

interface FileTreeProps {
  node: TreeNode;
  level?: number;
  activeSha: string | null;
  onSelectFile: (sha: string, path: string) => void;
  currentPath?: string;
}

export function FileTree({ node, level = 0, activeSha, onSelectFile, currentPath = '' }: FileTreeProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Skip rendering the root 'root' directory if we want, or just render it
  const isRootLevel = level === 0 && node.name === 'root';
  const fullPath = isRootLevel ? '' : (currentPath ? `${currentPath}/${node.name}` : node.name);

  if (node.type === 'file') {
    const isActive = activeSha === node.sha;
    return (
      <div 
        className={`${styles.fileNode} ${isActive ? styles.active : ''}`}
        style={{ paddingLeft: `${(level * 16) + 12}px` }}
        onClick={() => node.sha && onSelectFile(node.sha, fullPath)}
      >
        <FileCode size={16} className={isActive ? styles.activeIcon : styles.icon} />
        <span className={styles.label}>{node.name}</span>
      </div>
    );
  }

  // If it's the invisible root, just render children
  if (isRootLevel) {
    return (
      <div className={styles.rootContainer}>
        {node.children && node.children.map((child, idx) => (
          <FileTree 
            key={idx} 
            node={child} 
            level={0} 
            activeSha={activeSha} 
            onSelectFile={onSelectFile}
            currentPath={fullPath}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.directoryNode}>
      <div 
        className={styles.directoryHeader} 
        style={{ paddingLeft: `${(level * 16) + 12}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.chevron}>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {isOpen ? <FolderOpen size={16} className={styles.folderIcon} /> : <Folder size={16} className={styles.folderIcon} />}
        <span className={styles.label}>{node.name}</span>
      </div>
      
      {isOpen && node.children && (
        <div className={styles.children}>
          {node.children.map((child, idx) => (
            <FileTree 
              key={idx} 
              node={child} 
              level={level + 1} 
              activeSha={activeSha} 
              onSelectFile={onSelectFile}
              currentPath={fullPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
