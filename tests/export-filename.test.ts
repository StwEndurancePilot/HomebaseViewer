import { expect, it } from 'vitest';
import { exportFilename } from '../src/core/export-filename';

it('preserves custom names and Unicode and adds the sav extension only when needed', () => {
  expect(exportFilename(' My Twine base ')).toBe('My Twine base.sav');
  expect(exportFilename('城 🏠.sav')).toBe('城 🏠.sav');
  expect(exportFilename('Base.SAV')).toBe('Base.SAV');
});

it('rejects empty, reserved, path-like and overlong filenames', () => {
  for (const name of [
    '',
    '  ',
    '../base',
    'C:\\base.sav',
    'base?',
    'base.',
    'CON',
    'NUL.sav',
    'lpt1.backup.sav',
    'a'.repeat(252),
  ])
    expect(() => exportFilename(name), name).toThrow();
  expect(exportFilename('a'.repeat(251))).toHaveLength(255);
  expect(exportFilename('console')).toBe('console.sav');
});
