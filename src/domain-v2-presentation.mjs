import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({html:false,linkify:false,breaks:true});
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);

// A literal first paragraph, never a replacement for the complete model text.
export function compactLabel(value, limit = 64) {
  const original = String(value ?? '');
  let lead = original.split(/\n\s*\n/)[0].split(/<table\b|\n\s*\|/i)[0];
  lead = markdown.utils.unescapeAll(lead.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  if (!lead) lead = '表格原文';
  const chars = Array.from(lead);
  const shortened = chars.length > limit;
  const text = shortened ? chars.slice(0, limit).join('') : lead;
  const omitted = shortened || lead !== original.trim().replace(/\s+/g, ' ');
  return {text: text + (omitted ? '…〔已省略〕' : ''), omitted};
}

function safeTable(raw) {
  const tokens = raw.match(/<[^>]*>|[^<]+/g);
  if (!tokens || tokens.join('') !== raw) return null;
  let state = 'start', cellTag = '', eq = false, rows = 0, html = '';
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      if (state === 'cell') html += markdown.utils.escapeHtml(markdown.utils.unescapeAll(token));
      else if (token.trim()) return null;
      continue;
    }
    if (state === 'start' && /^<table>$/i.test(token)) { html += '<table>'; state = 'table'; continue; }
    if (state === 'table' && /^<tr>$/i.test(token)) { html += '<tr>'; state = 'row'; rows++; continue; }
    if (state === 'row') {
      const cell = /^<(td|th)([^>]*)>$/i.exec(token);
      if (cell) {
        let attrs = cell[2], output = '', seen = new Set();
        while (attrs) {
          const attribute = /^\s+(rowspan|colspan)\s*=\s*(?:"([1-9]\d*)"|'([1-9]\d*)'|([1-9]\d*))/i.exec(attrs);
          if (!attribute) return null;
          const key = attribute[1].toLowerCase(), value = Number(attribute[2] || attribute[3] || attribute[4]);
          if (seen.has(key) || value > 1000) return null;
          seen.add(key); output += ` ${key}="${value}"`; attrs = attrs.slice(attribute[0].length);
        }
        cellTag = cell[1].toLowerCase(); html += `<${cellTag}${output}>`; state = 'cell'; continue;
      }
      if (/^<\/tr>$/i.test(token)) { html += '</tr>'; state = 'table'; continue; }
    }
    if (state === 'cell') {
      if (!eq && /^<eq>$/i.test(token)) { eq = true; continue; }
      if (eq && /^<\/eq>$/i.test(token)) { eq = false; continue; }
      if (!eq && new RegExp(`^<\\/${cellTag}>$`, 'i').test(token)) { html += `</${cellTag}>`; state = 'row'; continue; }
    }
    if (state === 'table' && /^<\/table>$/i.test(token)) { html += '</table>'; state = 'done'; continue; }
    return null;
  }
  return state === 'done' && rows ? `<div class="source-table">${html}</div>` : null;
}

// Markdown-it escapes raw HTML. Only fully parsed table markup is promoted to HTML.
export function renderSourceText(value) {
  const raw = String(value ?? '');
  let html = '', cursor = 0;
  const pattern = /<table\b[^>]*>[\s\S]*?<\/table\s*>/gi;
  for (const match of raw.matchAll(pattern)) {
    html += markdown.render(raw.slice(cursor, match.index));
    html += safeTable(match[0]) ?? markdown.render(match[0]);
    cursor = match.index + match[0].length;
  }
  return html + markdown.render(raw.slice(cursor));
}
