/*
  NOT API. A rough sketch of amending-text phrasing ("Á eftir 2. mgr. 3. gr.
  kemur ný málsgrein"), to check the operations against what amending
  regulations actually say — used by the tests and scripts/structuredDiffReport.
  The real generator lives in island.is.
*/

import { splitSentences } from './sentences';
import { words } from './similarity';
import { Block, BlockOp, StructuredDiff } from './types';

/** "3. tölul." / "c-liður" */
export const itemLabel = (b: Block) =>
  b.lettered
    ? `${String.fromCharCode(96 + b.item!)}-liður`
    : `${b.item}. tölul.`;

export const describeItems = (op: BlockOp, label: string): Array<string> => {
  const where = `${op.old!.mgr}. mgr. ${label}`;
  const items = op.items!;
  const lines: Array<string> = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.type === 'equal') {
      continue;
    }
    if (it.type === 'insert') {
      // Consecutive new items are one insertion, as amending text writes it.
      let k = 1;
      while (items[i + k]?.type === 'insert') {
        k++;
      }
      const lettered = it.new!.lettered;
      const what =
        k === 1
          ? `kemur ${lettered ? 'nýr stafliður' : 'nýr töluliður'}`
          : `koma ${k} ${lettered ? 'nýir stafliðir' : 'nýir töluliðir'}`;
      const after = items
        .slice(0, i)
        .reverse()
        .find((x) => x.old)?.old;
      lines.push(
        after
          ? `Á eftir ${itemLabel(after)} ${where} ${what}.`
          : `Á undan fyrsta lið ${where} ${what}.`,
      );
      i += k - 1;
    } else if (it.type === 'delete') {
      lines.push(`${itemLabel(it.old!)} ${where} fellur brott.`);
    } else if (it.type === 'replace') {
      lines.push(`${itemLabel(it.old!)} ${where} orðast svo.`);
    } else {
      lines.push(`${itemLabel(it.old!)} ${where} breytist.`);
    }
  }
  return lines;
};

/**
 * A modified paragraph's changes by sentence ("2. málsl. 3. mgr. … fellur
 * brott"), or undefined when every sentence changed and the paragraph as a
 * whole is the better unit.
 */
export const describeSentences = (
  op: BlockOp,
  label: string,
): Array<string> | undefined => {
  const where = `${op.old!.mgr}. mgr. ${label}`;
  const oldCount = splitSentences(op.old!.text).length;
  const sentences = op.sentences!;
  const touched = new Set(sentences.filter((x) => x.old).map((x) => x.old));
  if (touched.size >= oldCount) {
    return;
  }
  const lines: Array<string> = [];
  for (let i = 0; i < sentences.length; i++) {
    const x = sentences[i]!;
    if (x.type === 'insert') {
      let k = 1;
      while (
        sentences[i + k]?.type === 'insert' &&
        sentences[i + k]!.afterOld === x.afterOld
      ) {
        k++;
      }
      const what = k === 1 ? 'nýr málsliður' : `${k} nýir málsliðir`;
      lines.push(
        x.afterOld === oldCount
          ? `Við ${where} ${k === 1 ? 'bætist' : 'bætast'} ${what}.`
          : x.afterOld === 0
          ? `Á undan 1. málsl. ${where} ${k === 1 ? 'kemur' : 'koma'} ${what}.`
          : `Á eftir ${x.afterOld}. málsl. ${where} ${
              k === 1 ? 'kemur' : 'koma'
            } ${what}.`,
      );
      i += k - 1;
    } else if (x.type === 'delete') {
      lines.push(`${x.old}. málsl. ${where} fellur brott.`);
    } else {
      lines.push(`${x.old}. málsl. ${where} orðast svo.`);
    }
  }
  return lines;
};

/** "kemur ný málsgrein" / "koma 2 nýjar málsgreinar" */
export const newParagraphs = (k: number, verbOne: string, verbMany: string) =>
  k === 1 ? `${verbOne} ný málsgrein` : `${verbMany} ${k} nýjar málsgreinar`;

export const describeChanges = (diff: StructuredDiff): Array<string> => {
  const lines: Array<string> = [];
  const sections = diff.sections;
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]!;
    if (s.type === 'equal' || (s.old || s.new)!.signature) {
      continue;
    }
    if (s.type === 'insert') {
      // Consecutive new sections are one insertion after the same old section.
      const run = [s];
      while (sections[si + 1]?.type === 'insert') {
        run.push(sections[++si]!);
      }
      const labels = run.map((x) => x.new!.label).join(', ');
      const after = s.afterOld?.label;
      const what =
        run.length === 1
          ? `kemur ný grein, ${labels}`
          : `koma nýjar greinar, ${labels}`;
      lines.push(
        after ? `Á eftir ${after} ${what}` : `Nýjar greinar: ${labels}`,
      );
      continue;
    }
    if (s.type === 'delete') {
      lines.push(`${s.old!.label} fellur brott.`);
      continue;
    }
    const label = s.old!.label || '(inngangur)';
    if (s.renumbered) {
      lines.push(`${label} verður ${s.new!.label}`);
    }
    if (s.headingChanged) {
      lines.push(`Fyrirsögn ${label} orðast svo: ${s.new!.title}`);
    }
    const lastOldMgr = s.old!.blocks[s.old!.blocks.length - 1]?.mgr || 0;
    const ops = s.blocks;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.type === 'equal') {
        continue;
      }
      if (op.type === 'moved') {
        continue; // described at the new position, by its `move`
      }
      if (op.type === 'move') {
        const from = op.movedFrom!;
        const phrase =
          `${from.mgr}. mgr. ${from.label || '(inngangur)'} færist og verður ` +
          `${op.new!.mgr}. mgr. ${label}` +
          (op.change ? ` (og breytist: ${op.change})` : '');
        // Labels end in "gr." — don't double the full stop.
        lines.push(phrase.endsWith('.') ? phrase : phrase + '.');
        continue;
      }
      if (op.type === 'replace') {
        lines.push(`${op.old!.mgr}. mgr. ${label} orðast svo.`);
        continue;
      }
      if (op.type === 'split') {
        lines.push(
          `${op.old!.mgr}. mgr. ${label} skiptist í ${
            op.newBlocks!.length
          } málsgreinar.`,
        );
        continue;
      }
      if (op.type === 'merge') {
        const mgrs = op.oldBlocks!.map((x) => x.mgr);
        lines.push(
          `${mgrs.join('. og ')}. mgr. ${label} sameinast í eina málsgrein.`,
        );
        continue;
      }
      if (op.type === 'modify' && op.items) {
        lines.push(...describeItems(op, label));
        continue;
      }
      // One or two words swapped: "Í stað „X" í 2. mgr. … kemur: Y".
      if (
        op.type === 'modify' &&
        op.change === 'text' &&
        op.edits?.length &&
        op.edits.length <= 2 &&
        op.edits.every(
          (e) =>
            e.type === 'replace' &&
            words(e.old).length <= 6 &&
            words(e.new).length <= 6,
        ) &&
        !op.sentences?.some((x) => x.type === 'insert' || x.type === 'delete')
      ) {
        op.edits.forEach((e) =>
          lines.push(
            `Í stað „${e.old}" í ${
              op.old!.mgr
            }. mgr. ${label} kemur: ${e.new.replace(/\.$/, '')}.`,
          ),
        );
        continue;
      }
      if (op.type === 'modify' && op.sentences?.length) {
        const sentenceLines = describeSentences(op, label);
        if (sentenceLines) {
          lines.push(...sentenceLines);
          continue;
        }
      }
      if (op.type === 'modify') {
        lines.push(
          op.change === 'text'
            ? `${op.old!.mgr}. mgr. ${label} breytist (orðalag).`
            : `${op.old!.mgr}. mgr. ${label} breytist (framsetning${
                op.change === 'both' ? ' og orðalag' : ''
              }: ${op.old!.shape} → ${op.new!.shape}).`,
        );
        continue;
      }
      // Collect a run of deletes followed by inserts.
      const dels: Array<BlockOp> = [];
      const ins: Array<BlockOp> = [];
      while (ops[i]?.type === 'delete') {
        dels.push(ops[i++]!);
      }
      while (ops[i]?.type === 'insert') {
        ins.push(ops[i++]!);
      }
      i--;
      const delMgrs = [...new Set(dels.map((d) => d.old!.mgr))];
      if (dels.length && ins.length) {
        lines.push(
          `${delMgrs.join('., ')}. mgr. ${label} orðast svo (${
            ins.length
          } blokk/ir).`,
        );
      } else if (dels.length) {
        lines.push(`${delMgrs.join('., ')}. mgr. ${label} fellur brott.`);
      } else {
        const after = ins[0]!.afterOldMgr!;
        const k = new Set(ins.map((x) => x.new!.mgr)).size;
        lines.push(
          after === 0
            ? `Á undan 1. mgr. ${label} ${newParagraphs(k, 'kemur', 'koma')}.`
            : after >= lastOldMgr
            ? `Við ${label} ${newParagraphs(k, 'bætist', 'bætast')}.`
            : `Á eftir ${after}. mgr. ${label} ${newParagraphs(
                k,
                'kemur',
                'koma',
              )}.`,
        );
      }
    }
  }
  return lines;
};
