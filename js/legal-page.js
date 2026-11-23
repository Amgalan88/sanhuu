import { renderLegalDocument } from './legal.js';

const kind = document.body.dataset.legal === 'terms' ? 'terms' : 'privacy';
const doc = renderLegalDocument(kind);
const banner = document.getElementById('draft-banner');
if (banner) {
  if (doc.banner) {
    banner.hidden = false;
    banner.textContent = doc.banner;
  } else {
    banner.remove();
  }
}
const root = document.getElementById('legal');
if (root) root.innerHTML = doc.html;
const title = root?.querySelector('h1')?.textContent;
if (title) document.title = `${title} — Бидний санхүү`;
