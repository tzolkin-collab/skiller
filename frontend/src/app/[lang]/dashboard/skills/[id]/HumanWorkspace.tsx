import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Play, Sparkles, Send, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/Card/Card';
import type { SkillDetail } from '@/types/api';
import type { Dictionary } from '@/types/dictionary';
import styles from './human.module.css';

interface HumanWorkspaceProps {
  skillData: SkillDetail;
  /** Ainda não consumido: os textos desta tela estão fixos em português.
   *  Mantido na assinatura porque a i18n desta aba é item de backlog. */
  dict: Dictionary;
}

export function HumanWorkspace({ skillData, dict }: HumanWorkspaceProps) {
  return (
    <div className={styles.humanContainer}>
      
      {/* LEFT PANE: STUDY GUIDE */}
      <div className={styles.studyGuidePane}>
        <div className={styles.studyGuideHeader}>
          <h1 className={styles.guideTitle}>{skillData.playlistTitle || skillData.name || 'Guia de Estudos'}</h1>
          <div className={styles.guideMeta}>
            <span className={styles.badge}><Sparkles size={12}/> Síntese de IA</span>
            <span className={styles.metaText}>{skillData.videos?.length || 1} fontes processadas</span>
          </div>
        </div>

        <div className={styles.studyGuideContent}>
          {skillData.humanMdContent ? (
            <div className={styles.readingTypography}>
              <ReactMarkdown>{skillData.humanMdContent}</ReactMarkdown>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>O guia de estudos ainda não está disponível para esta skill.</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANE: TOOLS & CHAT */}
      <div className={styles.toolsPane}>
        
        {/* AUDIO OVERVIEW MOCK */}
        <Card className={styles.audioCard} glass>
          <div className={styles.audioHeader}>
            <h3 className={styles.audioTitle}>Audio Overview</h3>
            <span className={styles.betaBadge}>BETA</span>
          </div>
          <p className={styles.audioDesc}>Ouça um podcast gerado por IA debatendo os principais conceitos deste conteúdo.</p>
          <button className={styles.audioPlayBtn}>
            <Play size={18} fill="currentColor" />
            <span>Gerar e Ouvir (Mock)</span>
          </button>
        </Card>

        {/* CHAT INTERFACE MOCK */}
        <div className={styles.chatContainer}>
          <div className={styles.chatHeader}>
            <MessageSquare size={18} />
            <span style={{ fontWeight: 600 }}>Conversar com a Skill</span>
          </div>
          
          <div className={styles.chatHistory}>
            <div className={styles.chatMessageBot}>
              <p>Olá! Eu li todo o conteúdo desta skill para você. O que você gostaria de explorar mais a fundo?</p>
            </div>
          </div>

          <div className={styles.chatInputWrapper}>
            <input 
              type="text" 
              className={styles.chatInput} 
              placeholder="Faça uma pergunta sobre o conteúdo..." 
              disabled
            />
            <button className={styles.chatSendBtn} disabled>
              <Send size={16} />
            </button>
          </div>
          <p className={styles.chatDisclaimer}>O chat ao vivo será implementado na próxima versão.</p>
        </div>

      </div>

    </div>
  );
}
