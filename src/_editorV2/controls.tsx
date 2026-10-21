/*
  The controls the toolbar and the table bar are made of: a button, a
  dropdown and the items in its menu. Each keeps the editor's selection
  while clicked.
*/

import React, { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const ICON_SIZE = 18;

export const Button = (props: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={
      'regtools-toolbar__button' +
      (props.active ? ' regtools-toolbar__button--active' : '')
    }
    title={props.label}
    aria-label={props.label}
    aria-pressed={props.active}
    disabled={props.disabled}
    // Keeps the editor's selection while clicking.
    onMouseDown={(e) => e.preventDefault()}
    onClick={props.onClick}
  >
    {props.icon}
  </button>
);

/**
 * A button showing a list of buttons below it (the disclosure pattern: plain
 * buttons, reached with Tab). Escape closes it and returns focus to the
 * button; so does moving focus or clicking elsewhere.
 */
export const Dropdown = (props: {
  label: string;
  /** Left out, the trigger is only a chevron, beside a button it belongs to. */
  icon?: ReactNode;
  /** Opens the menu towards the left, for a dropdown near the right edge. */
  alignEnd?: boolean;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => {
    props.disabled && setOpen(false);
  }, [props.disabled]);
  return (
    <div
      className="regtools-toolbar__dropdown"
      ref={ref}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (open && !ref.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={
          'regtools-toolbar__button' +
          (props.active ? ' regtools-toolbar__button--active' : '') +
          (props.icon ? '' : ' regtools-toolbar__button--chevron')
        }
        title={props.label}
        aria-label={props.label}
        aria-expanded={open}
        aria-controls={id}
        disabled={props.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        {props.icon}
        <ChevronDown
          size={14}
          className="regtools-toolbar__chevron"
          aria-hidden
        />
      </button>
      {open && (
        <div
          id={id}
          className={
            'regtools-toolbar__menu' +
            (props.alignEnd ? ' regtools-toolbar__menu--end' : '')
          }
          onClick={(e) => {
            // A dropdown inside this menu (in the toolbar's "more" menu)
            // opening its own menu leaves this one open.
            const target = e.target as Element;
            if (!target.closest('.regtools-toolbar__menu [aria-expanded]')) {
              setOpen(false);
            }
          }}
        >
          {props.children}
        </div>
      )}
    </div>
  );
};

/** A choice in a dropdown. `active` (a state, like the current format) is
 * announced with `aria-pressed`; actions leave it out. */
export const MenuItem = (props: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  /** An action that removes something. */
  danger?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={
      'regtools-toolbar__menuitem' +
      (props.active ? ' regtools-toolbar__menuitem--active' : '') +
      (props.danger ? ' regtools-toolbar__menuitem--danger' : '')
    }
    aria-pressed={props.active}
    disabled={props.disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={props.onClick}
  >
    {props.label}
  </button>
);

/** A heading over a group of items in a menu. */
export const MenuHeading = (props: { children: ReactNode }) => (
  <span className="regtools-toolbar__menuheading" aria-hidden>
    {props.children}
  </span>
);
