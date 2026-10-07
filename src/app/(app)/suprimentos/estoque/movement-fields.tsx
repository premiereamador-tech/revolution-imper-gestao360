"use client";

import { useState } from "react";
import { Input, MoneyInput, Select, Textarea } from "@/components/ui/form";

interface Opt {
  value: string;
  label: string;
}

/** Campos do movimento de estoque que mudam conforme o tipo (entrada, transferência…). */
export function MovementFields({
  products,
  batches,
  warehouses,
  suppliers,
  today,
}: {
  products: Array<Opt & { unit: string; cost: number }>;
  batches: Array<{ id: string; productId: string; label: string }>;
  warehouses: Opt[];
  suppliers: Opt[];
  today: string;
}) {
  const [type, setType] = useState("entrada");
  const [productId, setProductId] = useState("");
  const product = products.find((p) => p.value === productId);
  const productBatches = batches.filter((b) => b.productId === productId).map((b) => ({ value: b.id, label: b.label }));
  const needsFrom = ["saida", "transferencia", "devolucao", "perda"].includes(type);
  const needsTo = ["entrada", "transferencia", "devolucao", "ajuste"].includes(type);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Select
          name="type"
          label="Tipo de movimento"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: "entrada", label: "Entrada (compra/recebimento)" },
            { value: "transferencia", label: "Transferência (central → obra/veículo)" },
            { value: "devolucao", label: "Devolução (obra → central)" },
            { value: "saida", label: "Saída avulsa" },
            { value: "perda", label: "Perda / avaria" },
            { value: "ajuste", label: "Ajuste de inventário (+/−)" },
          ]}
        />
        <Select name="productId" label="Produto" required placeholder="Selecione" value={productId} onChange={(e) => setProductId(e.target.value)} options={products} />
      </div>
      {type === "entrada" ? (
        <div className="grid grid-cols-3 gap-3">
          <Input name="newBatchNumber" label="Lote" placeholder="Nº do lote" />
          <Input name="expiresAt" type="date" label="Validade" />
          <Select name="supplierId" label="Fornecedor" placeholder="—" options={suppliers} />
        </div>
      ) : (
        <Select name="batchId" label="Lote" placeholder={productBatches.length ? "Selecione o lote" : "Sem lote"} options={productBatches} />
      )}
      <div className="grid grid-cols-2 gap-3">
        {needsFrom && <Select name="fromWarehouseId" label="De (origem)" required placeholder="Selecione" options={warehouses} />}
        {needsTo && <Select name="toWarehouseId" label={type === "ajuste" ? "Estoque ajustado" : "Para (destino)"} required placeholder="Selecione" options={warehouses} />}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input name="quantity" label={`Quantidade${product ? ` (${product.unit})` : ""}`} inputMode="decimal" required hint={type === "ajuste" ? "Use negativo para baixar" : undefined} />
        {type === "entrada" && <MoneyInput name="unitCost" label="Custo unitário" defaultValue={product ? String(product.cost).replace(".", ",") : ""} hint="Atualiza o custo médio" />}
        <Input name="date" type="date" label="Data" defaultValue={today} max={today} />
      </div>
      <Textarea name="notes" label="Observação" rows={2} />
    </div>
  );
}
