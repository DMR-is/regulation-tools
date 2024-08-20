export const base64ToBlob = (
  base64: string,
): { file: File | null; filename: string } => {
  const parts = base64.split(',');
  if (parts.length === 2 && parts[1] && parts[0]) {
    const base64Content = parts[1];
    const mimeString = parts[0].split(':')[1]?.split(';')[0];

    // Validate base64 string length and characters
    if (
      !/^[A-Za-z0-9+/=]*$/.test(base64Content) ||
      base64Content.length % 4 !== 0
    ) {
      console.error('Invalid base64 string');
      return { file: null, filename: '' };
    }

    if (!mimeString || !mimeString.includes('/')) {
      console.error('Invalid MIME type in base64 string');
      return { file: null, filename: '' };
    }

    const byteString = atob(base64Content);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    const fileExtension = mimeString.split('/')[1]; // Extract the file extension from the MIME type
    const name = Date.now() + Math.floor(Math.random() * 1000);
    const filename = `${name}.${fileExtension}`;
    const file = new File([ab], filename, {
      type: mimeString,
    });
    return { file, filename };
  } else {
    console.error('Invalid base64 string');
    return { file: null, filename: '' };
  }
};

export const convertFileToBlobInfo = (file: File, reader?: FileReader): any => {
  // Create a blob info object to pass to the upload handler
  const blobInfo = {
    filename: () => file.name,
    blob: () => file,
    blobUri: () => '',
    base64: reader ? (reader.result as string).split(',')[1] : '',
  };
  return blobInfo;
};
