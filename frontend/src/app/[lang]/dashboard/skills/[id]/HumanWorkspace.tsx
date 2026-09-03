import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

import type { SkillDetail, TreeNode } from '@/types/api';
import type { Dictionary } from '@/types/dictionary';
import styles from './human.module.css';

interface HumanWorkspaceProps {
  skillData: SkillDetail;
  /** Ainda não consumido: os textos desta tela estão fixos em português.
   *  Mantido na assinatura porque a i18n desta aba é item de backlog. */
  dict: Dictionary;
}

export function HumanWorkspace({ skillData, dict }: HumanWorkspaceProps) {
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
            // eslint-disable-next-line @next/next/no-img-element
            return <img {...props} src={`data:${mime};base64,${base64}`} alt={alt} style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', border: '1px solid var(--border-light)' }} />;
          }
        }
      }
      // eslint-disable-next-line @next/next/no-img-element
      return <img {...props} src={src} alt={alt} />;
    }
  };

  return (
    <div className={styles.humanContainer}>
      
      {/* LEFT PANE: STUDY GUIDE */}
      <div className={styles.studyGuidePane}>


        <div className={styles.studyGuideContent}>
          {skillData.humanMdContent ? (
            <div className={styles.readingTypography}>
              <ReactMarkdown components={markdownComponents}>{skillData.humanMdContent}</ReactMarkdown>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>O guia de estudos ainda não está disponível para esta skill.</p>
            </div>
          )}
        </div>
      </div>



    </div>
  );
}
