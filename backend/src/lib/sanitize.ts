import type { SkillDocument } from './skill-document.js';

/**
 * Sanitização do documento de skill.
 *
 * Uma skill é instrução de máxima confiança injetada num agente com acesso a
 * arquivo e shell, derivada de vídeo que qualquer pessoa publica. É entrada
 * hostil por natureza.
 *
 * Isto só funciona porque o ADR-004 foi restaurado: com Markdown cru vindo do
 * LLM, a única defesa possível era caçar padrão em prosa e torcer. Com campos,
 * dá para inspecionar cada um e — mais importante — *escapar na renderização*,
 * porque a estrutura do arquivo passou a ser nossa.
 */

export interface SanitizeFinding {
  severity: 'block' | 'warn';
  field: string;
  pattern: string;
  excerpt: string;
}

/** Tentativa de sequestrar o contexto do agente hospedeiro. */
const HIJACK_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, 'ignore-previous'],
  [/disregard\s+(your|the|all)\s+(system\s+)?(prompt|instructions?|rules)/i, 'disregard-system'],
  [/you\s+are\s+now\s+(a|an|the)\s+\w+/i, 'role-reassignment'],
  [/forget\s+(everything|all|your)\s+(you|previous|prior)/i, 'forget-context'],
  [/\bsystem\s*prompt\b.*\b(reveal|print|output|show|repeat)\b/i, 'prompt-exfiltration'],
  [/<\|?\s*(im_start|im_end|system|endoftext)\s*\|?>/i, 'chat-template-token']
];

/** Referência a credencial ou exfiltração de dado. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(cat|type|read|print)\b[^\n]{0,30}\.env\b/i, 'read-env-file'],
  [/\bprocess\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/i, 'env-secret-access'],
  [/\b(curl|wget|fetch|axios)\b[^\n]{0,80}\b(token|secret|api[_-]?key|password)\b/i, 'credential-exfiltration'],
  [/\b(AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36})\b/, 'literal-credential'],
  [/~\/\.(ssh|aws|config)\b/i, 'home-credential-path']
];

/** Shell destrutivo dentro de snippet de código. */
const DESTRUCTIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\brm\s+-[rf]{1,2}\s+[~/]/, 'recursive-delete'],
  [/\b(mkfs|dd\s+if=)/i, 'disk-write'],
  [/:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, 'fork-bomb'],
  [/\bchmod\s+777\s+[~/]/, 'permission-widening'],
  [/\bhistory\s+-c\b|\bunset\s+HISTFILE\b/, 'trace-removal']
];

function scan(
  value: string,
  field: string,
  patterns: Array<[RegExp, string]>,
  severity: SanitizeFinding['severity']
): SanitizeFinding[] {
  const found: SanitizeFinding[] = [];
  for (const [re, name] of patterns) {
    const match = value.match(re);
    if (match) {
      found.push({
        severity,
        field,
        pattern: name,
        excerpt: match[0].slice(0, 120)
      });
    }
  }
  return found;
}

/** Percorre todo campo textual do documento com o rótulo do caminho. */
function walkText(doc: SkillDocument, visit: (field: string, value: string) => void): void {
  visit('title', doc.title);
  visit('description', doc.description);
  visit('goal', doc.goal);

  doc.principles.forEach((p, i) => {
    visit(`principles[${i}].title`, p.title);
    visit(`principles[${i}].rule`, p.rule);
  });

  doc.modules.forEach((m, i) => {
    visit(`modules[${i}].title`, m.title);
    visit(`modules[${i}].summary`, m.summary);
    m.sections.forEach((s, j) => {
      visit(`modules[${i}].sections[${j}].heading`, s.heading);
      visit(`modules[${i}].sections[${j}].body`, s.body);
      s.snippets.forEach((sn, k) => {
        visit(`modules[${i}].sections[${j}].snippets[${k}].code`, sn.code);
      });
    });
  });

  doc.connectors.forEach((c, i) => visit(`connectors[${i}].reason`, c.reason));

  doc.commands.forEach((c, i) => {
    visit(`commands[${i}].description`, c.description);
    c.steps.forEach((s, j) => visit(`commands[${i}].steps[${j}]`, s));
  });

  visit('humanGuide.summary', doc.humanGuide.summary);
  doc.humanGuide.sections.forEach((s, i) => {
    visit(`humanGuide.sections[${i}].heading`, s.heading);
    visit(`humanGuide.sections[${i}].body`, s.body);
  });
}

/** Inspeciona o documento inteiro e devolve tudo que foi encontrado. */
export function inspectDocument(doc: SkillDocument): SanitizeFinding[] {
  const findings: SanitizeFinding[] = [];

  walkText(doc, (field, value) => {
    findings.push(...scan(value, field, HIJACK_PATTERNS, 'block'));
    findings.push(...scan(value, field, SECRET_PATTERNS, 'block'));
    // Shell destrutivo só reprova dentro de snippet; em prosa costuma ser aviso
    // legítimo do tipo "nunca rode rm -rf /".
    const isCode = field.includes('.code');
    findings.push(...scan(value, field, DESTRUCTIVE_PATTERNS, isCode ? 'block' : 'warn'));
  });

  return findings;
}

export class SanitizeError extends Error {
  constructor(public readonly findings: SanitizeFinding[]) {
    const list = findings.map(f => `${f.field}: ${f.pattern}`).join('; ');
    super(`Skill rejeitada pela sanitização — ${list}`);
    this.name = 'SanitizeError';
  }
}

/** Reprova o documento se houver achado bloqueante. Devolve os avisos. */
export function assertDocumentSafe(doc: SkillDocument): SanitizeFinding[] {
  const findings = inspectDocument(doc);
  const blocking = findings.filter(f => f.severity === 'block');
  if (blocking.length > 0) throw new SanitizeError(blocking);
  return findings;
}

/**
 * Neutraliza um corpo de texto antes de entrar no Markdown que montamos.
 *
 * Esta é a defesa que o ADR-004 destrava. O corpo é *dado* colocado dentro de
 * um template nosso — não pode abrir frontmatter, criar heading que compita com
 * a nossa hierarquia, nem fechar uma cerca de código antes da hora.
 */
export function escapeMarkdownBody(body: string): string {
  return body
    .split('\n')
    .map(line => {
      // `---` no início de linha abriria ou fecharia frontmatter YAML.
      if (/^\s*-{3,}\s*$/.test(line)) return line.replace(/-/g, '\\-');
      // Heading do modelo vira texto em negrito: a hierarquia é nossa.
      const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
      if (heading) return `**${heading[2]}**`;
      // Cerca de código solta fecharia a nossa.
      if (/^\s*```/.test(line)) return line.replace(/```/, '\\`\\`\\`');
      return line;
    })
    .join('\n');
}

/** Cerca de código com crase suficiente para o conteúdo não escapar. */
export function fenceCode(code: string, language = 'text'): string {
  const longest = (code.match(/`+/g) ?? []).reduce((n, m) => Math.max(n, m.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}
