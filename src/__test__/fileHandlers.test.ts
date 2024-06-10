import { base64ToBlob } from '../_utils/fileHandlers';

global.File =
  global.File ||
  class File {
    parts: any;
    name: any;
    type: any;
    constructor(parts: any, filename: any, options: { type: any }) {
      this.parts = parts;
      this.name = filename;
      this.type = options.type;
    }
  };

describe('base64ToBlob', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should return a file object for a valid base64 string', () => {
    const base64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
    const result = base64ToBlob(base64);
    expect(result.file).not.toBeNull();
    if (result.file) {
      expect(result.file.name).toMatch(/^\d+\.png$/);
      expect(result.file.type).toBe('image/png');
    }
  });

  it('should handle base64 strings with no comma', () => {
    const base64 = 'data:image/png;base64';
    const result = base64ToBlob(base64);
    expect(result.file).toBeNull();
    expect(result.filename).toBe('');
  });

  it('should handle invalid base64 strings', () => {
    const base64 = 'data:image/png;base64,invalidbase64string';
    const result = base64ToBlob(base64);
    expect(result.file).toBeNull();
    expect(result.filename).toBe('');
  });

  it('should handle base64 strings with an invalid MIME type', () => {
    const base64 =
      'data:imagepng;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
    const result = base64ToBlob(base64);
    expect(result.file).toBeNull();
    expect(result.filename).toBe('');
  });

  it('should handle MIME type without a slash', () => {
    const base64 =
      'data:image;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
    const result = base64ToBlob(base64);
    expect(result.file).toBeNull();
    expect(result.filename).toBe('');
  });

  it('should handle empty base64 strings', () => {
    const base64 = '';
    const result = base64ToBlob(base64);
    expect(result.file).toBeNull();
    expect(result.filename).toBe('');
  });

  it('should handle base64 strings without MIME type', () => {
    const base64 =
      'data:;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
    const result = base64ToBlob(base64);
    expect(result.file).toBeNull();
    expect(result.filename).toBe('');
  });

  it('should handle base64 strings without file extension', () => {
    const base64 =
      'data:application/octet-stream;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
    const result = base64ToBlob(base64);
    expect(result.file).not.toBeNull();
    if (result.file) {
      expect(result.file.name).toMatch(/^\d+\.octet-stream$/);
      expect(result.file.type).toBe('application/octet-stream');
    }
  });
});
