/*
 * Values that lesson data or a message from another context may hold where
 * code expects a name or a record. Turning the last two into text throws,
 * and reading the getter throws. Nothing outside tests imports it.
 */

function throwingGetter(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  Object.defineProperty(value, "name", { enumerable: true, get: () => { throw new Error("getter"); } });
  return value;
}

export function hostileValues(): [string, unknown][] {
  return [
    ["null", null],
    ["undefined", undefined],
    ["a number", 7],
    ["an array", ["a"]],
    ["an object whose toString is not a function", JSON.parse('{"toString": 1}')],
    ["an object with a throwing getter", throwingGetter()],
  ];
}

// A copy of a record whose field throws when it is read.
export function withThrowingField<T extends object>(record: T, field: string): T {
  const copy = { ...record };
  Object.defineProperty(copy, field, { enumerable: true, get: () => { throw new Error("getter"); } });
  return copy;
}
