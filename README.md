# @dmr.is/regulations-tools

Helper types and utilities to validate and clean regulation HTML texts, plus
React components that provide a pre-configured editor (TinyMCE, or Tiptap in
`EditorV2`) and live-diff view for applying changes to older regulations.

```sh
yarn add @dmr.is/regulations-tools
```

## EditorV2 (preview)

`EditorV2` is the regulation editor rebuilt on
[Tiptap](https://tiptap.dev/), next to the current `Editor` (TinyMCE 5,
end-of-life). It takes the same props, the same `classes` and produces the
same HTML, so a screen can switch by changing the import:

```tsx
import { EditorV2 } from '@dmr.is/regulations-tools/EditorV2';
import '@dmr.is/regulations-tools/editorV2.css';

<EditorV2
  classes={editorClasses} // the same object you pass to Editor
  valueRef={valueRef}
  baseText={baseText}
  fileUploader={fileUploader} // the same uploader
  toolbar="bold italic underline | align numlist bullist | link"
/>;
```

The only prop that changed is `config`, which held TinyMCE's settings and
was only ever used for the toolbar: `toolbar` replaces it, and takes the
same toolbar strings (or a typed array, or `false` for none).

What is different for the people editing:

- **Long texts are fast.** Typing does not rewrite the whole text to HTML
  on every keystroke, and the comparison pane uses `createStructuredDiffer`
  (below) after a pause in typing, re-diffing only the articles that
  changed and updating only those in the pane. Automatic diffing no longer
  switches itself off on long regulations.
- **The regulation's structure is part of the editor.** Grein, Kafli,
  Undirkafli and Bráðabirgðaákvæði are offered only at the top level of the
  text.
- **Loading a text and saving it untouched changes nothing.** Checked over
  1,234 documents from 700 real regulations
  (`scripts/editorFidelity.ts`); see `docs/plan-tiptap-editor.md`.

Measured in Chromium on the longest regulations, typing into the middle of
the text with the CPU slowed 4× (`scripts/editorSpeed.ts`):

| Text | Slowest keystroke | Freeze after typing stops | Automatic diff |
|---|---|---|---|
| 0112/2012 (520 KB) | 752 ms → 72 ms | 3.3 s → none | turned off → on |
| 0544/2015 (410 KB) | 264 ms → 40 ms | 13.0 s → none | turned off → on |
| 1205/2021 (396 KB) | 248 ms → 72 ms | 12.7 s → none | turned off → on |

Pasting articles or adding one freezes `Editor` for 0.8–15 s afterwards
on these texts; `EditorV2` for none.

`Editor` → `EditorV2`; "none" means no main-thread task over 50 ms. These
are lab numbers from a page holding only the editor; the full results and
their caveats are in `docs/plan-tiptap-editor.md`.

`editorV2.css` styles the toolbar, menus and dialogs. The rules for the toolbar
element (which `classes.toolbar` styles) and for the text have zero specificity,
so your own rules win whatever the load order. The buttons, menus and dialogs
have one class's specificity, so an app's element resets (`button { border:
none; padding: 0 }`) do not undo them; override them with two classes
(`.yourToolbar .regtools-toolbar__button`) or the `--regtools-*` custom
properties at the top of the file.

The `classes` land where they did in `Editor`: `wrapper` and `editingpane`
on the same elements, `toolbar` on the toolbar's frame, and `editor` on the
text element, a child of the editing pane as before (Tiptap's own wrapper
div around it has `display: contents`). So a layout written for `Editor`
works unchanged, for example a height cap with `overflow-y: auto` on
`classes.editor` to scroll the text. What is inside the toolbar is new:
rules for TinyMCE's own elements (`.tox-*`, `.mce-*`) no longer apply.

When switching a screen, check what your `classes.toolbar` sets. It styles
`EditorV2`'s toolbar frame too, and wins over `editorV2.css`, so rules
written for TinyMCE's toolbar carry over: a `padding: 0` there, for
example, puts the buttons against the frame. Remove what you set only for
TinyMCE to get the default frame (padding, a light border, rounded
corners); keep what is your own layout, such as `position: sticky`.

## Structured diff

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

To diff one base text against a text being edited, again and again, use
`createStructuredDiffer`. It keeps what it can between calls, so after a
small edit only the changed articles are diffed again, and gives exactly
what `getStructuredDiff` gives. `parts` is the diff one section at a time,
with keys that stay the same while a section does:

```ts
import { createStructuredDiffer } from '@dmr.is/regulations-tools/structuredDiff-browser';

const differ = createStructuredDiffer(baseHtml);
const { diff, sections, parts } = differ.diff(editedHtml);
```

`@dmr.is/regulations-tools/structuredDiff` exports the same functions taking
your own `asDiv` (`{ asDiv }` in the options), and the types. Everything under
`_structuredDiff/` is internal.

- `diff` — HTML with `<ins>`/`<del>` marks, the same classes `getDiff` uses,
  and the changes below as `data-diff-*` attributes.
- `sections` — what changed, per article, paragraph, list item and sentence:
  inserted, deleted, modified, replaced, split, merged, moved, renumbered, plus
  the word-level edits of each modified paragraph.

`getDiff` is unchanged.

Neither function throws. Should a text be impossible to diff structurally —
HTML nested deeper than the call stack allows — the result has
`fallback: true`, `diff` is `getDiff`'s flat word diff with no `data-diff-*`
attributes (or, should that fail too, the new text unmarked), and `sections`
is empty.

The functions, the exported types, the `data-diff-*` attributes and their
values, and the classes follow semver. Which paragraphs get paired, and where
exactly the word marks fall, may improve in minor versions.

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
| `data-diff-side` | elements showing only one version | `old` or `new`: either end of a move, a replace that changed the tag (`p` → `ol`), `new` for a block whose formatting alone changed |
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
`--regulation-diff-format`, `--regulation-diff-move`, and for inserted and
deleted rules (`hr`), `--regulation-diff-hr-ins` and `--regulation-diff-hr-del`. The class names are
exported as `DIFF_CLASSES` from `@dmr.is/regulations-tools/diffClasses`.

Note `ins.mod`: htmldiff's mark for _formatting changed, text did not_. A
stylesheet that colours every `ins` green shows it as added text.
