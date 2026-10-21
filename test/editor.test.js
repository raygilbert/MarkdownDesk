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
      if (window.SVGElement) {
        window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 });
        window.SVGElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 });
      }
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

test('renders Mermaid code block as atomic non-editable diagram and preserves it on rich edits', async () => {
  const dom = await editorWindow();
  const rawMermaid = '```mermaid\nflowchart TD\n    A[Start] --> B[End]\n```';
  const md = `# Diagrams\n\n${rawMermaid}\n\nSome trailing text.\n`;
  dom.window.editorAPI.setMarkdown(md, 'Diagrams.md', 'file:///');

  const mermaidBlock = dom.window.document.querySelector('.mermaid-block');
  assert.ok(mermaidBlock, 'Mermaid block element should exist');
  assert.equal(mermaidBlock.getAttribute('contenteditable'), 'false');
  assert.ok(mermaidBlock.hasAttribute('data-raw-mermaid'));

  // Wait for mermaid async render to complete
  await new Promise((r) => setTimeout(r, 100));
  const preview = mermaidBlock.querySelector('.mermaid-preview');
  assert.ok(preview.innerHTML.includes('Start') && preview.innerHTML.includes('End'), 'Mermaid preview should include node label text');

  // Simulate an edit in normal rich text
  const p = dom.window.document.createElement('p');
  p.textContent = 'Appended paragraph.';
  dom.window.document.querySelector('#editor').appendChild(p);
  dom.window.document.querySelector('#editor').dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  const saved = dom.window.editorAPI.getMarkdown();
  assert.match(saved, /```mermaid\nflowchart TD\n\s+A\[Start\] --> B\[End\]\n```/);
  assert.match(saved, /Appended paragraph\./);
  dom.window.close();
});

test('renders GitHub callouts with styled badges and preserves them on rich edits', async () => {
  const dom = await editorWindow();
  const md = `> [!IMPORTANT]\n> This is an important alert.\n\n> [!NOTE]\n> This is a helpful note.\n`;
  dom.window.editorAPI.setMarkdown(md, 'Callouts.md', 'file:///');

  const importantCallout = dom.window.document.querySelector('blockquote.callout-important');
  assert.ok(importantCallout, 'Important callout element should exist');
  assert.equal(importantCallout.getAttribute('data-callout'), 'IMPORTANT');
  assert.ok(importantCallout.querySelector('.callout-header'));

  const noteCallout = dom.window.document.querySelector('blockquote.callout-note');
  assert.ok(noteCallout, 'Note callout element should exist');
  assert.equal(noteCallout.getAttribute('data-callout'), 'NOTE');

  // Simulate edit
  dom.window.document.querySelector('#editor').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const saved = dom.window.editorAPI.getMarkdown();
  assert.match(saved, /> \[!IMPORTANT\]\n> This is an important alert\./);
  assert.match(saved, /> \[!NOTE\]\n> This is a helpful note\./);
  dom.window.close();
});

test('renders ==highlight== as mark tag and losslessly roundtrips', async () => {
  const dom = await editorWindow();
  const md = `Here is ==highlighted text== in a sentence.\n`;
  dom.window.editorAPI.setMarkdown(md, 'Highlight.md', 'file:///');

  const mark = dom.window.document.querySelector('#editor mark');
  assert.ok(mark, 'Mark element should exist');
  assert.equal(mark.textContent, 'highlighted text');

  // Trigger input
  dom.window.document.querySelector('#editor').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const saved = dom.window.editorAPI.getMarkdown();
  assert.match(saved, /==highlighted text==/);
  dom.window.close();
});

test('renders sample-diagrams-and-callouts.md with mermaid diagrams and callouts intact', async () => {
  const dom = await editorWindow();
  const filePath = path.join(__dirname, '..', 'samples', 'sample-diagrams-and-callouts.md');
  const content = fs.readFileSync(filePath, 'utf8');

  dom.window.editorAPI.setMarkdown(content, 'sample-diagrams-and-callouts.md', 'file:///');

  const mermaidBlocks = dom.window.document.querySelectorAll('.mermaid-block');
  assert.ok(mermaidBlocks.length >= 2, 'Mermaid blocks should be present in showcase document');

  const callouts = dom.window.document.querySelectorAll('blockquote.callout');
  assert.ok(callouts.length >= 5, 'Should have all 5 alert callouts');

  // Simulate editing
  dom.window.document.querySelector('#editor').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const saved = dom.window.editorAPI.getMarkdown();

  // Verify mermaid flowchart, sequence diagram, and callouts are preserved
  assert.match(saved, /```mermaid[\s\S]*?flowchart TD[\s\S]*?```/);
  assert.match(saved, /```mermaid[\s\S]*?sequenceDiagram[\s\S]*?```/);
  assert.match(saved, /> \[!IMPORTANT\]/);
  assert.match(saved, /> \[!NOTE\]/);
  assert.match(saved, /> \[!TIP\]/);
  assert.match(saved, /> \[!WARNING\]/);
  assert.match(saved, /> \[!CAUTION\]/);
  assert.match(saved, /==critical requirement==/);

  dom.window.close();
});

