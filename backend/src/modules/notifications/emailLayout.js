/** Inline HTML email layout (table-based, client-safe). */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatIsoDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate ?? '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * @param {{ preheader?: string, eyebrow?: string, title: string, paragraphs: string[], cta?: { label: string, href: string }, meta?: { label: string, value: string }[], footerNote?: string }} opts
 */
export function renderEmailDocument(opts) {
  const preheader = escapeHtml(opts.preheader ?? opts.title);
  const eyebrow = opts.eyebrow ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(opts.eyebrow)}</p>` : '';
  const title = escapeHtml(opts.title);
  const body = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#374151;">${p}</p>`,
    )
    .join('');
  const metaRows = (opts.meta ?? [])
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#6b7280;width:120px;vertical-align:top;">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('');
  const metaBlock = metaRows
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 20px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">${metaRows}</table>`
    : '';
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:8px;background:#161412;">
            <a href="${escapeHtml(opts.cta.href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(opts.cta.label)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;word-break:break-all;">Or copy this link: ${escapeHtml(opts.cta.href)}</p>`
    : '';
  const footer = escapeHtml(opts.footerNote ?? 'You received this because your account is linked to a club on Campus Flow.');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 16px;text-align:center;">
              <span style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;">Campus Flow</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 28px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
              ${eyebrow}
              <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${title}</h1>
              ${metaBlock}
              ${body}
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:#9ca3af;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
