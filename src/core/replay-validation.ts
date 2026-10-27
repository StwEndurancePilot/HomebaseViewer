import { decodeNumber } from './save';
const unescape = (text: string) =>
  text
    .replaceAll('%7C', '|')
    .replaceAll('%0A', '\n')
    .replaceAll('%0D', '\r')
    .replaceAll('%25', '%');
export function validateReplayRows(rows: string[]): void {
  const trapTypes = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const fail = (reason: string): never => {
      throw new Error(`Replay row ${index + 1}: ${reason}`);
    };
    const fields = row.split('|');
    if (fields.length !== 17) fail('expected 17 fields.');
    if (fields[0] !== 'placement') continue;
    for (const field of [11, 12]) {
      const text = unescape(fields[field]);
      let stripped = text;
      for (const token of ['{', '}', '[', ']', '"translation":', '"rotation":', '"scale":', '"'])
        stripped = stripped.replaceAll(token, '');
      const numbers = stripped.split(',');
      if (numbers.length !== 10) fail('invalid pose layout.');
      const decoded = numbers.map((value) => {
        if (value.startsWith('binary64:')) return decodeNumber(value);
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))
          fail(`unsupported runtime number ${value}.`);
        return Number(value);
      });
      const pose = JSON.parse(text),
        expected = [...pose.translation, ...pose.rotation, ...pose.scale].map(decodeNumber);
      if (expected.length !== 10 || expected.some((value, i) => value !== decoded[i]))
        fail('pose components are out of order.');
    }
    if (fields[1] === 'trap') {
      const path = unescape(fields[4] || fields[3]);
      trapTypes.add(path.split('.').at(-1)!.toLowerCase());
      if (trapTypes.size > 64) fail('the menu supports at most 64 distinct trap definitions.');
    } else if (!/^[012]$/.test(fields[9])) fail('invalid building material.');
  }
}
