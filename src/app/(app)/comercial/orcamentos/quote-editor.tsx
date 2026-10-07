"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveQuoteAction } from "../actions";
import { ActionForm, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

interface Item {
  key: number;
  service: string;
  description: string;
  unit: string;
  quantity: string;
  materialUnitCost: string;
  laborUnitCost: string;
  unitPrice: string;
  systemId: string;
}

const num = (v: string) => {
  const s = v.replace(/[R$\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export interface QuoteEditorProps {
  initial?: {
    id: string;
    clientId: string;
    leadId: string | null;
    visitId: string | null;
    title: string;
    siteAddress: string | null;
    siteCity: string | null;
    siteState: string | null;
    validUntil: string | null;
    discount: number;
    taxRate: number;
    paymentTerms: string | null;
    executionDays: number | null;
    warrantyMonths: number | null;
    notes: string | null;
    items: Array<{ service: string; description: string | null; unit: string; quantity: number; materialUnitCost: number; laborUnitCost: number; unitPrice: number; systemId: string | null }>;
  };
  defaults: { clientId?: string; leadId?: string; visitId?: string; title?: string; siteAddress?: string; area?: number; description?: string; validUntil: string };
  clients: Array<{ value: string; label: string }>;
  systems: Array<{ value: string; label: string }>;
}

/** Gerador de orçamento (§24): itens, custos, preço, desconto, impostos e margem em tempo real. */
export function QuoteEditor({ initial, defaults, clients, systems }: QuoteEditorProps) {
  const [items, setItems] = useState<Item[]>(() =>
    initial?.items.length
      ? initial.items.map((i, key) => ({ key, service: i.service, description: i.description ?? "", unit: i.unit, quantity: fmt(i.quantity), materialUnitCost: fmt(i.materialUnitCost), laborUnitCost: fmt(i.laborUnitCost), unitPrice: fmt(i.unitPrice), systemId: i.systemId ?? "" }))
      : [{ key: 0, service: "", description: defaults.description ?? "", unit: "m²", quantity: defaults.area ? fmt(defaults.area) : "", materialUnitCost: "", laborUnitCost: "", unitPrice: "", systemId: "" }],
  );
  const [discount, setDiscount] = useState(fmt(initial?.discount ?? 0));
  const [taxRate, setTaxRate] = useState(fmt(initial?.taxRate ?? 6));

  const totals = useMemo(() => {
    const lines = items.map((i) => {
      const q = num(i.quantity);
      const total = q * num(i.unitPrice);
      const cost = q * (num(i.materialUnitCost) + num(i.laborUnitCost));
      return { total, cost };
    });
    const gross = lines.reduce((s, l) => s + l.total, 0);
    const total = gross - num(discount);
    const taxes = (total * num(taxRate)) / 100;
    const cost = lines.reduce((s, l) => s + l.cost, 0);
    return { lines, gross, total, taxes, cost, profit: total - taxes - cost, margin: total ? ((total - taxes - cost) / total) * 100 : 0 };
  }, [items, discount, taxRate]);

  const update = (key: number, field: keyof Item, value: string) => setItems((list) => list.map((i) => (i.key === key ? { ...i, [field]: value } : i)));

  return (
    <ActionForm action={saveQuoteAction} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {(initial?.leadId ?? defaults.leadId) && <input type="hidden" name="leadId" value={initial?.leadId ?? defaults.leadId} />}
      {(initial?.visitId ?? defaults.visitId) && <input type="hidden" name="visitId" value={initial?.visitId ?? defaults.visitId} />}
      <Card>
        <CardHeader title="Proposta" />
        <CardBody className="grid gap-4 md:grid-cols-4">
          <Input name="title" label="Título da proposta" defaultValue={initial?.title ?? defaults.title} required wrapClassName="md:col-span-2" />
          <Select name="clientId" label="Cliente" required placeholder="Selecione" defaultValue={initial?.clientId ?? defaults.clientId} options={clients} />
          <Input name="validUntil" type="date" label="Validade da proposta" defaultValue={initial?.validUntil ?? defaults.validUntil} />
          <Input name="siteAddress" label="Endereço da obra" defaultValue={initial?.siteAddress ?? defaults.siteAddress ?? ""} wrapClassName="md:col-span-2" />
          <Input name="siteCity" label="Cidade" defaultValue={initial?.siteCity ?? ""} />
          <Input name="siteState" label="UF" defaultValue={initial?.siteState ?? "SP"} maxLength={2} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Itens" description="Custo de material e mão de obra são internos: não aparecem no PDF do cliente." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-surface-2 text-[12px] text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Serviço / descrição</th>
                <th className="w-44 px-3 py-2 text-left font-medium">Sistema</th>
                <th className="w-20 px-3 py-2 text-left font-medium">Un.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Qtd.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Material/un.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Mão de obra/un.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Preço/un.</th>
                <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => {
                const line = totals.lines[idx];
                const lineMargin = line.total ? ((line.total - line.cost) / line.total) * 100 : null;
                const cell = "h-9 w-full rounded-md border border-border px-2 text-sm";
                return (
                  <tr key={i.key} className="border-t border-border align-top">
                    <td className="space-y-1.5 px-3 py-2">
                      <input name={`items.${idx}.service`} value={i.service} onChange={(e) => update(i.key, "service", e.target.value)} placeholder="Ex.: Impermeabilização de laje com manta asfáltica" className={cell} aria-label="Serviço" />
                      <textarea name={`items.${idx}.description`} value={i.description} onChange={(e) => update(i.key, "description", e.target.value)} placeholder="Descrição técnica para o cliente" rows={2} className="w-full rounded-md border border-border px-2 py-1 text-[13px]" aria-label="Descrição" />
                    </td>
                    <td className="px-3 py-2">
                      <select name={`items.${idx}.systemId`} value={i.systemId} onChange={(e) => update(i.key, "systemId", e.target.value)} className={cell} aria-label="Sistema">
                        <option value="">—</option>
                        {systems.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select name={`items.${idx}.unit`} value={i.unit} onChange={(e) => update(i.key, "unit", e.target.value)} className={cell} aria-label="Unidade">
                        {["m²", "m", "un", "vb", "kg", "L"].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    {(["quantity", "materialUnitCost", "laborUnitCost", "unitPrice"] as const).map((f) => (
                      <td key={f} className="px-3 py-2">
                        <input name={`items.${idx}.${f}`} value={i[f]} onChange={(e) => update(i.key, f, e.target.value)} inputMode="decimal" className={cn(cell, "text-right tabular")} aria-label={f} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular">
                      <p className="pt-2 font-medium">{brl(line.total)}</p>
                      {lineMargin !== null && <p className={cn("text-[11px]", lineMargin < 25 ? "text-danger" : "text-muted")}>margem bruta {lineMargin.toFixed(0)}%</p>}
                    </td>
                    <td className="px-1 py-2">
                      {items.length > 1 && (
                        <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="mt-1.5 rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remover item">
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setItems((l) => [...l, { key: Math.max(...l.map((x) => x.key)) + 1, service: "", description: "", unit: "m²", quantity: "", materialUnitCost: "", laborUnitCost: "", unitPrice: "", systemId: "" }])}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Plus className="size-4" /> Adicionar item
          </button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Condições" />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Input name="executionDays" type="number" min={1} label="Prazo de execução (dias)" defaultValue={initial?.executionDays ?? 30} />
            <Input name="warrantyMonths" type="number" min={0} label="Garantia (meses)" defaultValue={initial?.warrantyMonths ?? 60} />
            <Textarea name="paymentTerms" label="Forma de pagamento" defaultValue={initial?.paymentTerms ?? "Entrada de 30% + saldo em medições mensais"} wrapClassName="md:col-span-2" rows={2} />
            <Textarea name="notes" label="Observações da proposta" defaultValue={initial?.notes ?? ""} wrapClassName="md:col-span-2" rows={3} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Resumo" />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput name="discount" label="Desconto (R$)" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <Input name="taxRate" label="Impostos (%)" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="text-right" />
            </div>
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={brl(totals.gross)} />
              <Row label="Desconto" value={`− ${brl(num(discount))}`} />
              <Row label="Valor da proposta" value={brl(totals.total)} strong />
              <Row label="Impostos" value={brl(totals.taxes)} muted />
              <Row label="Custo direto previsto" value={brl(totals.cost)} muted />
              <Row label="Lucro previsto" value={brl(totals.profit)} muted />
            </dl>
            <p className={cn("font-display text-3xl font-semibold tabular", totals.margin < 20 ? "text-danger" : "text-success")}>Margem {totals.margin.toFixed(1)}%</p>
            <SubmitButton className="w-full" size="lg">
              {initial ? "Salvar orçamento" : "Criar orçamento"}
            </SubmitButton>
          </CardBody>
        </Card>
      </div>
    </ActionForm>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-border pt-1.5 font-semibold", muted && "text-muted")}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
