/* global marked, DOMPurify, TurndownService, turndownPluginGfm, mermaid, webkit */
(() => {
  'use strict';
  const editor = document.getElementById('editor');
  const source = document.getElementById('source');
  const modeButton = document.getElementById('mode');
  const blockStyle = document.getElementById('block-style');
  const viewLabel = document.getElementById('view-label');
  const wordcount = document.getElementById('wordcount');
  const filename = document.getElementById('filename');
  const brandMark = document.getElementById('brand-mark');
  const brandControl = document.querySelector('.brand-control');
  const brandMenu = document.getElementById('brand-menu');
  const about = document.getElementById('about');
  const easterEgg = document.getElementById('easter-egg');
  const linkDialog = document.getElementById('link-dialog');
  const linkForm = document.getElementById('link-form');
  const linkUrl = document.getElementById('link-url');
  const linkError = document.getElementById('link-error');
  const linkRemove = document.getElementById('link-remove');
  const linkTitle = document.getElementById('link-dialog-title');
  const paper = document.getElementById('paper');
  const workspace = document.getElementById('workspace');
  const findBar = document.getElementById('find-bar');
  const findInput = document.getElementById('find-input');
  const findCount = document.getElementById('find-count');
  const findLayer = document.getElementById('find-layer');
  let activeDialog = null;
  let dialogReturnFocus = null;
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  turndown.use(turndownPluginGfm.gfm);

  turndown.addRule('mermaid', {
    filter: (node) => node.nodeName === 'DIV' && node.classList?.contains('mermaid-block'),
    replacement: (_, node) => {
      const raw = decodeURIComponent(node.getAttribute('data-raw-mermaid') || '');
      return '\n\n```mermaid\n' + raw.trim() + '\n```\n\n';
    }
  });

  turndown.addRule('calloutHeader', {
    filter: (node) => node.classList?.contains('callout-header'),
    replacement: () => ''
  });

  turndown.addRule('callout', {
    filter: (node) => node.nodeName === 'BLOCKQUOTE' && node.hasAttribute('data-callout'),
    replacement: (content, node) => {
      const type = node.getAttribute('data-callout') || 'NOTE';
      let clean = content.trim();
      if (!clean) return `\n\n> [!${type}]\n\n`;
      clean = clean.replace(/^/gm, '> ');
      return `\n\n> [!${type}]\n${clean}\n\n`;
    }
  });

  turndown.addRule('highlight', {
    filter: 'mark',
    replacement: (content) => `==${content}==`
  });

  if (typeof mermaid !== 'undefined') {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'strict'
      });
    } catch (_) {}
  }

  const CALLOUT_ICONS = {
    NOTE: 'ℹ️',
    TIP: '💡',
    IMPORTANT: '❗',
    WARNING: '⚠️',
    CAUTION: '🛑'
  };

  let initialMarkdown = '';
  let frontMatter = '';
  let changed = false;
  let savedRange;
  let headingCounts = {};

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  // Links are handed to the operating system, which opens them in the default app for
  // their scheme (browser, Mail, a custom-scheme app, or the file's default app).
  // Script-bearing and in-page schemes are never followed.
  const BLOCKED_LINK_SCHEME = /^(?:javascript|vbscript|data|blob|about):/i;
  // DOMPurify keeps any link scheme except the blocked ones (it strips whitespace
  // and control characters before testing). Images may still use data: URIs.
  const ALLOWED_URI = /^(?!(?:javascript|vbscript|data|blob|about):)/i;

  function isAllowedLink(href) {
    // eslint-disable-next-line no-control-regex
    const compact = String(href ?? '').replace(/[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000\ufeff]/g, '');
    return compact !== '' && !BLOCKED_LINK_SCHEME.test(compact);
  }

  if (typeof marked !== 'undefined' && marked.use) {
    marked.use({
      extensions: [{
        name: 'highlight',
        level: 'inline',
        start(src) { return src.indexOf('=='); },
        tokenizer(src) {
          const match = /^==([^=\n]+)==/.exec(src);
          if (match) {
            return {
              type: 'highlight',
              raw: match[0],
              text: match[1],
              tokens: this.lexer.inlineTokens(match[1])
            };
          }
        },
        renderer(token) {
          return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
        }
      }],
      renderer: {
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens);
          let slug = slugify(text);
          if (slug) {
            if (headingCounts[slug] !== undefined) {
              headingCounts[slug]++;
              slug = `${slug}-${headingCounts[slug]}`;
            } else {
              headingCounts[slug] = 0;
            }
          }
          return `<h${depth}${slug ? ` id="${slug}"` : ''}>${text}</h${depth}>\n`;
        },
        code({ text, lang, escaped }) {
          const l = (lang || '').match(/^\S*/)?.[0] || '';
          if (l === 'mermaid') {
            const raw = text || '';
            const encoded = encodeURIComponent(raw);
            const esc = (escaped ? raw : raw
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;'));
            return `<div class="mermaid-block" contenteditable="false" data-raw-mermaid="${encoded}"><div class="mermaid-preview"><pre class="language-mermaid"><code>${esc}</code></pre></div></div>\n`;
          }
          const formatted = (escaped ? text : (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '\n';
          if (!l) {
            return `<pre><code>${formatted}</code></pre>\n`;
          }
          return `<pre><code class="language-${l}">${formatted}</code></pre>\n`;
        },
        blockquote({ tokens }) {
          if (tokens && tokens.length > 0 && tokens[0].type === 'paragraph') {
            const firstPara = tokens[0];
            if (firstPara.tokens && firstPara.tokens.length > 0 && firstPara.tokens[0].type === 'text') {
              const match = firstPara.tokens[0].text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n)?/i);
              if (match) {
                const type = match[1].toUpperCase();
                const matchedLen = match[0].length;
                firstPara.tokens[0].text = firstPara.tokens[0].text.slice(matchedLen);
                firstPara.tokens[0].raw = firstPara.tokens[0].raw.slice(matchedLen);
                if (!firstPara.tokens[0].text && firstPara.tokens.length === 1) {
                  tokens.shift();
                } else if (!firstPara.tokens[0].text && firstPara.tokens.length > 1) {
                  firstPara.tokens.shift();
                }
                const body = this.parser.parse(tokens);
                const icon = CALLOUT_ICONS[type] || 'ℹ️';
                return `<blockquote class="callout callout-${type.toLowerCase()}" data-callout="${type}"><div class="callout-header" contenteditable="false"><span class="callout-icon">${icon}</span><span class="callout-title">${type}</span></div>${body}</blockquote>\n`;
              }
            }
          }
          return `<blockquote>\n${this.parser.parse(tokens)}</blockquote>\n`;
        }
      }
    });
  }

  function splitFrontMatter(text) {
    const match = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/);
    return match ? [match[1], text.slice(match[1].length)] : ['', text];
  }

  let mermaidRenderSeq = 0;
  async function renderMermaidBlocks() {
    if (typeof mermaid === 'undefined') return;
    const blocks = editor.querySelectorAll('.mermaid-block');
    for (const block of blocks) {
      const raw = decodeURIComponent(block.getAttribute('data-raw-mermaid') || '');
      if (!raw) continue;
      const preview = block.querySelector('.mermaid-preview');
      if (!preview) continue;
      const id = `mermaid-svg-${Date.now()}-${++mermaidRenderSeq}`;
      try {
        const { svg } = await mermaid.render(id, raw);
        if (preview && block.isConnected) {
          // Mermaid with strict security produces safe SVGs with foreignObject for flowchart node labels.
          // Neutralize any script tags to ensure complete safety before inserting into preview.
          const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          preview.innerHTML = cleanSvg;
        }
      } catch (err) {
        // Keep raw code in pre/code block on error
      }
    }
  }

  function render(text) {
    const [front, body] = splitFrontMatter(text);
    frontMatter = front;
    headingCounts = {};
    const html = marked.parse(body, { gfm: true, breaks: false });
    editor.innerHTML = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, svgFilters: true },
      ADD_TAGS: ['mark', 'use'],
      ADD_ATTR: ['target', 'id', 'data-raw-mermaid', 'data-callout', 'contenteditable'],
      ALLOWED_URI_REGEXP: ALLOWED_URI,
      FORBID_TAGS: ['style', 'iframe', 'form', 'script']
    });
    updateWordCount();
    renderMermaidBlocks();
  }

  function markdown() {
    if (!changed) return initialMarkdown;
    if (document.body.classList.contains('source-mode')) return source.value;
    return frontMatter + turndown.turndown(editor.innerHTML)
      .replace(/[ \t]+(?=\n)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n';
  }

  function updateWordCount() {
    const text = document.body.classList.contains('source-mode') ? source.value : (editor.innerText ?? editor.textContent);
    const words = text.trim().match(/\S+/g);
    wordcount.textContent = `${words ? words.length : 0} words`;
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '');
  const modKeyShiftMSymbol = isMac ? '⌘⇧M' : 'Ctrl+Shift+M';
  const modKeyHint = isMac ? '⌘-click' : 'Ctrl-click';

  let linkHint = null;
  // The hint describes one link: an <a> in rich text, or a Markdown link under the
  // pointer in source view. `element` is set only for rich text.
  let currentHint = null;

  function ensureLinkHint() {
    if (!linkHint && document.body) {
      linkHint = document.createElement('div');
      linkHint.id = 'link-hint';
      linkHint.className = 'link-hint';
      linkHint.setAttribute('aria-hidden', 'true');
      document.body.appendChild(linkHint);
    }
    return linkHint;
  }

  function updateHintText() {
    if (!currentHint || !linkHint) return;
    const isAnchor = currentHint.href.startsWith('#');
    const prefix = document.body.classList.contains('mod-active') ? 'Click' : modKeyHint;
    const target = isAnchor ? currentHint.href : (currentHint.label || currentHint.href);
    linkHint.textContent = `${prefix} to ${isAnchor ? 'jump to' : 'open'} ${target}`;
  }

  function positionHint(rect) {
    if (!linkHint) return;
    const hintHeight = linkHint.offsetHeight || 24;
    const margin = 6;
    let top = rect.bottom + margin;
    if (top + hintHeight > window.innerHeight - 10) {
      top = Math.max(10, rect.top - hintHeight - margin);
    }
    let left = rect.left;
    const hintWidth = linkHint.offsetWidth || 150;
    if (left + hintWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - hintWidth - 16);
    }
    linkHint.style.top = `${top}px`;
    linkHint.style.left = `${left}px`;
  }

  function showHint({ href, label = '', rect, element = null }) {
    const hint = ensureLinkHint();
    if (!hint || !href || !isAllowedLink(href)) { hideHint(); return; }
    currentHint = { href, label, element };
    updateHintText();
    hint.classList.add('visible');
    positionHint(rect);
  }

  function hideHint() {
    currentHint = null;
    linkHint?.classList.remove('visible');
  }

  function updateModState(event) {
    const isDown = isMac ? event.metaKey : event.ctrlKey;
    if (isDown) {
      document.body.classList.add('mod-active');
    } else {
      document.body.classList.remove('mod-active');
    }
    updateHintText();
  }

  function findAnchorTarget(hash) {
    const rawId = hash.replace(/^#/, '');
    if (!rawId) return null;
    let decodedId;
    try {
      decodedId = decodeURIComponent(rawId);
    } catch (_) {
      decodedId = rawId;
    }

    try {
      const direct = editor.querySelector(`[id="${CSS.escape(decodedId)}"]`);
      if (direct) return direct;
    } catch (_) {}

    try {
      const named = editor.querySelector(`a[name="${CSS.escape(decodedId)}"]`);
      if (named) return named;
    } catch (_) {}

    const normalizedTarget = decodedId.toLowerCase().replace(/^-+|-+$/g, '').replace(/-+/g, '-');
    const strippedTarget = normalizedTarget.replace(/-h[1-6]$/, '').replace(/^\d+[-.]*/, '');

    const headings = editor.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const h of headings) {
      if (h.id) {
        const hId = h.id.toLowerCase().replace(/-+/g, '-');
        if (hId === normalizedTarget || (strippedTarget && (hId.endsWith(strippedTarget) || hId.includes(strippedTarget)))) {
          return h;
        }
      }
      const hSlug = slugify(h.textContent).replace(/-+/g, '-');
      if (hSlug === normalizedTarget || (strippedTarget && (hSlug.endsWith(strippedTarget) || hSlug.includes(strippedTarget)))) {
        return h;
      }
    }
    return null;
  }

  function followLink(rawHref, fullHref) {
    if (!rawHref) return;
    if (rawHref.startsWith('#')) {
      if (document.body.classList.contains('source-mode')) {
        const rawId = rawHref.replace(/^#/, '');
        let decodedId;
        try {
          decodedId = decodeURIComponent(rawId).toLowerCase().replace(/-+/g, ' ').trim();
        } catch (_) {
          decodedId = rawId.toLowerCase().replace(/-+/g, ' ').trim();
        }
        const lines = source.value.split('\n');
        let charIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
          if (headingMatch) {
            const hText = headingMatch[1].toLowerCase().replace(/[^\w\s-]/g, '').trim();
            if (hText === decodedId || (decodedId && (hText.includes(decodedId) || decodedId.includes(hText)))) {
              source.focus();
              source.setSelectionRange(charIndex, charIndex + line.length);
              return;
            }
          }
          charIndex += line.length + 1;
        }
        return;
      }
      const target = findAnchorTarget(rawHref);
      if (target) {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        target.classList.remove('anchor-highlight');
        void target.offsetWidth;
        target.classList.add('anchor-highlight');
      }
      return;
    }
    const target = fullHref || rawHref;
    if (!isAllowedLink(rawHref) || !isAllowedLink(target)) return;
    postNativeMessage('openLink', target);
  }

  function findLinkAtPosition(text, pos) {
    if (!text || pos === undefined || pos < 0) return null;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    let lineEnd = text.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const offset = pos - lineStart;

    const mdLinkRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      if (offset >= match.index && offset <= match.index + match[0].length) {
        return match[2];
      }
    }

    const urlRegex = /https?:\/\/[^\s<>()]+/g;
    while ((match = urlRegex.exec(line)) !== null) {
      if (offset >= match.index && offset <= match.index + match[0].length) {
        return match[0];
      }
    }
    return null;
  }

  function postNativeMessage(name, data) {
    if (window.webkit?.messageHandlers?.[name]) {
      window.webkit.messageHandlers[name].postMessage(data);
    } else if (window.__TAURI_INTERNALS__?.invoke) {
      window.__TAURI_INTERNALS__.invoke('native_message', { name, data });
    } else if (window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('native_message', { name, data });
    }
  }

  function reportChange() {
    const firstChange = !changed;
    changed = true;
    updateWordCount();
    if (firstChange) postNativeMessage('changed', true);
  }

  function setMarkdown(text, name, base) {
    initialMarkdown = text;
    changed = false;
    savedRange = null;
    source.value = text;
    filename.textContent = name || 'Untitled.md';
    if (base) {
      let baseElement = document.querySelector('base');
      if (!baseElement) {
        baseElement = document.createElement('base');
        document.head.appendChild(baseElement);
      }
      baseElement.href = base;
    }
    render(text);
    workspace.scrollTop = 0;
    if (findOpen()) runFind({ fromCaret: true, reveal: false });
  }

  function switchMode() {
    if (document.body.classList.contains('source-mode')) {
      render(source.value);
      document.body.classList.remove('source-mode');
      modeButton.innerHTML = `Source <span class="mode-glyph" aria-hidden="true">${modKeyShiftMSymbol}</span>`;
      viewLabel.textContent = 'RICH TEXT';
      editor.focus();
    } else {
      source.value = markdown();
      document.body.classList.add('source-mode');
      modeButton.innerHTML = `Rich text <span class="mode-glyph" aria-hidden="true">${modKeyShiftMSymbol}</span>`;
      viewLabel.textContent = 'MARKDOWN SOURCE';
      source.focus();
    }
    updateWordCount();
    if (findOpen()) runFind({ fromCaret: true });
  }

  function format(action) {
    if (document.body.classList.contains('source-mode')) switchMode();
    editor.focus();
    if (savedRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    const block = (tag) => document.execCommand('formatBlock', false, tag);
    switch (action) {
      case 'paragraph': block('p'); break;
      case 'h1': case 'h2': case 'h3': block(action); break;
      case 'bold': case 'italic': document.execCommand(action); break;
      case 'unordered': document.execCommand('insertUnorderedList'); break;
      case 'ordered': document.execCommand('insertOrderedList'); break;
      case 'quote': block('blockquote'); break;
      case 'code': block('pre'); break;
      case 'rule': document.execCommand('insertHorizontalRule'); break;
      case 'link': openLinkDialog(); return;
    }
    reportChange();
  }

  function escapeHTML(text) {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function linkAtSelection() {
    const node = savedRange?.startContainer;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const anchor = element?.closest('a');
    return anchor && editor.contains(anchor) ? anchor : null;
  }

  let editingLink = null;

  function openLinkDialog() {
    editingLink = linkAtSelection();
    linkTitle.textContent = editingLink ? 'Edit link' : 'Insert link';
    linkUrl.value = editingLink?.getAttribute('href') || '';
    linkRemove.hidden = !editingLink;
    linkError.textContent = '';
    openDialog(linkDialog, linkUrl, editor);
    linkUrl.select();
  }

  function restoreEditorSelection() {
    editor.focus();
    if (!savedRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  function normalizeLinkAddress(value) {
    let address = value.trim();
    if (/^www\./i.test(address)) address = `https://${address}`;
    // Relative file paths may contain spaces; URLs may not.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) address = address.replace(/ /g, '%20');
    return address;
  }

  function applyLink(value) {
    const address = normalizeLinkAddress(value);
    if (!address) {
      linkError.textContent = 'Enter a web address, email address, or file path.';
      return false;
    }
    if (!isAllowedLink(address)) {
      linkError.textContent = 'That kind of link cannot be used in a document.';
      return false;
    }
    closeDialog();
    restoreEditorSelection();
    if (editingLink && editor.contains(editingLink)) {
      editingLink.setAttribute('href', address);
    } else if (!savedRange || savedRange.collapsed) {
      document.execCommand('insertHTML', false, `<a href="${escapeHTML(address)}">${escapeHTML(address)}</a>`);
    } else {
      document.execCommand('createLink', false, address);
    }
    editingLink = null;
    reportChange();
    return true;
  }

  function removeLink() {
    const anchor = editingLink;
    closeDialog();
    editingLink = null;
    if (!anchor || !editor.contains(anchor)) return;
    anchor.replaceWith(...anchor.childNodes);
    restoreEditorSelection();
    reportChange();
  }

  // ---- Find ----
  // Matches are painted in #find-layer above the page, so searching never changes the
  // document DOM (and so never marks the file dirty or affects the saved Markdown).
  // Rich text: one box per Range client rect. Source: a mirror of the textarea text
  // with <mark> elements, scrolled in step with the textarea.
  const MAX_FIND_MATCHES = 5000;
  const FIND_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, th, dt, dd, figcaption';
  let findMatches = [];
  let findIndex = -1;
  let findTruncated = false;
  let findMirror = null;
  let findRefreshTimer = null;

  const nextFrame = (callback) => (window.requestAnimationFrame ? window.requestAnimationFrame(callback) : setTimeout(callback, 16));
  const inSourceMode = () => document.body.classList.contains('source-mode');
  const findOpen = () => !findBar.hidden;

  function findPattern(query) {
    return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  }

  // Concatenates the editor's text, with a newline between blocks and for <br>, and
  // remembers where each text node starts so string offsets can become DOM positions.
  function richTextIndex() {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => (node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR'
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
    });
    let text = '';
    let lastBlock = null;
    const segments = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeName === 'BR') { text += '\n'; continue; }
      const block = node.parentElement.closest(FIND_BLOCKS) || editor;
      if (lastBlock && block !== lastBlock) text += '\n';
      lastBlock = block;
      segments.push({ node, start: text.length });
      text += node.data;
    }
    return { text, segments };
  }

  function domPosition(segments, offset, isEnd) {
    const target = isEnd ? offset - 1 : offset;
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (segments[mid].start <= target) low = mid; else high = mid - 1;
    }
    const segment = segments[low];
    return { node: segment.node, offset: offset - segment.start };
  }

  function computeMatches(query) {
    findTruncated = false;
    if (!query) return [];
    const pattern = findPattern(query);
    const text = inSourceMode() ? source.value : null;
    const index = text === null ? richTextIndex() : null;
    const haystack = text ?? index.text;
    const matches = [];
    let match;
    while ((match = pattern.exec(haystack))) {
      if (matches.length === MAX_FIND_MATCHES) { findTruncated = true; break; }
      const start = match.index;
      const end = start + match[0].length;
      if (text !== null) {
        matches.push({ start, end });
      } else {
        const from = domPosition(index.segments, start, false);
        const to = domPosition(index.segments, end, true);
        const range = document.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        matches.push(range);
      }
    }
    return matches;
  }

  // Index of the first match at or after the caret, so a new search starts where you are.
  function firstMatchFromCaret() {
    if (!findMatches.length) return -1;
    if (inSourceMode()) {
      const caret = source.selectionStart || 0;
      const found = findMatches.findIndex((m) => m.end > caret);
      return found === -1 ? 0 : found;
    }
    if (!savedRange) return 0;
    const found = findMatches.findIndex((range) => {
      try { return range.compareBoundaryPoints(Range.END_TO_START, savedRange) >= 0; } catch (_) { return false; }
    });
    return found === -1 ? 0 : found;
  }

  function updateFindCount() {
    const query = findInput.value;
    findBar.classList.toggle('no-match', Boolean(query) && !findMatches.length);
    if (!query) findCount.textContent = '';
    else if (!findMatches.length) findCount.textContent = 'No matches';
    else findCount.textContent = `${findIndex + 1} of ${findMatches.length}${findTruncated ? '+' : ''}`;
  }

  function paintFind() {
    findLayer.textContent = '';
    findMirror = null;
    if (!findOpen() || !findMatches.length) return;
    if (inSourceMode()) paintSourceMatches(); else paintRichMatches();
  }

  function paintRichMatches() {
    const origin = paper.getBoundingClientRect();
    const left = origin.left + paper.clientLeft;
    const top = origin.top + paper.clientTop;
    const boxes = document.createDocumentFragment();
    findMatches.forEach((range, i) => {
      if (typeof range.getClientRects !== 'function') return;
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        const box = document.createElement('div');
        box.className = i === findIndex ? 'find-hit current' : 'find-hit';
        box.style.left = `${rect.left - left}px`;
        box.style.top = `${rect.top - top}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        boxes.appendChild(box);
      }
    });
    findLayer.appendChild(boxes);
  }

  // An element laid out exactly like the textarea's text, used to locate characters.
  function createSourceMirror(className) {
    const style = getComputedStyle(source);
    const mirror = document.createElement('div');
    mirror.className = className;
    mirror.style.left = `${source.offsetLeft + source.clientLeft}px`;
    mirror.style.top = `${source.offsetTop + source.clientTop}px`;
    mirror.style.width = `${source.clientWidth}px`;
    mirror.style.height = `${source.clientHeight}px`;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) mirror.style[`padding${side}`] = style[`padding${side}`];
    return mirror;
  }

  function paintSourceMatches() {
    const mirror = createSourceMirror('find-mirror');
    const text = source.value;
    let last = 0;
    findMatches.forEach((match, i) => {
      mirror.appendChild(document.createTextNode(text.slice(last, match.start)));
      const mark = document.createElement('mark');
      if (i === findIndex) mark.className = 'current';
      mark.textContent = text.slice(match.start, match.end);
      mirror.appendChild(mark);
      last = match.end;
    });
    // A trailing newline in a textarea still takes a line; keep the mirror's height equal.
    mirror.appendChild(document.createTextNode(`${text.slice(last)}\n`));
    findLayer.appendChild(mirror);
    findMirror = mirror;
    syncMirrorScroll();
  }

  function syncMirrorScroll() {
    if (!findMirror) return;
    findMirror.scrollTop = source.scrollTop;
    findMirror.scrollLeft = source.scrollLeft;
  }

  function scrollWorkspaceToShow(clientTop, height) {
    const view = workspace.getBoundingClientRect();
    if (clientTop < view.top + 48 || clientTop + height > view.bottom - 48) {
      workspace.scrollTop += clientTop - view.top - view.height / 3;
    }
  }

  function revealCurrentMatch() {
    if (findIndex < 0) return;
    if (inSourceMode()) {
      const mark = findMirror?.querySelector('mark.current');
      if (!mark) return;
      const top = mark.offsetTop;
      const height = mark.offsetHeight;
      if (top < source.scrollTop || top + height > source.scrollTop + source.clientHeight) {
        source.scrollTop = Math.max(0, top - source.clientHeight / 3);
        syncMirrorScroll();
      }
      scrollWorkspaceToShow(source.getBoundingClientRect().top + top - source.scrollTop, height);
    } else {
      const range = findMatches[findIndex];
      if (typeof range.getBoundingClientRect !== 'function') return;
      const rect = range.getBoundingClientRect();
      scrollWorkspaceToShow(rect.top, rect.height);
    }
  }

  // fromCaret: start at the match nearest the caret (new query). Otherwise keep the
  // current position as closely as possible (document edits, mode switches).
  function runFind({ fromCaret = false, reveal = true } = {}) {
    const previous = findIndex;
    findMatches = computeMatches(findInput.value);
    if (!findMatches.length) findIndex = -1;
    else if (fromCaret || previous < 0) findIndex = firstMatchFromCaret();
    else findIndex = Math.min(previous, findMatches.length - 1);
    paintFind();
    if (reveal) revealCurrentMatch();
    updateFindCount();
  }

  function selectedTextForFind() {
    if (inSourceMode()) return source.value.slice(source.selectionStart, source.selectionEnd);
    const selection = window.getSelection();
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) return '';
    return selection.toString();
  }

  function openFind() {
    if (activeDialog) return;
    const selected = selectedTextForFind();
    const wasOpen = findOpen();
    findBar.hidden = false;
    if (selected && !selected.includes('\n') && selected.length <= 200) findInput.value = selected;
    findInput.focus();
    findInput.select();
    if (!wasOpen || selected) runFind({ fromCaret: true });
  }

  function stepFind(direction) {
    if (!findOpen()) { openFind(); if (!findMatches.length) return; }
    if (!findMatches.length) runFind({ fromCaret: true, reveal: false });
    if (!findMatches.length) return;
    findIndex = (findIndex + direction + findMatches.length) % findMatches.length;
    paintFind();
    revealCurrentMatch();
    updateFindCount();
  }

  // Closing leaves the current match selected in the document, ready to edit.
  function closeFind() {
    if (!findOpen()) return;
    const current = findMatches[findIndex];
    findBar.hidden = true;
    findLayer.textContent = '';
    findMirror = null;
    findMatches = [];
    findIndex = -1;
    if (inSourceMode()) {
      source.focus();
      if (current) source.setSelectionRange(current.start, current.end);
    } else {
      editor.focus();
      if (current && editor.contains(current.startContainer)) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(current);
        savedRange = current.cloneRange();
      }
    }
  }

  function refreshFindSoon() {
    if (!findOpen()) return;
    clearTimeout(findRefreshTimer);
    findRefreshTimer = setTimeout(() => runFind({ reveal: false }), 120);
  }

  let findRepaintQueued = false;
  function repaintFindSoon() {
    if (!findOpen() || findRepaintQueued) return;
    findRepaintQueued = true;
    nextFrame(() => { findRepaintQueued = false; paintFind(); });
  }

  findInput.addEventListener('input', () => runFind({ fromCaret: true }));
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      stepFind(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    }
  });
  document.getElementById('find-next').addEventListener('click', () => stepFind(1));
  document.getElementById('find-prev').addEventListener('click', () => stepFind(-1));
  document.getElementById('find-close').addEventListener('click', closeFind);
  for (const button of findBar.querySelectorAll('button')) {
    button.addEventListener('mousedown', (event) => event.preventDefault());
  }
  source.addEventListener('scroll', syncMirrorScroll, { passive: true });
  window.addEventListener('resize', repaintFindSoon);
  editor.addEventListener('load', repaintFindSoon, true);

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => format(button.dataset.action));
  });
  blockStyle.addEventListener('change', () => format(blockStyle.value));
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) return;
    savedRange = selection.getRangeAt(0).cloneRange();
    const element = selection.anchorNode.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode : selection.anchorNode.parentElement;
    const block = element?.closest('h1, h2, h3');
    blockStyle.value = block?.tagName.toLowerCase() || 'paragraph';
  });
  document.getElementById('new-file').addEventListener('click', () => postNativeMessage('command', 'new'));
  document.getElementById('open-file').addEventListener('click', () => postNativeMessage('command', 'open'));
  document.getElementById('save-file').addEventListener('click', () => postNativeMessage('command', 'save'));
  const menuItems = [...brandMenu.querySelectorAll('[role="menuitem"]')];
  function setMenuOpen(open) {
    const menuHadFocus = brandMenu.contains(document.activeElement);
    brandMenu.hidden = !open;
    brandMark.setAttribute('aria-expanded', String(open));
    if (!open && menuHadFocus) brandMark.focus();
  }
  function openDialog(dialog, focusTarget = dialog.querySelector('.dialog-close'), returnFocus = brandMark) {
    setMenuOpen(false);
    hideHint();
    activeDialog = dialog;
    dialogReturnFocus = returnFocus;
    dialog.hidden = false;
    focusTarget.focus();
  }
  function closeDialog() {
    if (!activeDialog) return;
    activeDialog.hidden = true;
    activeDialog = null;
    dialogReturnFocus?.focus();
    dialogReturnFocus = null;
  }
  function trapDialogFocus(event) {
    const focusable = [...activeDialog.querySelectorAll('button, input')].filter((el) => !el.hidden && !el.disabled);
    if (!focusable.length) return;
    const index = focusable.indexOf(document.activeElement);
    const next = event.shiftKey ? index - 1 : index + 1;
    focusable[(next + focusable.length) % focusable.length].focus();
  }
  brandMark.addEventListener('click', () => {
    const open = brandMenu.hidden;
    setMenuOpen(open);
    if (open) menuItems[0].focus();
  });
  brandMenu.addEventListener('keydown', (event) => {
    const index = menuItems.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      menuItems[(index + step + menuItems.length) % menuItems.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      menuItems[event.key === 'Home' ? 0 : menuItems.length - 1].focus();
    }
  });
  document.getElementById('about-item').addEventListener('click', () => openDialog(about));
  document.getElementById('easter-egg-item').addEventListener('click', () => openDialog(easterEgg));
  linkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyLink(linkUrl.value);
  });
  linkRemove.addEventListener('click', removeLink);
  linkUrl.addEventListener('input', () => { linkError.textContent = ''; });
  for (const dialog of [about, easterEgg, linkDialog]) {
    dialog.querySelector('.dialog-close').addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
  }
  document.addEventListener('click', (event) => {
    if (!brandControl.contains(event.target)) setMenuOpen(false);
  });
  modeButton.addEventListener('click', switchMode);
  editor.addEventListener('input', () => { reportChange(); refreshFindSoon(); });
  source.addEventListener('input', () => { reportChange(); refreshFindSoon(); });
  window.addEventListener('keydown', updateModState);
  window.addEventListener('keyup', updateModState);
  window.addEventListener('blur', () => {
    document.body.classList.remove('mod-active');
    hideHint();
  });

  // Source view: find the character under the pointer with an invisible mirror of
  // the textarea text, then check whether it is inside a Markdown link or bare URL.
  let hoverMirror = null;
  let hoverMirrorKey = '';

  function sourceOffsetAtPoint(x, y) {
    if (typeof document.caretRangeFromPoint !== 'function') return null;
    const key = `${source.clientWidth}x${source.clientHeight}`;
    if (!hoverMirror || hoverMirror.firstChild?.data !== `${source.value}\n` || hoverMirrorKey !== key) {
      hoverMirror?.remove();
      hoverMirror = createSourceMirror('find-mirror hover-mirror');
      hoverMirror.textContent = `${source.value}\n`;
      paper.appendChild(hoverMirror);
      hoverMirrorKey = key;
    }
    hoverMirror.scrollTop = source.scrollTop;
    hoverMirror.scrollLeft = source.scrollLeft;
    hoverMirror.style.pointerEvents = 'auto';
    const caret = document.caretRangeFromPoint(x, y);
    hoverMirror.style.pointerEvents = '';
    const textNode = hoverMirror.firstChild;
    if (!caret || caret.startContainer !== textNode) return null;
    // caretRangeFromPoint gives the nearest caret; confirm the pointer is on a character.
    for (const offset of [caret.startOffset, caret.startOffset - 1]) {
      if (offset < 0 || offset >= source.value.length) continue;
      const char = document.createRange();
      char.setStart(textNode, offset);
      char.setEnd(textNode, offset + 1);
      const rect = char.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return { offset, rect };
    }
    return null;
  }

  let sourceHoverEvent = null;
  function updateSourceHover() {
    const event = sourceHoverEvent;
    sourceHoverEvent = null;
    if (!event || !inSourceMode()) return;
    const hit = sourceOffsetAtPoint(event.clientX, event.clientY);
    const href = hit ? findLinkAtPosition(source.value, hit.offset) : null;
    if (href) showHint({ href, rect: hit.rect });
    else if (currentHint) hideHint();
  }
  source.addEventListener('mousemove', (event) => {
    if (!sourceHoverEvent) nextFrame(updateSourceHover);
    sourceHoverEvent = event;
  });
  source.addEventListener('mouseleave', () => { sourceHoverEvent = null; hideHint(); });
  source.addEventListener('scroll', hideHint, { passive: true });
  source.addEventListener('input', hideHint);

  editor.addEventListener('mouseover', (event) => {
    const link = event.target.closest('a');
    if (link) {
      showHint({
        href: link.getAttribute('href'),
        label: link.getAttribute('title'),
        rect: link.getBoundingClientRect(),
        element: link
      });
    } else if (currentHint?.element && !currentHint.element.contains(event.target)) {
      hideHint();
    }
  });

  editor.addEventListener('mouseout', (event) => {
    const link = event.target.closest('a');
    if (link && (!event.relatedTarget || !link.contains(event.relatedTarget))) {
      hideHint();
    }
  });

  workspace.addEventListener('scroll', hideHint, { passive: true });

  editor.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (link) {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        hideHint();
        followLink(link.getAttribute('href'), link.href);
      }
    }
  });

  source.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey) {
      const pos = source.selectionStart;
      const target = findLinkAtPosition(source.value, pos);
      if (target) {
        event.preventDefault();
        let fullHref = target;
        try {
          const baseHref = document.querySelector('base')?.href || window.location.href;
          fullHref = new URL(target, baseHref).href;
        } catch (_) {}
        followLink(target, fullHref);
      }
    }
  });
  document.addEventListener('keydown', (event) => {
    if (activeDialog) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        if (event.key === 'Escape') closeDialog();
        else trapDialogFocus(event);
      }
      return;
    }
    if (!brandMenu.hidden && event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      brandMark.focus();
      return;
    }
    const isMod = isMac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();
    if (isMod && !event.shiftKey && !event.altKey && key === 'f') {
      event.preventDefault();
      openFind();
    } else if ((isMod && !event.altKey && key === 'g') || event.key === 'F3') {
      event.preventDefault();
      stepFind(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape' && findOpen()) {
      event.preventDefault();
      closeFind();
    } else if (isMod && event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      switchMode();
    } else if (isMod && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      postNativeMessage('command', 'save');
    } else if (isMod && !event.shiftKey && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      postNativeMessage('command', 'open');
    } else if (isMod && !event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      postNativeMessage('command', 'new');
    }
  });

  if (!isMac) {
    const newBtn = document.getElementById('new-file');
    if (newBtn) {
      newBtn.title = 'New Markdown file (Ctrl+N)';
      const s = newBtn.querySelector('.shortcut');
      if (s) s.textContent = 'Ctrl+N';
    }
    const openBtn = document.getElementById('open-file');
    if (openBtn) {
      openBtn.title = 'Open a Markdown file (Ctrl+O)';
      const s = openBtn.querySelector('.shortcut');
      if (s) s.textContent = 'Ctrl+O';
    }
    const saveBtn = document.getElementById('save-file');
    if (saveBtn) {
      saveBtn.title = 'Save Markdown (Ctrl+S)';
      const s = saveBtn.querySelector('.shortcut');
      if (s) s.textContent = 'Ctrl+S';
    }
    document.getElementById('find-prev').title = 'Previous match (Shift+F3)';
    document.getElementById('find-next').title = 'Next match (F3)';
    const modeBtn = document.getElementById('mode');
    if (modeBtn) {
      modeBtn.title = 'Switch between rich text and Markdown source (Ctrl+Shift+M)';
      const s = modeBtn.querySelector('.mode-glyph');
      if (s) s.textContent = 'Ctrl+Shift+M';
    }
  }

  window.editorAPI = {
    setMarkdown,
    focusEditor: () => (document.body.classList.contains('source-mode') ? source : editor).focus(),
    getMarkdown: markdown,
    format,
    toggleSource: switchMode,
    print: () => {
      if (document.body.classList.contains('source-mode')) render(source.value);
      window.print();
    },
    getPrintHTML: () => {
      if (document.body.classList.contains('source-mode')) render(source.value);
      const base = document.querySelector('base')?.outerHTML || '';
      return `<!doctype html><html><head><meta charset="utf-8">${base}<style>
        body { font-family: Georgia, serif; font-size: 12pt; color: #282c29; }
        h1, h2, h3 { font-family: Helvetica, sans-serif; color: #282c29; }
        h1 { font-size: 25pt; } h2 { font-size: 19pt; } h3 { font-size: 15pt; }
        p, li { line-height: 1.5; } blockquote { color: #5d625a; border-left: 3px solid #bc593d; padding-left: 12px; }
        blockquote.callout { border-radius: 4px; padding: 10px 14px; margin: 16px 0; }
        blockquote.callout-note { border-left-color: #0969da; background: #f3f8fd; }
        blockquote.callout-tip { border-left-color: #1a7f37; background: #f2f9f3; }
        blockquote.callout-important { border-left-color: #8250df; background: #f7f3fd; }
        blockquote.callout-warning { border-left-color: #9a6700; background: #fdfaf2; }
        blockquote.callout-caution { border-left-color: #cf222e; background: #fdf3f4; }
        .callout-header { font-weight: bold; font-size: 10pt; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .callout-note .callout-header { color: #0969da; }
        .callout-tip .callout-header { color: #1a7f37; }
        .callout-important .callout-header { color: #8250df; }
        .callout-warning .callout-header { color: #9a6700; }
        .callout-caution .callout-header { color: #cf222e; }
        mark { background-color: #fff1a8; padding: 1px 3px; }
        .mermaid-block { margin: 18px 0; text-align: center; }
        .mermaid-block svg { max-width: 100%; height: auto; }
        pre, code { font-family: Menlo, monospace; font-size: 10pt; }
        pre { background: #f0f0e9; padding: 10px; }
        table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #d9d7ce; padding: 6px; }
        img { max-width: 100%; }
      </style></head><body>${editor.innerHTML}</body></html>`;
    },
    preparePrint: () => {
      if (document.body.classList.contains('source-mode')) render(source.value);
    },
    save: () => postNativeMessage('command', 'save'),
    find: openFind,
    findNext: () => stepFind(1),
    findPrevious: () => stepFind(-1)
  };
  setMarkdown('', 'Untitled.md', 'file:///');
  postNativeMessage('ready', true);
})();
