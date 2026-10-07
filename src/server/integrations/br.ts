import "server-only";
import { env } from "@/server/env";

/**
 * Adaptadores de serviços brasileiros (§62). Cada integração tem uma interface
 * e um modo "mock", trocado por variável de ambiente — nada fica amarrado a um fornecedor.
 *
 * Prontos: CEP (ViaCEP).
 * Preparados (interfaces): CNPJ, NFS-e/NF-e, cobrança PIX/boleto — implemente o adaptador
 * do provedor contratado (ex.: banco, gateway, prefeitura) e registre-o abaixo.
 */
export interface Address {
  zipCode: string;
  street?: string;
  district?: string;
  city?: string;
  state?: string;
}

export async function lookupCep(raw: string): Promise<Address | null> {
  const cep = raw.replace(/\D/g, "");
  if (cep.length !== 8) return null;
  if (env.CEP_PROVIDER === "mock") return { zipCode: cep, street: "Rua Exemplo", district: "Centro", city: "Campinas", state: "SP" };
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } });
    if (!r.ok) return null;
    const d = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (d.erro) return null;
    return { zipCode: cep, street: d.logradouro, district: d.bairro, city: d.localidade, state: d.uf };
  } catch {
    return null;
  }
}

export interface CompanyLookup {
  cnpj: string;
  legalName: string;
  tradeName?: string;
  address?: Address;
}
export interface CnpjProvider {
  lookup(cnpj: string): Promise<CompanyLookup | null>;
}

export interface InvoiceIssuer {
  /** Emite NFS-e/NF-e e devolve número + XML/PDF do provedor. */
  issue(input: { clientDocument: string; value: number; description: string; serviceCode?: string }): Promise<{ number: string; pdfUrl?: string; raw: unknown }>;
}

export interface ChargeProvider {
  /** Gera cobrança PIX (copia e cola/QR) ou boleto para um título a receber. */
  createCharge(input: { receivableId: string; amount: number; dueDate: string; payerDocument: string; payerName: string; method: "pix" | "boleto" }): Promise<{ externalId: string; pixCopyPaste?: string; boletoUrl?: string }>;
}

/** Modo mock: permite testar o fluxo de cobrança sem credenciais. */
export const mockChargeProvider: ChargeProvider = {
  async createCharge(input) {
    return { externalId: `mock-${input.receivableId.slice(0, 8)}`, pixCopyPaste: `00020126MOCK${Math.round(input.amount * 100)}5204000053039865802BR` };
  },
};
