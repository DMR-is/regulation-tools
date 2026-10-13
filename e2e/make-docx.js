/*
  Writes e2e/fixtures/regulation.docx: a minimal Word document shaped like a
  regulation draft, for the Word import test. Run with `node
  e2e/make-docx.js` if it needs to change; the .docx is committed.
*/
const JSZip = require('jszip');
const { writeFileSync } = require('fs');
const { join } = require('path');

const p = (text, { bold } = {}) =>
  `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const body = [
  p('1. gr.'),
  p('Gildissvið.', { bold: true }),
  p('Reglugerð þessi gildir um innflutning á plöntum.'),
  p('2. gr.'),
  p('Ráðherra er heimilt að setja nánari reglur um:'),
  // A list typed as text, as Word documents often have it.
  `<w:p><w:r><w:t xml:space="preserve">Fyrsta lið með </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>feitletrun</w:t></w:r></w:p>`,
].join('');

const zip = new JSZip();
zip.file(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
);
zip.file(
  '_rels/.rels',
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
);
zip.file(
  'word/document.xml',
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
);
zip
  .generateAsync({ type: 'nodebuffer' })
  .then((buf) =>
    writeFileSync(join(__dirname, 'fixtures', 'regulation.docx'), buf),
  );
