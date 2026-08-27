/**
 * Shapes returned by the backend API (see backend/src/routes/skills.ts).
 * Kept hand-written rather than generated so the frontend does not depend on
 * the backend package.
 */

export type SkillStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type VideoProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type SkillNiche =
  | 'marketing'
  | 'sales'
  | 'traffic'
  | 'development'
  | 'productivity'
  | 'design'
  | 'finance'
  | 'other';

export const SKILL_NICHES: SkillNiche[] = [
  'marketing',
  'sales',
  'traffic',
  'development',
  'productivity',
  'design',
  'finance',
  'other',
];

export interface SkillSummary {
  id: string;
  playlistUrl: string;
  playlistTitle: string | null;
  channelName: string | null;
  channelId: string | null;
  channelImageUrl: string | null;
  name: string | null;
  description: string | null;
  targetFormat: string | null;
  version: number | null;
  status: SkillStatus;
  /** Nicho inferido pela IA na síntese (field do skillDocument). Undefined em skills antigas. */
  niche?: SkillNiche | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-video extraction result. Mirrors `CardSchema` in
 * backend/src/services/gemini.ts — keep the two in sync.
 */
export interface ExtractedCard {
  title: string;
  goal?: string;
  reasoning?: string;
  setupRequirements?: string[];
  keyConcepts: string[];
  summary: string;
  codeSnippets: string[];
  transcriptParagraphs?: {
    startTime: number;
    endTime: number;
    text: string;
    isImportant: boolean;
  }[];
}

export interface SkillVideo {
  id: string;
  videoId: string;
  url: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  processingStatus: VideoProcessingStatus;
  error: string | null;
  transcriptContent: string | null;
  extractedCard: ExtractedCard | null;
  spritesheetUrl?: string | null;
  spritesheetMetadata?: {
    cols: number;
    rows: number;
    intervalSeconds: number;
  } | null;
}

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  sha?: string;
  children?: TreeNode[];
}

export interface PluginPackage {
  root: TreeNode;
  blobs: Record<string, { content: string }>;
}

export interface SkillDocument {
  name: string;
  title: string;
  description: string;
  goal: string;
  niche?: SkillNiche;
  principles: { title: string; rule: string }[];
  modules: {
    slug: string;
    title: string;
    summary: string;
    sections: {
      heading: string;
      body: string;
      snippets?: { language: string; code: string; caption?: string }[];
    }[];
  }[];
  connectors: { id: string; reason: string; required: boolean }[];
  commands: { name: string; description: string; steps: string[] }[];
  humanGuide: {
    summary: string;
    sections: { heading: string; body: string }[];
    mermaid?: string;
  };
}

export interface SkillDetail extends SkillSummary {
  skillMdContent: string | null;
  humanMdContent: string | null;
  skillPackage: PluginPackage | null;
  skillDocument?: SkillDocument | null;
  videos: SkillVideo[];
}

export interface QueueJobStatus {
  progress: number;
  state: string;
}
