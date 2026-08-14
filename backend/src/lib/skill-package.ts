import { z } from 'zod';
import type { SkillFormat } from '../prompts/synthesis.js';

export interface PackageFile {
  path: string;
  content: string;
}

/**
 * Main file each format's prompt is instructed to produce.
 * Single source of truth — `prompts/synthesis.ts` writes these names, the worker
 * reads them back and the download route names the attachment after them. They
 * drifted before: the worker looked only for SKILL.md/AGENTS.md while the prompt
 * emitted `.cursorrules`, `copilot-instructions.md` and `src/index.ts`, so three
 * of five formats stored an empty main file and downloaded as 404.
 */
export const MAIN_FILE_BY_FORMAT: Record<SkillFormat, string> = {
  gemini: 'SKILL.md',
  claude: '.cursorrules',
  copilot: 'copilot-instructions.md',
  mcp: 'src/index.ts',
  generic: 'AGENTS.md'
};

/** Filename offered to the browser on download. */
export const DOWNLOAD_NAME_BY_FORMAT: Record<SkillFormat, string> = {
  gemini: 'SKILL.md',
  claude: '.cursorrules',
  copilot: 'copilot-instructions.md',
  mcp: 'index.ts',
  generic: 'AGENTS.md'
};

/** Formats whose main file is prose; `mcp` emits TypeScript instead. */
const MARKDOWN_FORMATS: ReadonlySet<SkillFormat> = new Set<SkillFormat>([
  'gemini',
  'claude',
  'copilot',
  'generic'
]);

const normalize = (path: string) => path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
const basename = (path: string) => normalize(path).split('/').pop() ?? '';

/**
 * Find the file that carries the skill for a given format.
 *
 * The LLM does not always obey the requested path, so the lookup degrades:
 * exact path, then basename, then any root-level markdown, then the first file.
 * Returns `undefined` only when the package has no files at all.
 */
export function resolveMainFile(
  files: PackageFile[],
  format: SkillFormat
): PackageFile | undefined {
  if (files.length === 0) return undefined;

  const expected = normalize(MAIN_FILE_BY_FORMAT[format]);
  const expectedBase = basename(MAIN_FILE_BY_FORMAT[format]);

  return (
    files.find(f => normalize(f.path) === expected) ??
    files.find(f => basename(f.path) === expectedBase) ??
    files.find(f => !normalize(f.path).includes('/') && normalize(f.path).endsWith('.md')) ??
    files[0]
  );
}

/** A skill needs at least one heading or YAML frontmatter to be a skill. */
const hasStructure = (content: string) =>
  /^\s*---\r?\n/.test(content) || /^#{1,6}\s+\S/m.test(content);

/**
 * Semantic contract of a synthesis result — AGENTS.md rule 4.
 *
 * `services/gemini.ts` already validates the *shape* with Zod. This validates the
 * *meaning*: a package with no files, an empty main file, or prose with no heading
 * must fail the job instead of being written as `completed`.
 */
export const SynthesisResultSchema = (format: SkillFormat) =>
  z
    .object({ files: z.array(z.object({ path: z.string(), content: z.string() })) })
    .superRefine((pkg, ctx) => {
      if (pkg.files.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'synthesis returned no files' });
        return;
      }

      const main = resolveMainFile(pkg.files, format);
      if (!main) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `no main file found for format "${format}" (expected ${MAIN_FILE_BY_FORMAT[format]})`
        });
        return;
      }

      if (main.content.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `main file "${main.path}" is empty`
        });
        return;
      }

      if (MARKDOWN_FORMATS.has(format) && !hasStructure(main.content)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `main file "${main.path}" has no heading or frontmatter — not a skill`
        });
      }
    });

/** Throws with a readable message when the synthesis cannot become a skill. */
export function assertSynthesisUsable(
  pkg: { files: PackageFile[] },
  format: SkillFormat
): PackageFile {
  const result = SynthesisResultSchema(format).safeParse(pkg);

  if (!result.success) {
    const reasons = result.error.issues.map(i => i.message).join('; ');
    throw new Error(`Synthesis rejected: ${reasons}`);
  }

  // `resolveMainFile` is guaranteed to return here — the schema above proved it.
  return resolveMainFile(pkg.files, format)!;
}

/** Throws when there is nothing to synthesize from — AGENTS.md rule 4. */
export function assertCardsUsable(cards: unknown[], skillId: string): void {
  if (cards.length === 0) {
    throw new Error(
      `No knowledge extracted for skill ${skillId}: every video failed or the playlist was empty. ` +
        `Refusing to synthesize a skill from nothing.`
    );
  }
}
