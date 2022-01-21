// FIXME: Move this logic into the api-server, where it belongs,
// and thus make the ENV variable resolution simpler

import qq from '@hugsmidjan/qj/qq';

import { asDiv } from './_cleanup/serverDOM';
import { HTMLText, RegName } from './types';

const { FILE_UPLOAD_KEY_PUBLISH, REGULATIONS_API_URL } = process.env;

type SourcesMap = Array<{ oldUrl: string; newUrl: string }>;

export const replaceImageUrls = async (html: HTMLText, regName: RegName) => {
  if (!REGULATIONS_API_URL || !FILE_UPLOAD_KEY_PUBLISH) {
    throw new Error(
      'REGULATIONS_API_URL and/or FILE_UPLOAD_KEY_PUBLISH not configured',
    );
  }

  const root = asDiv(html);

  try {
    const urls: Array<string> = [];

    qq('img', root).forEach((img) => {
      const src = img.getAttribute('src');
      src && urls.push(src);
    });

    const sourcesMap: SourcesMap = await fetch(
      REGULATIONS_API_URL + '/file-upload-urls',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-APIKey': FILE_UPLOAD_KEY_PUBLISH,
        },
        body: JSON.stringify({ urls, regName }),
      },
    ).then((res) => res.json());

    sourcesMap.forEach((src) => {
      qq(`img[src="${src.oldUrl}"]`, root).forEach((img) => {
        img.setAttribute('src', src.newUrl);
      });
      qq(`a[href="${src.oldUrl}"]`, root).forEach((img) => {
        img.setAttribute('href', src.newUrl);
      });
    });
  } catch (e) {
    console.error('Error replacing image urls: ' + e);
  }

  return root.innerHTML as HTMLText;
};
