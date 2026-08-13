"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card/Card';
import { Plug, MessageSquare, Plus, Terminal, Bot } from 'lucide-react';
import { DownloadProfileButton } from './DownloadProfileButton';
import styles from '../page.module.css';
import { Button } from '@/components/ui/Button/Button';

const SlackLogo = () => (
  <svg width="24" height="24" viewBox="0 0 244 244" xmlns="http://www.w3.org/2000/svg">
    <path d="M88.262 127.348c0 14.591-11.83 26.421-26.42 26.421-14.592 0-26.422-11.83-26.422-26.421 0-14.59 11.83-26.421 26.421-26.421h26.421v26.421z" fill="#E01E5A"/>
    <path d="M101.472 127.348c0-14.59 11.83-26.421 26.422-26.421 14.59 0 26.421 11.83 26.421 26.421v66.052c0 14.591-11.83 26.422-26.421 26.422-14.592 0-26.422-11.831-26.422-26.422v-66.052z" fill="#E01E5A"/>
    <path d="M116.652 88.262c-14.591 0-26.421-11.83-26.421-26.42 0-14.592 11.83-26.422 26.421-26.422 14.59 0 26.421 11.83 26.421 26.422v26.42H116.65z" fill="#36C5F0"/>
    <path d="M116.652 101.472c14.59 0 26.421 11.83 26.421 26.422 0 14.59-11.83 26.421-26.421 26.421H50.6c-14.591 0-26.422-11.83-26.422-26.421 0-14.592 11.831-26.422 26.422-26.422h66.052z" fill="#36C5F0"/>
    <path d="M155.738 116.652c0-14.591 11.83-26.421 26.42-26.421 14.592 0 26.422 11.83 26.422 26.421 0 14.59-11.83 26.421-26.421 26.421h-26.421v-26.421z" fill="#2EB67D"/>
    <path d="M142.528 116.652c0 14.59-11.83 26.421-26.422 26.421-14.59 0-26.421-11.83-26.421-26.421V50.6c0-14.591 11.83-26.422 26.421-26.422 14.592 0 26.422 11.831 26.422 26.422v66.052z" fill="#2EB67D"/>
    <path d="M127.348 155.738c14.591 0 26.421 11.83 26.421 26.42 0 14.592-11.83 26.422-26.421 26.422-14.59 0-26.421-11.83-26.421-26.422v-26.42h26.421z" fill="#ECB22E"/>
    <path d="M127.348 142.528c-14.59 0-26.421-11.83-26.421-26.422 0-14.59 11.83-26.421 26.421-26.421h66.052c14.591 0 26.422 11.83 26.422 26.421 0 14.592-11.831 26.422-26.422 26.422h-66.052z" fill="#ECB22E"/>
  </svg>
);

const NotionLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.459 4.208c.746-.576 1.848-.783 3.633-.783h.142l8.286.002c1.785 0 2.887.207 3.633.783.565.437.892 1.135 1.01 1.944L22 17.583c.118.81-.07 1.57-.565 2.008-.746.577-1.848.783-3.633.783h-8.43v-2h8.43c1.233 0 1.905-.116 2.305-.425.26-.201.353-.55.28-1.057l-1.077-10.99c-.063-.64-.265-.968-.525-1.168-.4-.309-1.072-.425-2.305-.425l-8.286-.002c-1.233 0-1.905.116-2.305.425-.26.2-.353.548-.28 1.056L6.5 14.582h-2l-.845-9.431c-.118-.809.07-1.57.565-2.008l.239.065zm2.748 10.996l3.52 4.19v2.18l-5.35-6.37h1.83zm3.52-5.32l3.415 4.065h-1.92l-3.415-4.065h1.92z"/>
  </svg>
);

const CursorLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4L20 12L12 15L9 22L4 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const ClaudeLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" preserveAspectRatio="xMidYMid" viewBox="0 0 256 257">
    <path fill="#D97757" d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/>
  </svg>
);

const ChatGPTLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" preserveAspectRatio="xMidYMid" viewBox="0 0 256 260" fill="currentColor">
    <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/>
  </svg>
);

const GeminiLogo = () => (
  <svg viewBox="0 0 296 298" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none">
    <mask id="gemini-mask" width="296" height="298" x="0" y="0" maskUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
      <path fill="#3186FF" d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"/>
    </mask>
    <g mask="url(#gemini-mask)">
      <g filter="url(#gemini-b)">
        <ellipse cx="163" cy="149" fill="#3689FF" rx="196" ry="159"/>
      </g>
      <g filter="url(#gemini-c)">
        <ellipse cx="33.5" cy="142.5" fill="#F6C013" rx="68.5" ry="72.5"/>
      </g>
      <g filter="url(#gemini-d)">
        <ellipse cx="19.5" cy="148.5" fill="#F6C013" rx="68.5" ry="72.5"/>
      </g>
      <g filter="url(#gemini-e)">
        <path fill="#FA4340" d="M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5Z"/>
      </g>
      <g filter="url(#gemini-f)">
        <path fill="#FA4340" d="M190.5-12.5C168.5 59.5 62 111.333 19 112L140.5-89l50 76.5Z"/>
      </g>
      <g filter="url(#gemini-g)">
        <path fill="#14BB69" d="M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5Z"/>
      </g>
      <g filter="url(#gemini-h)">
        <path fill="#14BB69" d="M196.5 320.5C174.5 248.5 68 196.667 25 196l121.5 201 50-76.5Z"/>
      </g>
    </g>
    <defs>
      <filter id="gemini-b" width="464" height="390" x="-69" y="-46" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="18"/>
      </filter>
      <filter id="gemini-c" width="265" height="273" x="-99" y="6" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
      </filter>
      <filter id="gemini-d" width="265" height="273" x="-113" y="12" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
      </filter>
      <filter id="gemini-e" width="299.5" height="329" x="-41.5" y="-130" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
      </filter>
      <filter id="gemini-f" width="299.5" height="329" x="-45" y="-153" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
      </filter>
      <filter id="gemini-g" width="299.5" height="329" x="-41" y="91" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
      </filter>
      <filter id="gemini-h" width="299.5" height="329" x="-39" y="132" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix"/>
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/>
      </filter>
    </defs>
  </svg>
);

export default function ConnectorsClient({ dict, lang }: { dict: Record<string, Record<string, string>>, lang: string }) {
  const [activeTab, setActiveTab] = useState<'ide' | 'chat'>('chat');

  const handleConnect = async (provider: string) => {
    // Initiate standard OAuth flow
    window.location.href = `/api/oauth/connect/${provider}`;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{dict.dashboard.connector}</h1>
        <p className={styles.subtitle}>{dict.dashboard.connectorsSubtitle}</p>
      </header>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('chat')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'chat' ? '2px solid var(--text-primary)' : '2px solid transparent',
            color: activeTab === 'chat' ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <MessageSquare size={16} /> Chat & Coworking
        </button>
        <button
          onClick={() => setActiveTab('ide')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'ide' ? '2px solid var(--text-primary)' : '2px solid transparent',
            color: activeTab === 'ide' ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Plug size={16} /> IDE Integrations
        </button>
      </div>

      {activeTab === 'ide' && (
        <div className={styles.grid}>
          <Card className={styles.skillCard} style={{ background: 'linear-gradient(to bottom right, var(--bg-primary), rgba(255,255,255,0.02))', border: '1px solid var(--border)' }}>
            <CardHeader>
              <CardTitle className={styles.skillTitle}>
                <Terminal size={18} className={styles.titleIcon} style={{ color: 'var(--text-primary)' }} />
                {dict.dashboard.localMcpTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={styles.skillDesc}>
                Authenticate your local environment to allow IDEs to request and install skills directly.
              </p>
              <div className={styles.skillMeta} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  npx @skiller/mcp-server auth login
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Run this command in your terminal. You will be prompted to enter a code in the browser to authorize your machine.
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.skillCard} style={{ background: 'linear-gradient(to bottom right, var(--bg-primary), rgba(211,167,124,0.05))', border: '1px solid var(--border)' }}>
            <CardHeader>
              <CardTitle className={styles.skillTitle}>
                <div style={{ display: 'flex', gap: '0.5rem', marginRight: '0.5rem' }}>
                  <CursorLogo />
                </div>
                {dict.dashboard.ideTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={styles.skillDesc}>
                {dict.dashboard.ideDesc}
              </p>
              <div className={styles.skillMeta} style={{ marginTop: '1rem' }}>
                <DownloadProfileButton text={dict.dashboard.downloadProfile} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className={styles.grid}>
          <Card className={styles.skillCard} style={{ background: 'linear-gradient(to bottom right, var(--bg-primary), rgba(211, 167, 124, 0.05))', border: '1px solid var(--border)' }}>
            <CardHeader>
              <CardTitle className={styles.skillTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClaudeLogo />
                Claude Desktop (MCP)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={styles.skillDesc}>
                Connect Skiller MCP to Claude Desktop so your AI assistant can discover and execute your skills in real-time.
              </p>
              <div className={styles.skillMeta} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  {`"skiller": {\n  "command": "npx",\n  "args": ["-y", "@skiller/mcp-server", "start"]\n}`}
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Add this to your claude_desktop_config.json
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.skillCard} style={{ background: 'linear-gradient(to bottom right, var(--bg-primary), rgba(16, 163, 127, 0.05))', border: '1px solid var(--border)' }}>
            <CardHeader>
              <CardTitle className={styles.skillTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ChatGPTLogo />
                ChatGPT (MCP)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={styles.skillDesc}>
                Connect Skiller MCP to ChatGPT using compatible open-source clients or native integration (when available).
              </p>
              <div className={styles.skillMeta} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  https://api.skiller.local/mcp
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Configure your MCP client to point to the SSE remote endpoint.
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.skillCard} style={{ background: 'linear-gradient(to bottom right, var(--bg-primary), rgba(27, 113, 242, 0.05))', border: '1px solid var(--border)' }}>
            <CardHeader>
              <CardTitle className={styles.skillTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <GeminiLogo />
                Google Gemini (MCP)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={styles.skillDesc}>
                Use Skiller MCP with Google Gemini Advanced (via internal tools extension) or compatible Gemini Chat interfaces.
              </p>
              <div className={styles.skillMeta} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                  https://api.skiller.local/mcp
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Configure your Gemini MCP Extension with the URL above.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
