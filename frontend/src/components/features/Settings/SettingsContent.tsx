'use client';

import React, { useState } from 'react';
import { User, CreditCard, Sliders, Link as LinkIcon, Check, Sparkles } from 'lucide-react';
import styles from './Settings.module.css';

interface SettingsContentProps {
  dict: any;
}

export function SettingsContent({ dict }: SettingsContentProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'plan' | 'preferences' | 'connections'>('account');

  return (
    <div className={styles.container}>
      {/* SIDEBAR */}
      <div className={styles.sidebar}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'account' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('account')}
        >
          <User size={18} />
          {dict.settings.tabs.account}
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'plan' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('plan')}
        >
          <CreditCard size={18} />
          {dict.settings.tabs.plan}
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'preferences' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          <Sliders size={18} />
          {dict.settings.tabs.preferences}
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'connections' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('connections')}
        >
          <LinkIcon size={18} />
          {dict.settings.tabs.connections}
        </button>
      </div>

      {/* CONTENT */}
      <div className={styles.content}>
        
        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>{dict.settings.account.profile}</h3>
            
            <div className={styles.profileSection}>
              <div className={styles.avatarLarge}>U</div>
              <div className={styles.profileDetails}>
                <div className={styles.fieldGroup}>
                  <label>{dict.settings.account.name}</label>
                  <input type="text" value="Pro User" readOnly className={styles.input} />
                </div>
                <div className={styles.fieldGroup}>
                  <label>{dict.settings.account.email}</label>
                  <input type="email" value="user@example.com" readOnly className={styles.input} />
                </div>
              </div>
            </div>
            
            <div className={styles.infoRow}>
              <span>{dict.settings.account.memberSince}</span>
              <strong>Agosto 2026</strong>
            </div>
          </div>
        )}

        {/* PLAN TAB */}
        {activeTab === 'plan' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>{dict.settings.plan.currentPlan}</h3>
            
            <div className={styles.currentPlanCard}>
              <div className={styles.planHeader}>
                <div className={styles.planBadge}>{dict.settings.plan.starter}</div>
                <div className={styles.planPrice}>$9.90<span>/mo</span></div>
              </div>
              <p className={styles.planDesc}>Você está no plano Starter. Acesso restrito a extrações e skills públicas.</p>
            </div>

            <div className={styles.upsellCard}>
              <div className={styles.upsellHeader}>
                <Sparkles size={20} className={styles.upsellIcon} />
                <h4>{dict.settings.plan.upgradeToPro}</h4>
              </div>
              
              <ul className={styles.benefitsList}>
                <li><Check size={16} className={styles.checkIcon} /> {dict.settings.plan.benefit1}</li>
                <li><Check size={16} className={styles.checkIcon} /> {dict.settings.plan.benefit2}</li>
                <li><Check size={16} className={styles.checkIcon} /> {dict.settings.plan.benefit3}</li>
              </ul>
              
              <button className={styles.upgradeBtn}>{dict.settings.plan.upgradeToPro} - $10/mo</button>
            </div>
          </div>
        )}

        {/* PREFERENCES TAB */}
        {activeTab === 'preferences' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>{dict.settings.preferences.theme}</h3>
            <div className={styles.themeOptions}>
              <button className={`${styles.themeBtn} ${styles.themeActive}`}>Dark (Default)</button>
              <button className={styles.themeBtn} disabled>Light (Soon)</button>
            </div>
          </div>
        )}

        {/* CONNECTIONS TAB */}
        {activeTab === 'connections' && (
          <div className={styles.tabContent}>
            <h3 className={styles.sectionTitle}>{dict.settings.connections.apiKeys}</h3>
            <div className={styles.fieldGroup}>
              <label>Gemini API Key (Local Override)</label>
              <input type="password" placeholder="AIzaSy..." className={styles.input} />
              <p className={styles.helpText}>Para usar o seu próprio rate limit de IA, insira sua chave do Google AI Studio.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
