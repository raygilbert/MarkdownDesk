const fs = require('node:fs');
const path = require('node:path');

function prepareVendor(rootDir = path.join(__dirname, '..')) {
  const vendorDir = path.join(rootDir, 'Web', 'vendor');
  fs.mkdirSync(vendorDir, { recursive: true });

  const copies = [
    ['node_modules/marked/lib/marked.umd.js', 'marked.js'],
    ['node_modules/dompurify/dist/purify.min.js', 'purify.js'],
    ['node_modules/turndown/dist/turndown.js', 'turndown.js'],
    ['node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js', 'turndown-gfm.js'],
    ['node_modules/mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
  ];

  for (const [src, dest] of copies) {
    fs.copyFileSync(path.join(rootDir, src), path.join(vendorDir, dest));
  }
}

if (require.main === module) {
  prepareVendor();
  console.log('Vendored scripts successfully copied to Web/vendor');
}

module.exports = { prepareVendor };
