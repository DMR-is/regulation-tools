import React, { useState } from 'react';
import { Angsts, WarningList } from './useTextWarnings';
import { getTexts } from './utils';
import { useOnUpdate } from '@hugsmidjan/react/hooks';

const t = getTexts({
  title: 'Gátlisti:',
  find: 'sjá',
  more: 'og {n} í viðbót...',
});

export type TextWarningsClasses = {
  warnings: string;
  warnings__legend: string;
  warnings__list: string;
  warnings__item: string;
  warnings__item_high: string;
  warnings__item_medium: string;
  warnings__item_low: string;
  warnings__viewToggler: string;
  warnings__instancelist: string;
  warnings__instance: string;
  warnings__instance__button: string;
  warnings__instancelist__morecount: string;
};

const angstClasses: Record<keyof typeof Angsts, keyof TextWarningsClasses> = {
  high: 'warnings__item_high',
  medium: 'warnings__item_medium',
  low: 'warnings__item_low',
};

// ---------------------------------------------------------------------------

type ItemProps = WarningList[0] & {
  contentRoot: HTMLElement;
  classes: TextWarningsClasses;
};

const MAX_INSTANCES = 25;

const TextWarnings__item = (props: ItemProps) => {
  const s = props.classes;
  const { warning, angst = Angsts.medium, find, contentRoot } = props;
  const [instances, setInstances] = useState<Array<Element>>();

  const notToggled = instances?.length == null;
  let overflow = (instances ? instances.length : 0) - MAX_INSTANCES;
  if (overflow < 0) {
    overflow = 0;
  }

  const show = (elm: Element) => {
    setInstances(undefined);
    elm.scrollIntoView({ block: 'center' });
    elm.setAttribute('data-highighted', '');
    setTimeout(() => {
      elm.removeAttribute('data-highighted');
    }, 1000);
  };

  return (
    <li className={s.warnings__item + ' ' + angstClasses[angst]}>
      {warning}{' '}
      {find && notToggled && (
        <button
          className={s.warnings__viewToggler}
          type="button"
          onClick={() => {
            const elms = find(contentRoot) || [];
            if (elms.length === 1) {
              show(elms[0]);
            } else {
              setInstances(elms);
            }
          }}
        >
          {t('find')}
        </button>
      )}
      {instances && instances.length > 0 && (
        <ul className={s.warnings__instancelist}>
          {instances.slice(0, MAX_INSTANCES).map((elm, i) => (
            <li key={i} className={s.warnings__instance}>
              <button
                className={s.warnings__instance__button}
                onClick={() => show(elm)}
              >
                {i + 1}
              </button>
            </li>
          ))}
          {overflow > 0 && (
            <li className={s.warnings__instancelist__morecount}>
              {t('more', overflow)}
            </li>
          )}
        </ul>
      )}
    </li>
  );
};

// ---------------------------------------------------------------------------

export type TextWarningsProps = {
  warnings: WarningList;
  contentRoot?: HTMLElement;
  classes: TextWarningsClasses;
};

export const TextWarnings = (props: TextWarningsProps) => {
  const { warnings, contentRoot } = props;
  const s = props.classes;
  const [key, setKey] = useState(1);
  useOnUpdate(() => {
    setKey((key) => key + 1);
  }, [warnings]);

  return !contentRoot || !warnings.length ? null : (
    <div key={key} className={s.warnings}>
      <h2 className={s.warnings__legend}>{t('title')}</h2>
      <ul className={s.warnings__list}>
        {warnings.map(({ warning, angst, find }, i) => (
          <TextWarnings__item
            key={i}
            warning={warning}
            angst={angst}
            find={find}
            contentRoot={contentRoot}
            classes={s}
          />
        ))}
      </ul>
    </div>
  );
};
