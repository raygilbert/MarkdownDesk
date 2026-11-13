const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { prepareVendor } = require('../scripts/prepare-vendor.js');

async function editorWindow(onChanged = () => {}, onCommand = () => {}, onOpenLink = () => {}) {
  const appHtml = path.join(process.env.MARKDOWNDESK_BUILD_DIR || path.join(__dirname, '..', 'build'),
    'MarkdownDesk.app', 'Contents', 'Resources', 'Web', 'index.html');
  const vendorCheck = path.join(__dirname, '..', 'Web', 'vendor', 'marked.js');
  if (!fs.existsSync(appHtml) && !fs.existsSync(vendorCheck)) {
    prepareVendor();
  }
  const html = fs.existsSync(appHtml) ? appHtml : path.join(__dirname, '..', 'Web', 'index.html');
  const dom = await JSDOM.fromFile(html, {
    resources: 'usable',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.webkit = { messageHandlers: {
        ready: { postMessage() {} },
        changed: { postMessage: onChanged },
        openLink: { postMessage: onOpenLink },
        command: { postMessage: onCommand }
      } };
    }
  });
  await new Promise((resolve, reject) => {
    dom.window.addEventListener('load', resolve, { once: true });
    dom.window.addEventListener('error', reject, { once: true });
  });
  return dom;
}

test('New button invokes the native New command', async () => {
  const commands = [];
  const dom = await editorWindow(() => {}, (command) => commands.push(command));
  dom.window.document.querySelector('#new-file').click();
  assert.deepEqual(commands, ['new']);
  dom.window.close();
});

test('editorAPI.save invokes the native Save command', async () => {
  const commands = [];
  const dom = await editorWindow(() => {}, (command) => commands.push(command));
  dom.window.editorAPI.save();
  assert.deepEqual(commands, ['save']);
  dom.window.close();
});

test('brand menu opens About and Easter Egg dialogs and restores focus on close', async () => {
  const dom = await editorWindow();
  const { document, KeyboardEvent } = dom.window;
  const brand = document.querySelector('#brand-mark');
  const menu = document.querySelector('#brand-menu');

  brand.click();
  assert.equal(menu.hidden, false);
  assert.equal(brand.getAttribute('aria-expanded'), 'true');
  document.querySelector('#easter-egg-item').click();
  assert.equal(menu.hidden, true);
  assert.equal(document.querySelector('#easter-egg').hidden, false);
  assert.equal(document.activeElement.id, 'easter-egg-close');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('#easter-egg').hidden, true);
  assert.equal(document.activeElement, brand);

  brand.click();
  document.querySelector('#about-item').click();
  assert.equal(document.querySelector('#about').hidden, false);
  assert.match(document.querySelector('#about').textContent, /Created by Ray Gilbert with Codex/);
  document.querySelector('#about-close').click();
  assert.equal(document.querySelector('#about').hidden, true);
  assert.equal(document.activeElement, brand);
  dom.window.close();
});

test('opens Markdown as rich text and preserves an unedited file byte for byte', async () => {
  const dom = await editorWindow();
  const text = '---\ntitle: Example\n---\n# Hello\n\nA **bold** [link](https://example.com).\n\n| A | B |\n| - | - |\n| 1 | 2 |\n';
  dom.window.editorAPI.setMarkdown(text, 'Example.md', 'file:///tmp/');
  assert.match(dom.window.document.querySelector('#editor').innerHTML, /<h1[^>]*>Hello<\/h1>/);
  assert.match(dom.window.document.querySelector('#editor').innerHTML, /<table>/);
  assert.equal(dom.window.editorAPI.getMarkdown(), text);
  dom.window.close();
});

test('rich text changes save as Markdown with front matter and table', async () => {
  const dom = await editorWindow();
  dom.window.editorAPI.setMarkdown('---\ntitle: Example\n---\n# Hello\n\n| A | B |\n| - | - |\n| 1 | 2 |\n', 'Example.md', 'file:///tmp/');
  const paragraph = dom.window.document.createElement('p');
  paragraph.innerHTML = 'A <strong>new</strong> sentence.';
  dom.window.document.querySelector('#editor').appendChild(paragraph);
  dom.window.document.querySelector('#editor').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const result = dom.window.editorAPI.getMarkdown();
  assert.match(result, /^---\ntitle: Example\n---\n/);
  assert.match(result, /# Hello/);
  assert.match(result, /\| A \| B \|/);
  assert.match(result, /A \*\*new\*\* sentence\./);
  dom.window.close();
});

test('source edits remain exact and hostile HTML does not execute on render', async () => {
  const dom = await editorWindow();
  dom.window.editorAPI.setMarkdown('', 'Untitled.md', 'file:///tmp/');
  dom.window.editorAPI.toggleSource();
  const source = dom.window.document.querySelector('#source');
  source.value = '# New\n\n<script>window.hacked = true</script>\n';
  source.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(dom.window.editorAPI.getMarkdown(), source.value);
  dom.window.editorAPI.toggleSource();
  assert.equal(dom.window.hacked, undefined);
  assert.doesNotMatch(dom.window.document.querySelector('#editor').innerHTML, /<script>/);
  dom.window.close();
});

test('the first edit marks the document dirty immediately', async () => {
  let changes = 0;
  const dom = await editorWindow(() => { changes += 1; });
  const editor = dom.window.document.querySelector('#editor');
  editor.textContent = 'New text';
  editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(changes, 1);
  assert.match(dom.window.editorAPI.getMarkdown(), /New text/);
  dom.window.close();
});

test('modifier-click opens external and relative links, but plain click does not navigate', async () => {
  const openedLinks = [];
  const dom = await editorWindow(() => {}, () => {}, (url) => openedLinks.push(url));
  const text = '# Test\n\n[External](https://example.com) and [Relative](other.md).\n';
  dom.window.editorAPI.setMarkdown(text, 'Test.md', 'file:///workspace/');

  const links = dom.window.document.querySelectorAll('#editor a');
  assert.equal(links.length, 2);

  // Plain click: should not trigger openLink
  links[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(openedLinks.length, 0);

  // Cmd-click / Ctrl-click: opens external link
  links[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  assert.equal(openedLinks.length, 1);
  assert.equal(openedLinks[0], 'https://example.com/');

  // Relative link resolves against base URL
  links[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
  assert.equal(openedLinks.length, 2);
  assert.equal(openedLinks[1], 'file:///workspace/other.md');

  dom.window.close();
});

test('internal anchor links jump to headings without triggering external openLink', async () => {
  const openedLinks = [];
  const dom = await editorWindow(() => {}, () => {}, (url) => openedLinks.push(url));
  const text = '# Top Section\n\n[Go to Section 2](#section-2)\n\n## Section 2\n\nContent here.\n';
  dom.window.editorAPI.setMarkdown(text, 'Test.md', 'file:///workspace/');

  const h2 = dom.window.document.querySelector('h2');
  assert.equal(h2.id, 'section-2');

  let scrolled = false;
  h2.scrollIntoView = () => { scrolled = true; };

  const link = dom.window.document.querySelector('#editor a');
  link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));

  assert.equal(openedLinks.length, 0);
  assert.equal(scrolled, true);
  assert.equal(h2.classList.contains('anchor-highlight'), true);

  dom.window.close();
});

test('source mode allows following links with modifier-click', async () => {
  const openedLinks = [];
  const dom = await editorWindow(() => {}, () => {}, (url) => openedLinks.push(url));
  const text = 'Here is a [link](https://example.com/source) in markdown.';
  dom.window.editorAPI.setMarkdown(text, 'Test.md', 'file:///workspace/');
  dom.window.editorAPI.toggleSource();

  const source = dom.window.document.querySelector('#source');
  // Click inside [link]
  source.selectionStart = 15;
  source.selectionEnd = 15;

  source.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
  assert.equal(openedLinks.length, 1);
  assert.equal(openedLinks[0], 'https://example.com/source');

  dom.window.close();
});
