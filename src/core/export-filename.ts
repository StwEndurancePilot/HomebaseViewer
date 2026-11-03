export function exportFilename(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Enter a file name.');
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name))
    throw new Error('Use a file name without folders or these characters: < > : " / \\ | ? *');
  if (name.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    throw new Error('Choose a different file name. Windows cannot save a file with this name.');
  const filename = /\.sav$/i.test(name) ? name : `${name}.sav`;
  if (filename.length > 255)
    throw new Error('Keep the file name under 256 characters, including .sav.');
  return filename;
}
