// Client error log. Console only: no network call and no third-party service.
const report = (kind, detail) => {
  console.error('[sanhuu]', kind, detail);
};

window.addEventListener('error', (event) => {
  report('error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  report('unhandledrejection', {
    message: reason instanceof Error ? reason.message : String(reason ?? ''),
  });
});
