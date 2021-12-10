import mappify from './mappify';

export const inlineTextElms = 'A,B,I,STRONG,EM,SUB,SUP,U,S,SPAN';
export const isInlineTextElm = mappify(inlineTextElms);

export const inlineSelfClosingElms = 'BR,IMG';
export const inlineElms = inlineTextElms + ',' + inlineSelfClosingElms;
export const isInlineElms = mappify(inlineElms);

export const blockTextElms =
  'H2,H3,H4,H5,H6,P,OL,UL,LI,BLOCKQUOTE,TABLE,CAPTION,THEAD,TBODY,TFOOT,TR,TH,TD,DIV,SECTION';
export const blockElms = blockTextElms + ',' + 'HR';
export const isBlockElm = mappify(blockElms);

export const tableCells = 'TD,TH';
export const isTableCell = mappify(tableCells);

export const unsafeElements = 'LINK,META,STYLE,SCRIPT';
export const meaninglessElements = 'NOSCRIPT';
