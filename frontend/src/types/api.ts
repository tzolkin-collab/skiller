/**
 * Shapes returned by the backend API (see backend/src/routes/skills.ts).
 * Kept hand-written rather than generated so the frontend does not depend on
 * the backend package.
 */

export type SkillStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type VideoProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SkillSummary {
  id: string;
  playlistUrl: string;
  playlistTitle: string | null;
  channelName: string | null;
  channelId: string | null;
  name: string | null;
  description: string | null;
  targetFormat: string | null;
  version: number | null;
  status: SkillStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-video extraction result. Mirrors `CardSchema` in
 * backend/src/services/gemini.ts — keep the two in sync.
 */
export interface ExtractedCard {
  title: string;
  keyConcepts: string[];
  summary: string;
  codeSnippets: string[];
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

export interface SkillDetail extends SkillSummary {
  skillMdContent: string | null;
  humanMdContent: string | null;
  skillPackage: PluginPackage | null;
  videos: SkillVideo[];
}

export interface QueueJobStatus {
  progress: number;
  state: string;
}
