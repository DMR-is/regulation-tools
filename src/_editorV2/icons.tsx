/*
  The icons of the toolbar, the table bar and the dialogs: the 28 that
  `EditorV2` uses, copied from Lucide (lucide-react 1.55.0) so the package
  doesn't depend on all of lucide-react for them. Each is a stroked 24×24
  SVG drawn in the text color, hidden from screen readers (the buttons
  carry the labels).

  Lucide, ISC License. Copyright (c) 2026 Lucide Icons and Contributors.
  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted, provided that the above
  copyright notice and this permission notice appear in all copies.
  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
  WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
  MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
  ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
  WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
  ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
  OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

  ChevronDown, Code, Ellipsis, Link, Minus, Plus, Search, Trash2, Type and
  Upload derive from Feather. The MIT License (MIT). Copyright (c)
  2013-present Cole Bemis. Permission is hereby granted, free of charge, to
  any person obtaining a copy of this software and associated documentation
  files (the "Software"), to deal in the Software without restriction,
  including without limitation the rights to use, copy, modify, merge,
  publish, distribute, sublicense, and/or sell copies of the Software, and
  to permit persons to whom the Software is furnished to do so, subject to
  the following conditions: The above copyright notice and this permission
  notice shall be included in all copies or substantial portions of the
  Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
  NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
  DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
  USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import React, { ReactNode } from 'react';

export type IconProps = { size?: number; className?: string };
export type Icon = (props: IconProps) => React.JSX.Element;

const icon =
  (paths: ReactNode): Icon =>
  ({ size = 24, className }) =>
    (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );

export const AlignCenter = icon(
  <>
    <path d="M21 5H3" />
    <path d="M17 12H7" />
    <path d="M19 19H5" />
  </>,
);

export const AlignLeft = icon(
  <>
    <path d="M21 5H3" />
    <path d="M15 12H3" />
    <path d="M17 19H3" />
  </>,
);

export const AlignRight = icon(
  <>
    <path d="M21 5H3" />
    <path d="M21 12H9" />
    <path d="M21 19H7" />
  </>,
);

export const BadgeCheck = icon(
  <>
    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
    <path d="m16 9-5.5 5.5L8 12" />
  </>,
);

export const ChevronDown = icon(
  <>
    <path d="m6 9 6 6 6-6" />
  </>,
);

export const Code = icon(
  <>
    <path d="m16 18 6-6-6-6" />
    <path d="m8 6-6 6 6 6" />
  </>,
);

export const Ellipsis = icon(
  <>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </>,
);

export const FileText = icon(
  <>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>,
);

export const Image = icon(
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>,
);

export const Link = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>,
);

export const List = icon(
  <>
    <path d="M3 5h.01" />
    <path d="M3 12h.01" />
    <path d="M3 19h.01" />
    <path d="M8 5h13" />
    <path d="M8 12h13" />
    <path d="M8 19h13" />
  </>,
);

export const ListOrdered = icon(
  <>
    <path d="M11 5h10" />
    <path d="M11 12h10" />
    <path d="M11 19h10" />
    <path d="M4 4h1v5" />
    <path d="M4 9h2" />
    <path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />
  </>,
);

export const Minus = icon(
  <>
    <path d="M5 12h14" />
  </>,
);

export const Omega = icon(
  <>
    <path d="M3 20h4.5a.5.5 0 0 0 .5-.5v-.282a.52.52 0 0 0-.247-.437 8 8 0 1 1 8.494-.001.52.52 0 0 0-.247.438v.282a.5.5 0 0 0 .5.5H21" />
  </>,
);

export const Paintbrush = icon(
  <>
    <path d="m14.622 17.897-10.68-2.913" />
    <path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z" />
    <path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15" />
  </>,
);

export const Plus = icon(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);

export const Redo2 = icon(
  <>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
  </>,
);

export const RemoveFormatting = icon(
  <>
    <path d="M4 7V4h16v3" />
    <path d="M5 20h6" />
    <path d="M13 4 8 20" />
    <path d="m15 15 5 5" />
    <path d="m20 15-5 5" />
  </>,
);

export const Search = icon(
  <>
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </>,
);

export const Subscript = icon(
  <>
    <path d="m4 5 8 8" />
    <path d="m12 5-8 8" />
    <path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07" />
  </>,
);

export const Superscript = icon(
  <>
    <path d="m4 19 8-8" />
    <path d="m12 19-8-8" />
    <path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06" />
  </>,
);

export const Table = icon(
  <>
    <path d="M12 3v18" />
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
  </>,
);

export const TableCellsMerge = icon(
  <>
    <path d="M12 21v-6" />
    <path d="M12 9V3" />
    <path d="M3 15h18" />
    <path d="M3 9h18" />
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </>,
);

export const TableCellsSplit = icon(
  <>
    <path d="M12 15V9" />
    <path d="M3 15h18" />
    <path d="M3 9h18" />
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </>,
);

export const Trash2 = icon(
  <>
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>,
);

export const Type = icon(
  <>
    <path d="M12 4v16" />
    <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
    <path d="M9 20h6" />
  </>,
);

export const Undo2 = icon(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
  </>,
);

export const Upload = icon(
  <>
    <path d="M12 3v12" />
    <path d="m17 8-5-5-5 5" />
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  </>,
);
