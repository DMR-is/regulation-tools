# Change Log

## Upcoming...

## 1.0.0

_Not yet released. Pre-releases on the `next` tag: `1.0.0-next.1`,
`1.0.0-next.2` (the image dialog below, and the 0.12.0–0.13.1 diff
fixes), `1.0.0-next.3` (the first trial round: the toolbar, dialogs and
tables below), `1.0.0-next.4` (large tables load fast; the text scrolls in
a height-capped frame), `1.0.0-next.5` (tables keep their markup)._

- **BREAKING:** React `^18 || ^19` (was `>=16.8 <20`). Developed and tested
  on React 19; `yarn typecheck:react18` keeps it working on 18.
  `@hugsmidjan/react` is no longer a dependency.
- Feat: `EditorV2`, the editor rebuilt on Tiptap, beside the unchanged
  `Editor`. The same props, `classes` and uploader; `toolbar` takes the
  place of `config` and accepts the same toolbar strings. Every feature of
  `Editor`, fast on long regulations (no keystroke or pause freezes on the
  longest texts, where `Editor` froze for up to 13 s), and loading a
  regulation and saving it untouched changes nothing, once saved through
  `cleanupEditorOutput`. Styles: `editorV2.css`. See the README and
  `docs/plan-tiptap-editor.md`.
- Feat: `EditorV2`'s image button opens an image dialog, as `Editor`'s
  does: the image's address, an upload button and its alt text, which
  starts as the file name and can be edited. With an image selected, the
  same button edits that image. (`next.1` inserted the image straight
  from the file picker, with the file name as alt text and no way to
  change it.)
- Feat: `EditorV2`'s tables, as `Editor` offered them: a size grid to
  insert one, the table menu grouped (rows, columns, cells, style), a bar
  over the table the cursor is in, and a right-click menu.
- Fix: `EditorV2`'s toolbar is one row at any width: what does not fit
  goes into a "more" (⋯) dropdown at the end, as with `Editor`'s toolbar.
- Fix: `EditorV2`'s toolbar keeps its width as the cursor moves: the
  numbering style is always beside the numbered list button (a style
  chosen outside a list starts one), and "mark as checked" for an
  auto-generated block is on the bar over the block.
- Fix: `EditorV2` loads texts with large tables fast. Tiptap's table
  cells looked up their column width in the whole table once per cell, so
  a table of 10,000 cells took 14 s to load (4× CPU slowdown); now 4 s.
- Fix: `EditorV2`'s text element (`classes.editor`) is a child of
  `classes.editingpane` again, as in `Editor`, so a height cap with
  `overflow-y: auto` on it scrolls the text instead of letting it run past
  the frame, and a wide table's scrollbar is at the bottom of the frame.
  If you worked around this in `next.3` (scrolling `classes.editingpane`
  instead), you can put it back. The README now says where each of the
  `classes` lands, and what changed inside the toolbar.
- Fix: `EditorV2` keeps a table's markup as `Editor` did: every
  attribute (`width`, `border`, `valign`, `cellpadding`, `style`, …; event
  handlers aside), `<colgroup>`, and `<thead>` and `<tfoot>` (earlier
  pre-releases moved their rows into the `<tbody>`). It also keeps `left` and `justify`
  alignment. Apps that store the editor's output uncleaned (ojoi) lost
  these on the first edit; for regulations, cleanup removes them on save as
  before. Styles are written normalized (`width: 100%;`). `<font>` is still
  dropped, keeping its text. Earlier pre-releases also wrote a
  `colwidth` attribute for tables with a `<colgroup>`; no longer.
- Fix: `EditorV2`'s warning on load ("can't keep everything in this
  text") names dropped attributes too, not only elements, one line per
  element and attribute with a count.
- **Changed:** `editorV2.css`: the buttons, menus and dialogs are no
  longer undone by an app's element resets (`button { border: none;
  padding: 0 }` flattened the dialog buttons and cramped the toolbar).
  Their rules now have one class's specificity, so a single class of an
  app's own wins over them only when it loads later; override with two
  classes (`.yourToolbar .regtools-toolbar__button`) or the
  `--regtools-*` custom properties. The toolbar element itself
  (`classes.toolbar`) and the text keep zero specificity.
  **When switching a screen to `EditorV2`**, check your `classes.toolbar`:
  it styles the new toolbar's frame and wins over the defaults, so rules
  set for TinyMCE carry over (`padding: 0` puts the buttons against the
  frame). Remove those to get the default frame; see the README. A
  lighter toolbar; B, I, U and S as letters; dialog buttons as primary,
  secondary and danger; the "insert" group as "+" and the format group
  as "T".
- Fix: Pasting and importing Word documents (both editors): an ordinary
  image next to a pasted one is no longer dropped; GIF and WebP images are
  uploaded; unreadable image data becomes the "[Image upload failed]"
  marker instead of `__IMAGE_PLACEHOLDER_n__`; pasted images keep their alt
  text; lettered and roman lists keep their items' formatting, links and
  nested lists; "N. gr." detection handles `<br>` and leaves no empty
  paragraph.
- **Security:** Pasted HTML could run script in both editors
  (`<img src=x onerror=…>` ran when the paste pipeline parsed it with the
  page's own document). All parsing of outside HTML (`asDiv`, paste, Word
  import) now uses an inert document, and clipboard HTML is sanitised first
  (active elements, MathML/SVG and raw-text elements, `on*` handlers,
  unsafe URL schemes), until stable, which also closes mutation XSS.
  Applies to `Editor` too.
- Fix: Pasted lists numbered as text keep their type when they resume
  mid-list ("i." then "j." stays lettered, "v." then "vi." stays roman),
  and get `start` from their first marker ("c." starts at 3). Both
  editors.
- Feat: `getStructuredDiff` and `createStructuredDiffer` are no longer
  experimental. The functions, exported types, `data-diff-*` attributes and
  their values, and the classes follow semver; pairing and the exact
  placement of word marks may still improve in minor versions.
- Chore: `yarn publishdist` publishes pre-release versions under the `next`
  tag.
- Feat: `TextWarnings` takes an optional `highlight` function.
- Note: `Editor` still uses `@tinymce/tinymce-react` 3.x, whose peer range
  stops at React 18, so installing on React 19 gives a peer-dependency
  warning. It works (two of the apps already run it on 19); it goes away
  with `Editor` in 2.0.0.

## 0.13.1

_2026-10-15_

- Fix: `getStructuredDiff`: a row added to or removed from a table is one
  modified table with only that row marked, not the old and new tables
  side by side. Likewise an item added to a short list. Cells, items and
  `<br>`s ran their text together ("Loðna100"), so a table shared no words
  with itself once a row changed.

## 0.13.0

_2026-10-14_

- Feat: `getStructuredDiff` and `createStructuredDiffer` never throw. HTML
  nested deeper than the call stack allows (lists 1,000 deep) threw a
  `RangeError`; such texts now get `getDiff`'s flat word diff, flagged
  `fallback: true`, with empty `sections`.
- Fix: An untitled article inserted before others no longer reads as every
  later article rewritten. Untitled articles with the same number pair only
  when they keep a block unchanged or are similar; one whose body was
  rewritten still pairs by number as a last resort.
- Fix: A one-cell edit in a small table is `modify`, not `replace`: a table
  with the same rows and columns and at least half its cells unchanged is
  the same table.

## 0.12.0

_2026-10-14_

- Feat: `createStructuredDiffer` (`structuredDiff`, `-browser`, `-server`):
  diffs one base text against a text being edited, again and again, redoing
  only what changed. The same result as `getStructuredDiff`, plus the diff
  per section (`parts`).
- Fix: `getStructuredDiff` no longer emits newline-only `<ins>`/`<del>`
  marks, as `getDiff` already did not. In tables they sat between rows and
  ended up hoisted out in front of the `<table>`.
- Fix: `getStructuredDiff` renders a replaced paragraph, item or heading as
  one element, `<p><del>old</del><ins>new</ins></p>`, as `getDiff` did.
  Two siblings made readers that count elements count two paragraphs and
  number every later one too high. A replace that changes the tag (`p` →
  `ol`) is still the old element followed by the new.
- Fix: `getStructuredDiff` renders a block whose formatting alone changed
  (bold → italic over the whole block, a list made lettered) as the new
  block only, its content in `<ins class="mod">`, not as the same text
  deleted and inserted again.
- Feat: Moved blocks are marked `diffins diffmove` / `diffdel diffmove`, so
  readers that know only inserted and deleted see them too.
- Fix: `getTextContentDiff` escaped `>` as `&lg;` (not an entity), so titles
  showed a literal "&lg;". It is now `&gt;`.
- Feat: `diff.css` styles inserted and deleted rules (`hr[data-diff]`):
  solid for inserted, dashed for deleted. Colours:
  `--regulation-diff-hr-ins`, `--regulation-diff-hr-del`.

## 0.11.0

_2026-10-06_

- Feat: Add `getStructuredDiff` (experimental) — diffs regulation texts by
  article, paragraph, list item and sentence, word-diffing only inside paired
  paragraphs, so a new paragraph is one insertion and untouched neighbours
  stay untouched. Returns the diff HTML plus what changed — inserted,
  deleted, modified, replaced, split, merged, moved and renumbered — with
  each change's word-level edits. Import from `structuredDiff-browser` or
  `structuredDiff-server` (or `structuredDiff` with your own `asDiv`).
  `getDiff` is unchanged.
- Feat: The structured diff's HTML carries its changes as `data-diff-*`
  attributes (see README), for consumers that keep only the HTML, such as an
  amending-text generator.
- Feat: Ship default diff styles as `diff.css` — plain CSS, its own palette as
  `--regulation-diff-*` custom properties, zero-specificity selectors. Styles
  `ins.mod` (formatting changed) distinctly instead of as added text. Works
  for `getDiff` output too.
- Feat: Export diff class names as `DIFF_CLASSES` (`diffClasses`).

## 0.10.3

_2026-06-25_

- Fix: Keep image-only (and `hr`/`svg`) editor content from being stripped as "empty" on save.

## 0.10.2

_2026-02-10_

- Chore: Update import for date-fns

## 0.10.1

_2026-02-10_

- Feat: Add support for numbered and alphabetical lists in HTML import.
- Feat: Add support for suppressing individual editor warnings.

## 0.10.0

_2025-11-17_

- Feat: Rename module to `@dmr.is/regulations-tools`
- Feat: Update default styling for chapter names.

## 0.9.2

_2024-08-20_

- Feat: Add option to upload word documents to be resolved in the Editor.

## 0.9.1

_2024-07-05_

- Feat: Clean up tools dropdown in editor

## 0.9.0

_2024-06-11_

- Feat: Paste images and text into regulation editor. Upload PDF's with file uploader.

## 0.8.0 - 0.8.1

_2024-05-07_

- Feat: Upgrade build (esbuild, react, and more)

## 0.7.16

_2024-05-07_

- Fix: Update translations for `EditorFrame`

## 0.7.15

_2024-03-25_

- Fix: Add missing `date-fns` dep to tools for dirtyClean

## 0.7.14

_2024-03-12_

- Fix: Defer inital value for initalvalue different from base value rendering

## 0.7.13

_2024-01-16_

- fix: enable custom config in `EditorFrame`

## 0.7.12

_2023-11-06_

- fix: broken toolbar selector after react 18 upgrade

## 0.7.10 - 0.7.11

_2023-05-11_

- feat: load `htmldiff-js` from npm
- fix: rollback esbuild to 0.14 because of causing build errors with jsx

## 0.7.9

_2022-06-13_

- feat: add `lawChapters` to `RegulationOption`
- feat: add presigned file upload route
- fix: incorrect `repealed` prop in `RegulationOption`
- fix: more aggressive Title cleanup
- fix: update pdf css to better match old regulations

## 0.7.8

_2022-04-20_

- feat: Add `status` prop to `RegulationHistoryItem`

## 0.7.7

_2022-03-11_

- feat: Add props `readOnly`, `disabled` and `hideWarnings` to `Editor`
- feat: Add optional `wrapperDisabled`, `wrapperReadonly` to `EditorClasses`

## 0.7.5 – 0.7.6

_2022-01-31_

- feat: Export browser-safe `combineTextAppendixesComments` from `utils`
- fix: Bad/limited `_stripEmpty` html method

## 0.7.4

_2022-01-27_

- feat: Add `type` filed to `RegulationOption` type
- fix: Make all `TextWarning`-related methods require `HTMLText` as input

## 0.7.1 – 0.7.3

_2022-01-24_

- feat: Make `WarningList`'s `angst` values required
- feat: Add `setStrictMode()` toggler for the TextWarnings generator
- feat: Add prop `EditorProps.warningsAbove` (and change default to `false`)

## 0.7.0

_2022-01-23_

- **BREAKING** feat: Change signature of `EditorProps.fileUploader` to match
  TinyMCE
- **BREAKING** feat: Drop `EditorProps.name` …in favour of `fileUploader`
  handling it

## 0.6.0 – 0.6.1

_2022-01-22_

- **BREAKING** feat: Add `fileUploader` prop to `<Editor />`
- **BREAKING** feat: `replaceImageUrls()` now requires a `regName` as parameter
- feat(ts): Explicitly allow `PlainText` to be the empty string
- fix: `replaceImageUrls` now also collects linked resources that were uploaded
  to a temporary folder on the file-server while drafting a regulation

## 0.5.80 – 0.5.81

_2022-01-14_

- fix: `Editor` initialization edgecases missed some early change events.
- fix: Make `Editor` collapse empty HTML to `""` on export

## 0.5.79

_2022-01-13_

- fix: Prevent `ensureISODate` from throwing on bogus calendar dates

## 0.5.78

_2022-01-11_

- feat: Add types `RegulationOption`, `RegulationOptionList`
- refactor: Make `Editor` slimmer by decoupling from client-side dirtyClean
- fix: Tighten up `ensureNameSlug` and `ensureRegName` — to require 20th or 21st
  century years
- fix: `cleanupEditorOutput` wasn't idempotent on `data-legacy-indenter` spacers

## 0.5.76 – 0.5.77

_2021-12-28_

- feat: `Editor` now expects API to return "de-prettified" regulation texts
- fix: `Editor` showing false positive diff on initialization — (Caused by a
  breaking change in upstream TinyMCE MINOR-version update)

## 0.5.75

_2021-12-27_

- fix: Update `tinymce`, add workaround for a plugin-init regression

## 0.5.74

_2021-12-20_

- feat: `Editor` normalizes empty, single-element HTMLText to literal `''`
- fix: Make `Editor`'s `name` prop safer and document its purpose better

## 0.5.73

_2021-12-17_

- fix: Remove stray plugin reference in `Editor`

## 0.5.72

_2021-12-16_

- feat: Add branded string type `URLString` and helper `ensureURLString()`

## 0.5.70 – 0.5.71

_2021-12-15_

- feat: Move `combine`-/`extractAppendixesAndComments` and `eliminateComments`
  to `textHelpers` — deprecate importing them from `cleanupEditorOutputs`
- feat: Add type `RegulationTextProps`
- fix(ts): Import `globals.d.ts` where `htmldiff-js` typings are required —
  (helps local monorepo builds run)

## 0.5.68 – 0.5.69

_2021-12-14_

- feat: Remove non-sensical mapper functions from `utils`
- fix: Remove unused "dirty/original HTML" features from `<Editor/>`
- fix: Reclassify `@types/jest` as devDependency
- fix: Annoying import issue with htmldiff-js fork

## 0.5.1 – 0.5.6, 0.5.67

_2021-12-13_

- feat: Rename all `ensure*` helpers - deprecate their old `assert*` names
- feat: Make all `ensure*` helpers accept `unknown` input values
- feat: Add helpers `ensureReasonableYear`, `ensureRegType`
- fix: Make `ensurePosInt` accept number typed input
- fix: Some modules were missing from build
- fix: Move cleanup-prettier's configs into a ts module
- fix: Inline htmldiff-js wrapper's type signature
- fix: Rename the private `_utils/*` folder to avoid accidental imports
- chore: Fix build target declaration and fix build globs
- chore: Set version-range on `htmldiff-js` git-dependency

## 0.5.0

_2021-12-10_

- **BREAKING** feat: Rename module to `@island.is/regulations-tools`
- feat: Add regulation API types — `Regulation`, `RegulationDiff`,
  `RegulationRedirect`, `Ministry`, `LawChapter`, etc...
- feat: Add lots of `/utils`
- feat: Add `/htmldiff-js` fork with bugfixes and size/speed improvements

## 0.4.8

_2021-10-11_

- feat: Support `.subchapter__title`s
- feat: Rename editor title/heading styles

## 0.4.6 – 0.4.7

_2021-10-11_

- feat: Block invalid image URLs
- feat: Warn about insecure (HTTP) links in regulation texts

## 0.4.3 – 0.4.5

_2021-10-01_

- feat: Add utility function `cleanupAllEditorOutputs()`
- feat: Export branded type `Year`
- fix: Clean `appendix.title`'s also along with other editor outputs

## 0.4.0 – 0.4.2

_2021-09-13_

- **BREAKING** feat: Remove prop `initialText` from `Editor` — Instead always
  read the initial value from `valueRef`
- **BREAKING** feat: `Editor` now requires `baseText` and `valueRef.current()`
  to be `HTMLText`
- fix: Retain Editor's `valueRef.current()` when component unmounts

## 0.3.6

_2021-09-08_

- fix: Trim extracted text and remove newlines from appendix titles

## 0.3.5

_2021-09-03_

- feat: Make `Editor`'s `baseText` prop optional - hide comparison if nully
- docs: Add some JSDoc texts for `EditorProps`

## 0.3.3 – 0.3.4

_2021-09-02_

- feat: Pass `aria-labelledBy`, `aria-describedBy` attributes to `Editor`
- feat: Add `onFocus`/`onBlur` props to `Editor`
- feat: Add idempotent `cleanTitle()` function
- feat: improvements to `dirtyClean`/`cleanupEditorOutput`

## 0.3.2

_2021-08-13_

- fix: Mismatch between `Editor`'s `valueRef.current()` and its internal
  "currentText"

## 0.3.1

_2021-08-12_

- fix: Huge lag when manualluy diffing large documents.

## 0.3.0

_2021-08-11_

- **BREAKING** feat: Add new `EditorClasses` prop `diffNowBtn`
- feat: Detect when htmldiff is super slow and switch to manual diffing
- feat: Support `.section__title` for "1. HLUTI" titles

## 0.2.5

_2021-08-09_

- feat: Support `.section__title` for "1. HLUTI" titles

## 0.2.2 – 0.2.4

_2021-07-09_

- feat: Add types `MinistrySlug`, `LawChapterSlug`, `RegluationType`
- chore: Update deps to fix lingering `qj` aliasing issue

## 0.2.1

_2021-07-08_

- chore: Cleanup dependencies: de-alias `qj` and drop `lodash`

## 0.2.0

_2021-07-05_

- chore: Remove `pkg.type` field
- feat: Add `comparisonpaneContainer` className prop to Editor component

## 0.1.5

_2021-06-24_

- feat: Add branded basic `types` module
- feat: Add `html` helpers module

## 0.1.2 – 0.1.4

_2021-06-22_

- feat: Add `editorBooting` to `EditorClasses`
- fix: Magical import paths
- fix: Load skin CSS from CDN for better portability
- fix: Use `React.Lazy` for dynamic importing `EditorFrame`
- fix: Add missing deps

## 0.1.0

_2021-06-21_

- feat: Refactor `regulations-editor` related tools into a standalone module
