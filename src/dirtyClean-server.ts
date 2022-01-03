import { makeDirtyClean } from './_cleanup/makeDirtyClean';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { asDiv, DocumentFragment, E, Node, Text } from './_cleanup/serverDOM';
import { prettify } from './_cleanup/text';
import { HTMLText } from './types';

const _dirtyClean = makeDirtyClean(asDiv, E, Node, Text, DocumentFragment);

const dirtyCleanServer = (html: HTMLText) => prettify(_dirtyClean(html));

export default dirtyCleanServer;
