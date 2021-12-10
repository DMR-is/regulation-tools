import { makeDirtyClean } from './_cleanup/makeDirtyClean';
import E from '@hugsmidjan/qj/E';
import { asDiv } from './utils';

const dirtyClean = makeDirtyClean(asDiv, E, Node, Text, DocumentFragment);

export default dirtyClean;
