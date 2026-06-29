const SIGNATURES: Array<{ mime: RegExp; bytes: number[]; offset?: number }> = [
  { mime: /^image\/jpe?g$/i, bytes: [0xff, 0xd8, 0xff] },
  { mime: /^image\/png$/i, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: /^image\/gif$/i, bytes: [0x47, 0x49, 0x46] },
  { mime: /^image\/webp$/i, bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: /^video\/mp4$/i, bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: /^video\/webm$/i, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: /^video\/quicktime$/i, bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: /^video\/x-msvideo$/i, bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: /^video\/ogg$/i, bytes: [0x4f, 0x67, 0x67, 0x53] },
];

export const validateFileBuffer = (buffer: Buffer, mimeType: string): boolean => {
  if (!buffer?.length) return false;

  const match = SIGNATURES.find((entry) => entry.mime.test(mimeType));
  if (!match) return false;

  const offset = match.offset ?? 0;
  if (buffer.length < offset + match.bytes.length) return false;

  return match.bytes.every((byte, index) => buffer[offset + index] === byte);
};
