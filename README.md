# @dmr.is/regulations-tools

Helper types and utilities to validate and clean regulation HTML texts, plus
React components that provide a pre-configured TinyMCE editor and live-diff view
for applying changes to older regulations.

```sh
yarn add @dmr.is/regulations-tools
```

## Structured diff (experimental)

`getStructuredDiff` diffs two versions of a regulation the way amendments are
written: article by article, paragraph by paragraph, and word by word only
inside paragraphs it has paired. A new paragraph is one insertion rather than
words smeared across its neighbours, and a renumbered article still pairs with
itself.

```ts
// In the browser:
import getStructuredDiff from '@dmr.is/regulations-tools/structuredDiff-browser';
// In Node (jsdom):
import getStructuredDiff from '@dmr.is/regulations-tools/structuredDiff-server';

const { diff, sections } = getStructuredDiff(olderHtml, newerHtml);
```

`@dmr.is/regulations-tools/structuredDiff` exports the same function taking
your own `asDiv` (`{ asDiv }` in the options), and the types. Everything under
`_structuredDiff/` is internal.

- `diff` — HTML with `<ins>`/`<del>` marks, the same classes `getDiff` uses,
  and the changes below as `data-diff-*` attributes.
- `sections` — what changed, per article, paragraph, list item and sentence:
  inserted, deleted, modified, replaced, split, merged, moved, renumbered, plus
  the word-level edits of each modified paragraph.

`getDiff` is unchanged.

### Reading the annotations

A consumer that keeps only the diff HTML — as the amending-text generator
does — can read every change from attributes on the changed elements.
Unchanged elements carry none, so the markup reads as ordinary diff HTML to
anything that ignores them. Numbers are the **old** version's, as amending
text cites them — except the two attributes that say where something *now*
is: `data-diff-to` and `data-diff-renumbered-to`.

| Attribute | On | Value |
|---|---|---|
| `data-diff` | a changed paragraph, list item, table or heading | `insert`, `delete`, `modify`, `replace`, `split`, `merge`, `move`, `moved` |
| `data-diff-change` | `modify` | `text`, `format` (formatting only) or `both` |
| `data-diff-mgr` | paragraphs | its paragraph number; `1,2` for a merge |
| `data-diff-after-mgr` | inserted paragraphs, the arriving end of a move | the old paragraph it follows; `0` = at the top |
| `data-diff-item` / `data-diff-after-item` | list items | the same, for töluliðir / stafliðir |
| `data-diff-side` | elements showing only one version | `old` or `new` (a whole-block replace, either end of a move) |
| `data-diff-from` | `move` (where it arrived) | where it came from, old numbering: `11.2. gr., 3. mgr.` |
| `data-diff-to` | `moved` (where it left) | where it went, **new** numbering |
| `data-diff-sentences` | a modified paragraph or item | changed sentences: `replace:2 delete:3`; an `insert:N` follows old sentence N |
| `data-diff-section` | every section heading | its old label: `7. gr.`, `11.2. gr.`, `IV. kafli` — the new label only for an inserted section. Also on numbered `<p><em>11.2 …</em></p>` sub-headings |
| `data-diff-renumbered-to` | a renumbered heading | its **new** label |
| `data-diff-signature` | the closing date line and signatories | `true` — not an amendment |

Word edits are in the marks themselves: `<del class="diffmod">X</del><ins
class="diffmod">Y</ins>` is "Í stað X kemur Y". From `getStructuredDiff`
they are also in `sections` as `edits: [{ type, old, new, before }]`.

### Styling

Default styles for diff markup — from either function — ship as a plain CSS
file with no other dependencies:

```ts
import '@dmr.is/regulations-tools/diff.css';
```

Selectors have zero specificity, so your own rules win. Retheme by setting
`--regulation-diff-ins`, `--regulation-diff-del`, `--regulation-diff-del-line`,
`--regulation-diff-format` and `--regulation-diff-move`. The class names are
exported as `DIFF_CLASSES` from `@dmr.is/regulations-tools/diffClasses`.

Note `ins.mod`: htmldiff's mark for _formatting changed, text did not_. A
stylesheet that colours every `ins` green shows it as added text.
