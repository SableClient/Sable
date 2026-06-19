/* oxlint-disable no-console */

const accessToken = 'shh';
const html = '<strong>unsafe</strong>';
const retryCount = 1;

// ruleid: charm-runtime-reload-needs-telemetry
window.location.reload();

// ok: charm-runtime-reload-needs-telemetry
reloadWithTelemetry('chunk_load_retry', { retryCount });

// ruleid: charm-window-open-needs-noopener
window.open('https://example.com', '_blank');

// ok: charm-window-open-needs-noopener
window.open('https://example.com', '_blank', 'noopener,noreferrer');

// ruleid: charm-no-sensitive-console-logging
console.log(accessToken);

// ok: charm-no-sensitive-console-logging
console.log('preview toolbar ready');

export function UnsafeHtml() {
  // ruleid: charm-no-unsafe-dangerously-set-inner-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
