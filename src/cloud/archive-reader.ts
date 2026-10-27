const utf8 = new TextDecoder('utf-8', { fatal: true }),
  utf16 = new TextDecoder('utf-16le', { fatal: true });
export class ArchiveReader {
  view: DataView;
  text: string;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.text = new TextDecoder('latin1').decode(bytes);
  }
  string(
    at: number,
    end = this.bytes.length,
  ): {
    value: string;
    next: number;
  } | null {
    if (at < 0 || at + 4 > end) return null;
    const length = this.view.getInt32(at, true),
      count = Math.abs(length) * (length < 0 ? 2 : 1),
      next = at + 4 + count;
    if (
      !length ||
      Math.abs(length) > 8192 ||
      next > end ||
      this.bytes.subarray(next - (length < 0 ? 2 : 1), next).some((v) => v !== 0)
    )
      return null;
    try {
      return {
        value: (length < 0 ? utf16 : utf8).decode(
          this.bytes.subarray(at + 4, next - (length < 0 ? 2 : 1)),
        ),
        next,
      };
    } catch {
      return null;
    }
  }
  guid(at: number, end = this.bytes.length): string | null {
    if (at < 0 || at + 16 > end) return null;
    const value = Array.from({ length: 4 }, (_, i) =>
      this.view
        .getUint32(at + i * 4, true)
        .toString(16)
        .padStart(8, '0'),
    ).join('');
    return /^0+$/.test(value) ? null : value;
  }
  typeName(
    at: number,
    end: number,
    depth = 0,
  ): {
    name: string;
    params: string[];
    next: number;
  } | null {
    if (depth > 8) return null;
    const name = this.string(at, end);
    if (!name || name.next + 4 > end) return null;
    const count = this.view.getInt32(name.next, true);
    if (count < 0 || count > 8) return null;
    let next = name.next + 4;
    const params: string[] = [];
    for (let i = 0; i < count; i++) {
      const child = this.typeName(next, end, depth + 1);
      if (!child) return null;
      params.push(child.name);
      next = child.next;
    }
    return { name: name.value, params, next };
  }
  modernProperty(
    at: number,
    end: number,
  ): {
    type: string;
    subtype: string;
    start: number;
    end: number;
    bool?: boolean;
  } | null {
    const type = this.typeName(at, end);
    if (!type || !type.name.endsWith('Property') || type.next + 5 > end) return null;
    const size = this.view.getInt32(type.next, true),
      flags = this.bytes[type.next + 4];
    let cursor = type.next + 5;
    if (size < 0 || flags & ~0x1f) return null;
    if (flags & 1) {
      if (cursor + 4 > end || this.view.getInt32(cursor, true) !== 0) return null;
      cursor += 4;
    }
    if (flags & 2) cursor += 16;
    if (flags & 4 || cursor + size > end) return null;
    const next = cursor + size,
      following = this.string(next, end);
    if (next !== end && (!following || !/^\w+$/.test(following.value))) return null;
    if (type.name === 'BoolProperty' && size !== 0) return null;
    return {
      type: type.name,
      subtype: type.params[0] ?? '',
      start: cursor,
      end: next,
      bool: type.name === 'BoolProperty' ? !!(flags & 16) : undefined,
    };
  }
  property(
    name: string,
    start: number,
    end: number,
  ): {
    type: string;
    subtype: string;
    start: number;
    end: number;
    bool?: boolean;
  } | null {
    let from = 0;
    const region = this.text.slice(start, end);
    while (from < region.length) {
      const found = region.indexOf(name + '\0', from);
      if (found < 0) return null;
      const at = start + found;
      from = found + name.length;
      const key = this.string(at - 4, end);
      if (key?.value !== name) continue;
      const modern = this.modernProperty(key.next, end);
      if (modern) return modern;
      const type = this.string(key.next, end);
      if (!type || !type.value.endsWith('Property') || type.next + 8 > end) continue;
      const size = this.view.getInt32(type.next, true),
        index = this.view.getInt32(type.next + 4, true);
      if (size < 0 || size > end - start || index !== 0) continue;
      let cursor = type.next + 8,
        subtype = '',
        bool: boolean | undefined;
      if (type.value === 'StructProperty') {
        const sub = this.string(cursor, end);
        if (!sub) continue;
        subtype = sub.value;
        cursor = sub.next + 16;
      } else if (type.value === 'ByteProperty' || type.value === 'ArrayProperty') {
        const sub = this.string(cursor, end);
        if (!sub) continue;
        subtype = sub.value;
        cursor = sub.next;
      } else if (type.value === 'EnumProperty') {
        const sub = this.string(cursor, end);
        if (!sub) continue;
        const inner = this.string(sub.next, end);
        if (!inner) continue;
        subtype = sub.value;
        cursor = inner.next;
      } else if (type.value === 'BoolProperty') {
        if (cursor >= end || this.bytes[cursor] > 1) continue;
        bool = Boolean(this.bytes[cursor++]);
      }
      if (cursor >= end || this.bytes[cursor] > 1) continue;
      const hasGuid = this.bytes[cursor++];
      if (hasGuid) cursor += 16;
      if (cursor + size > end) continue;
      return { type: type.value, subtype, start: cursor, end: cursor + size, bool };
    }
    return null;
  }
}
