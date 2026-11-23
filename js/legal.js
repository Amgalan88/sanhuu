import { LEGAL } from './legal-config.js';
import { PRIVACY_MD, TERMS_MD } from './legal-copy.js';

export const DRAFT_BANNER = 'Ноорог — хуульчаар хянуулаагүй';

const TOKENS = [
  ['[БҮС НУТАГ]', (config) => config.region],
  ['[ХУВЬ ХҮН/ААН-ИЙН НЭР]', (config) => config.controllerName],
  ['[И-МЭЙЛ]', (config) => config.email],
  ['[ОГНОО]', (config) => config.effectiveDate],
  ['[30]', (config) => config.responseDays],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

export function applyLegalPlaceholders(markdown, config = LEGAL) {
  let out = String(markdown ?? '');
  for (const [token, pick] of TOKENS) out = out.replaceAll(token, String(pick(config) ?? ''));
  return out;
}

function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]\n]+)\]/g, '<mark class="legal-ph">[$1]</mark>');
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = [];
  const flush = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (trimmed.startsWith('- ')) {
      list.push(trimmed.slice(2));
      continue;
    }
    flush();
    if (trimmed.startsWith('_') && trimmed.endsWith('_') && trimmed.length > 2) {
      out.push(`<p class="legal-draft"><em>${inline(trimmed.slice(1, -1))}</em></p>`);
      continue;
    }
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  flush();
  return out.join('\n');
}

export function legalBanner(config = LEGAL) {
  return config.showDraftBanner ? DRAFT_BANNER : '';
}

export function renderLegalDocument(kind, config = LEGAL) {
  const source = kind === 'terms' ? TERMS_MD : PRIVACY_MD;
  const text = applyLegalPlaceholders(source, config);
  return { banner: legalBanner(config), html: renderMarkdown(text), text };
}
