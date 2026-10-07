"use client";

import { useState } from "react";
import { Input } from "@/components/ui/form";

/**
 * Campo CEP que preenche endereço/cidade/UF pela API interna /api/cep
 * (adaptador ViaCEP configurável). Funciona como campo comum se o serviço falhar.
 */
export function CepAutofill({ name = "zipCode", defaultValue }: { name?: string; defaultValue?: string }) {
  const [status, setStatus] = useState<string | undefined>();
  async function lookup(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setStatus("Buscando endereço…");
    try {
      const r = await fetch(`/api/cep/${cep}`);
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { street?: string; district?: string; city?: string; state?: string };
      const form = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.form;
      const set = (field: string, v?: string) => {
        const el = form?.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement | null;
        if (el && v && !el.value) el.value = v;
        if (el && v && el instanceof HTMLSelectElement) el.value = v;
      };
      set("address", [d.street, d.district].filter(Boolean).join(", "));
      set("street", d.street);
      set("district", d.district);
      set("city", d.city);
      set("state", d.state);
      setStatus(undefined);
    } catch {
      setStatus("CEP não encontrado. Preencha manualmente.");
    }
  }
  return <Input name={name} label="CEP" inputMode="numeric" placeholder="00000-000" maxLength={9} defaultValue={defaultValue} hint={status} onBlur={(e) => lookup(e.target.value)} />;
}
