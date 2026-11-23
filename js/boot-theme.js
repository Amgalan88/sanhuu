// Theme before first paint. External file so the page CSP can omit script 'unsafe-inline'.
try {
  const t = localStorage.getItem('bidnii-sanhuu-theme');
  if (t === 'light' || t === 'dark' || t === 'comfort') document.documentElement.dataset.theme = t;
} catch (e) { /* private mode */ }
