"use client";

import { useEffect } from "react";

const MAX_SIDE = 1920;
const QUALITY = 0.82;
const SKIP_BELOW = 700 * 1024; // fotos pequenas seguem como estão

async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < SKIP_BELOW) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/**
 * Reduz fotos do celular (normalmente 3–8 MB) para ~300–600 KB antes do envio:
 * upload mais rápido no canteiro, menos dados móveis e dentro do limite do servidor.
 * Atua em qualquer <input type="file"> de imagens do sistema.
 */
export function ImageCompressor() {
  useEffect(() => {
    const busy = new WeakSet<HTMLInputElement>();
    const onChange = async (e: Event) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.files?.length) return;
      if (!(input.accept ?? "").includes("image") || busy.has(input)) return;
      const original = Array.from(input.files);
      if (!original.some((f) => f.type.startsWith("image/") && f.size >= SKIP_BELOW)) return;
      busy.add(input);
      const form = input.form;
      const submit = form?.querySelector<HTMLButtonElement>("button[type=submit]");
      if (submit) submit.disabled = true;
      try {
        const out = await Promise.all(original.map(compress));
        const dt = new DataTransfer();
        out.forEach((f) => dt.items.add(f));
        input.files = dt.files;
      } finally {
        if (submit) submit.disabled = false;
        busy.delete(input);
      }
    };
    document.addEventListener("change", onChange, true);
    return () => document.removeEventListener("change", onChange, true);
  }, []);
  return null;
}
