export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

export const generateId = createId;
