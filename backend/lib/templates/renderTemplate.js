function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAbsoluteUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function injectVariables(str, variables = {}) {
  if (typeof str !== 'string') return '';
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName) => {
    const value = variables[varName];
    return value === undefined || value === null ? '' : String(value);
  });
}

function renderTextBlock(block, variables) {
  const raw = injectVariables(block?.content || '', variables);
  const html = escapeHtml(raw).replace(/\n/g, '<br />');
  return `<p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">${html}</p>`;
}

function renderImageBlock(block, variables) {
  const url = injectVariables(block?.url || '', variables).trim();
  if (!isAbsoluteUrl(url)) return '';
  const alt = escapeHtml(injectVariables(block?.alt || '', variables));
  return `<div style="margin:0 0 16px 0;"><img src="${escapeHtml(url)}" alt="${alt}" style="max-width:100%;height:auto;border:0;display:block;" /></div>`;
}

function renderButtonBlock(block, variables) {
  const text = escapeHtml(injectVariables(block?.text || 'Open', variables));
  const url = injectVariables(block?.url || '', variables).trim();
  if (!isAbsoluteUrl(url)) return '';
  return `<div style="margin:0 0 20px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">${text}</a></div>`;
}

function renderDividerBlock() {
  return '<hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0;" />';
}

export function renderTemplate(templateJson, variables = {}) {
  const blocks = Array.isArray(templateJson?.blocks) ? templateJson.blocks : [];
  const rendered = blocks
    .map((block) => {
      switch (block?.type) {
        case 'text':
          return renderTextBlock(block, variables);
        case 'image':
          return renderImageBlock(block, variables);
        case 'button':
          return renderButtonBlock(block, variables);
        case 'divider':
          return renderDividerBlock();
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;">${rendered}</div>`;
}
