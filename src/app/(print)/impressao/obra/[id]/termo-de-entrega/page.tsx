import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocHeader, DocSection, Signature } from "@/components/domain/doc-header";
import { formatDocument } from "@/domain/br";
import { area, date } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { projectAreasWithApps, projectCore, projectWarranty } from "@/server/services/project-detail";

export const metadata: Metadata = { title: "Termo de entrega" };

export default async function TermoEntrega({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("projects:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const core = await projectCore(user.companyId, id);
  if (!core) notFound();
  const [w, areas] = await Promise.all([projectWarranty(id), projectAreasWithApps(id)]);
  const term = w.terms[0];
  const p = core.p;
  return (
    <>
      <DocHeader title="Termo de entrega de obra" subtitle={`${p.code} | ${term ? `entregue em ${date(term.deliveredAt)}` : "aguardando entrega"}`} />
      <DocSection title="Partes">
        <p>
          <strong>Contratada:</strong> Revolution Imper Impermeabilizações.
        </p>
        <p>
          <strong>Contratante:</strong> {core.client.name}, {formatDocument(core.client.document)}.
        </p>
        <p>
          <strong>Obra:</strong> {p.name}, {[p.address, p.city, p.state].filter(Boolean).join(", ")}.
        </p>
      </DocSection>
      <DocSection title="Serviços entregues">
        <ul className="list-disc pl-5">
          {areas.map((a) => (
            <li key={a.id}>
              {a.name}: {area(a.executedArea)}, sistema {a.applications.map((x) => x.systemName).join(", ") || "—"}.
            </li>
          ))}
        </ul>
      </DocSection>
      <DocSection title="Declaração">
        <p>
          O contratante declara ter recebido os serviços acima descritos, executados conforme a proposta e o contrato {core.contract?.number ?? ""}, após vistoria conjunta e
          testes registrados no relatório final da obra. A garantia de {p.warrantyMonths ?? 60} meses passa a contar a partir da data desta entrega, condicionada ao uso
          adequado e às manutenções previstas no manual entregue ao cliente.
        </p>
        {term?.notes && <p className="mt-2">Observações: {term.notes}</p>}
      </DocSection>
      <p className="mt-6">{p.city ?? "Campinas"}, {date(term?.deliveredAt ?? new Date())}.</p>
      <div className="mt-4 grid grid-cols-2 gap-8">
        <Signature label="Revolution Imper" name={term?.companySignerName} />
        <Signature label="Contratante" name={term?.clientSignerName} />
      </div>
    </>
  );
}
