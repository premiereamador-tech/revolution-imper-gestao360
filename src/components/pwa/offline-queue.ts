"use client";

/**
 * Fila offline (§61) em IndexedDB. Cada envio guarda o nome da ação e os campos
 * (inclusive fotos como Blob). Ao voltar a internet, reenvia em ordem.
 * Todo registro carrega um clientUuid: o servidor ignora reenvios duplicados.
 */
const DB_NAME = "ri360-offline";
const STORE = "queue";

export interface QueuedItem {
  id?: number;
  action: string;
  label: string;
  fields: Array<[string, string | Blob, string?]>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function formDataToFields(fd: FormData): QueuedItem["fields"] {
  const out: QueuedItem["fields"] = [];
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out.push([k, v]);
    else if (v.size > 0) out.push([k, v, v.name]);
  }
  return out;
}

export function fieldsToFormData(fields: QueuedItem["fields"]): FormData {
  const fd = new FormData();
  for (const [k, v, name] of fields) {
    if (typeof v === "string") fd.append(k, v);
    else fd.append(k, v, name ?? "arquivo");
  }
  return fd;
}

export const enqueue = (item: Omit<QueuedItem, "id" | "createdAt" | "attempts">) => tx("readwrite", (s) => s.add({ ...item, createdAt: Date.now(), attempts: 0 }));
export const listQueue = () => tx<QueuedItem[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedItem[]>);
export const removeQueued = (id: number) => tx("readwrite", (s) => s.delete(id));
export const updateQueued = (item: QueuedItem) => tx("readwrite", (s) => s.put(item));
