/* global marked, DOMPurify, TurndownService, turndownPluginGfm, webkit */
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
  let activeDialog = null;
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  turndown.use(turndownPluginGfm.gfm);
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

  if (typeof marked !== 'undefined' && marked.use) {
    marked.use({
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
        }
      }
    });
  }

  function splitFrontMatter(text) {
    const match = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/);
    return match ? [match[1], text.slice(match[1].length)] : ['', text];
  }

  function render(text) {
    const [front, body] = splitFrontMatter(text);
    frontMatter = front;
    headingCounts = {};
    const html = marked.parse(body, { gfm: true, breaks: false });
    editor.innerHTML = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'id'],
      FORBID_TAGS: ['style', 'iframe', 'form', 'script']
    });
    updateWordCount();
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
  let currentHoveredLink = null;

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
    if (!currentHoveredLink || !linkHint?.classList.contains('visible')) return;
    const rawHref = currentHoveredLink.getAttribute('href') || '';
    const isAnchor = rawHref.startsWith('#');
    const isModDown = document.body.classList.contains('mod-active');
    const action = isAnchor ? 'jump to' : 'open';
    const targetDisplay = isAnchor ? rawHref : (currentHoveredLink.getAttribute('title') || rawHref);
    const prefix = isModDown ? 'Click' : modKeyHint;
    linkHint.textContent = `${prefix} to ${action} ${targetDisplay}`;
  }

  function positionHint(link) {
    if (!linkHint) return;
    const rect = link.getBoundingClientRect();
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

  function showHint(link) {
    const hint = ensureLinkHint();
    if (!hint) return;
    currentHoveredLink = link;
    updateHintText();
    hint.classList.add('visible');
    positionHint(link);
  }

  function hideHint() {
    currentHoveredLink = null;
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
    postNativeMessage('openLink', fullHref || rawHref);
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
    document.getElementById('workspace').scrollTop = 0;
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
      case 'link': {
        const url = prompt('Link URL', 'https://');
        if (url && /^(https?:|mailto:|#|\.\.?\/)/i.test(url)) document.execCommand('createLink', false, url);
        break;
      }
    }
    reportChange();
  }

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
  function openDialog(dialog) {
    setMenuOpen(false);
    activeDialog = dialog;
    dialog.hidden = false;
    dialog.querySelector('.dialog-close').focus();
  }
  function closeDialog() {
    if (!activeDialog) return;
    activeDialog.hidden = true;
    activeDialog = null;
    brandMark.focus();
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
  for (const dialog of [about, easterEgg]) {
    dialog.querySelector('.dialog-close').addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });
  }
  document.addEventListener('click', (event) => {
    if (!brandControl.contains(event.target)) setMenuOpen(false);
  });
  modeButton.addEventListener('click', switchMode);
  editor.addEventListener('input', reportChange);
  source.addEventListener('input', reportChange);
  window.addEventListener('keydown', updateModState);
  window.addEventListener('keyup', updateModState);
  window.addEventListener('blur', () => {
    document.body.classList.remove('mod-active');
    hideHint();
  });

  editor.addEventListener('mouseover', (event) => {
    const link = event.target.closest('a');
    if (link) {
      showHint(link);
    } else if (currentHoveredLink && !currentHoveredLink.contains(event.target)) {
      hideHint();
    }
  });

  editor.addEventListener('mouseout', (event) => {
    const link = event.target.closest('a');
    if (link && (!event.relatedTarget || !link.contains(event.relatedTarget))) {
      hideHint();
    }
  });

  document.getElementById('workspace')?.addEventListener('scroll', hideHint, { passive: true });

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
        else activeDialog.querySelector('.dialog-close').focus();
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
    if (isMod && event.shiftKey && event.key.toLowerCase() === 'm') {
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
        pre, code { font-family: Menlo, monospace; font-size: 10pt; }
        pre { background: #f0f0e9; padding: 10px; }
        table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #d9d7ce; padding: 6px; }
        img { max-width: 100%; }
      </style></head><body>${editor.innerHTML}</body></html>`;
    },
    preparePrint: () => {
      if (document.body.classList.contains('source-mode')) render(source.value);
    },
    save: () => postNativeMessage('command', 'save')
  };
  setMarkdown('', 'Untitled.md', 'file:///');
  postNativeMessage('ready', true);
})();
