const HIJACK_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i, 'ignore-previous'],
  [/disregard\s+(your|the|all)\s+(system\s+)?(prompt|instructions?|rules)/i, 'disregard-system'],
  [/you\s+are\s+now\s+(a|an|the)\s+\w+/i, 'role-reassignment'],
  [/forget\s+(everything|all|your)\s+(you|previous|prior)/i, 'forget-context'],
  [/\bsystem\s*prompt\b.*\b(reveal|print|output|show|repeat)\b/i, 'prompt-exfiltration'],
  [/<\|?\s*(im_start|im_end|system|endoftext)\s*\|?>/i, 'chat-template-token']
];

const text = "System Prompt (Email Styler): Format the following HTML newsletter with modern inline CSS styling for email clients. Display";
const text2 = "System Prompt for Email Beautification: You are a helpful assistant. Beautify the HTML below using inline CSS for email.";

function test(val: string) {
  console.log('Testing:', val);
  for (const [re, name] of HIJACK_PATTERNS) {
    if (val.match(re)) {
      console.log('Matched:', name, re);
    }
  }
}

test(text);
test(text2);
