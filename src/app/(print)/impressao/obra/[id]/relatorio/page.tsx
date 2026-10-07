import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DocHeader, DocSection, Signature } from "@/components/domain/doc-header";
import { formatDocument } from "@/domain/br";
import { area, date, dateTime, number } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { productBatches, products, stockMovements } from "@/server/db/schema";
import { projectAreasWithApps, projectCore, projectPhotoList, projectQuality, projectTeam, projectWarranty } from "@/server/services/project-detail";
import { loadProjectSummary } from "@/server/services/project-summary";

export const metadata: Metadata = { title: "Relatório da obra" };

/** Relatório final da obra (§46): técnico, sem custos internos (pode ser entregue ao cliente). */
export default async function RelatorioObra({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [core, summary] = await Promise.all([projectCore(user.companyId, id), loadProjectSummary(user.companyId, id)]);
  if (!core || !summary) notFound();
  // Equipe interna vê qualquer obra; cliente do portal só a própria
  const allowed = user.permissions.has("projects:view") || (user.permissions.has("portal:view") && user.clientId === core.p.clientId);
  if (!allowed) notFound();
  const [areas, photos, quality, team, warranty, lots] = await Promise.all([
    projectAreasWithApps(id),
    projectPhotoList(id),
    projectQuality(id),
    projectTeam(id),
    projectWarranty(id),
    db
      .selectDistinct({ product: products.name, manufacturer: products.manufacturer, batch: productBatches.batchNumber, expiresAt: productBatches.expiresAt })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(productBatches, eq(productBatches.id, stockMovements.batchId))
      .where(and(eq(stockMovements.projectId, id), inArray(stockMovements.type, ["consumo"])))
      .orderBy(asc(products.name)),
  ]);
  const p = core.p;
  const src = (ph: { url: string | null; fileId: string | null }) => (ph.fileId ? `/api/files/${ph.fileId}` : (ph.url ?? ""));
  const stagePhotos = (stage: string) => photos.filter((x) => x.ph.stage === stage).slice(0, 4);

  return (
    <>
      <DocHeader title="Relatório final da obra" subtitle={`${p.code} | emitido em ${date(new Date())}`} />
      <DocSection title="Identificação">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <p><span className="text-muted">Cliente:</span> {core.client.name} ({formatDocument(core.client.document)})</p>
          <p><span className="text-muted">Obra:</span> {p.name}</p>
          <p><span className="text-muted">Endereço:</span> {[p.address, p.city, p.state].filter(Boolean).join(", ")}</p>
          <p><span className="text-muted">Responsável técnico:</span> {core.engineer ?? "—"}</p>
          <p><span className="text-muted">Início:</span> {date(p.actualStart ?? p.plannedStart)}</p>
          <p><span className="text-muted">Término:</span> {date(p.actualEnd ?? summary.forecast.forecastEnd)}</p>
          <p><span className="text-muted">Área executada:</span> {area(summary.executedArea)} de {area(summary.contractedArea)}</p>
          <p><span className="text-muted">Equipe:</span> {team.assignments.map((a) => a.teamName).join(", ") || "Equipe parceira"}</p>
        </div>
      </DocSection>
      <DocSection title="Serviços executados e sistemas utilizados">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-1 font-medium">Área</th>
              <th className="py-1 font-medium">Sistema</th>
              <th className="py-1 font-medium">Produto</th>
              <th className="py-1 text-right font-medium">Demãos</th>
              <th className="py-1 text-right font-medium">Executado</th>
            </tr>
          </thead>
          <tbody>
            {areas.flatMap((a) =>
              (a.applications.length ? a.applications : [null]).map((ap, i) => (
                <tr key={`${a.id}-${i}`} className="border-b border-border/60">
                  <td className="py-1.5">{i === 0 ? a.name : ""}</td>
                  <td className="py-1.5">{ap?.systemName ?? "—"}</td>
                  <td className="py-1.5">{ap?.productName ?? "—"}</td>
                  <td className="py-1.5 text-right">{ap?.app.coats ?? "—"}</td>
                  <td className="py-1.5 text-right tabular">{i === 0 ? area(a.executedArea) : ""}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </DocSection>
      <DocSection title="Produtos e lotes aplicados">
        {lots.length === 0 ? (
          <p className="text-muted">Sem consumo registrado.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6">
            {lots.map((l, i) => (
              <li key={i}>
                {l.product} ({l.manufacturer}) — lote {l.batch ?? "s/n"}
                {l.expiresAt ? `, validade ${date(l.expiresAt)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </DocSection>
      <DocSection title="Testes realizados">
        {quality.tests.length === 0 ? (
          <p className="text-muted">Nenhum teste registrado.</p>
        ) : (
          <ul className="space-y-1">
            {quality.tests.map(({ t, areaName }) => (
              <li key={t.id}>
                Estanqueidade em {areaName ?? "área geral"} de {dateTime(t.startedAt)} a {dateTime(t.endedAt)}: <strong>{t.approved ? "aprovado" : "reprovado"}</strong>
                {t.result ? `. ${t.result}` : ""}
              </li>
            ))}
          </ul>
        )}
        {quality.ncs.length > 0 && (
          <p className="mt-2 text-muted">
            Ocorrências tratadas: {quality.ncs.filter((n) => n.nc.status === "resolvida").length} de {quality.ncs.length}.
          </p>
        )}
      </DocSection>
      {(["antes", "durante", "depois"] as const).map((s) =>
        stagePhotos(s).length ? (
          <DocSection key={s} title={`Fotos: ${s}`}>
            <div className="grid grid-cols-4 gap-2">
              {stagePhotos(s).map(({ ph, areaName }) => (
                <figure key={ph.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(ph)} alt={ph.caption ?? s} className="aspect-[4/3] w-full rounded object-cover" />
                  <figcaption className="mt-0.5 truncate text-[10px] text-muted">{areaName}</figcaption>
                </figure>
              ))}
            </div>
          </DocSection>
        ) : null,
      )}
      <DocSection title="Garantia">
        {warranty.warranties.length === 0 ? (
          <p className="text-muted">A garantia é iniciada na assinatura do termo de entrega ({p.warrantyMonths ?? 60} meses).</p>
        ) : (
          <ul>
            {warranty.warranties.map(({ w }) => (
              <li key={w.id}>
                {w.service}: {w.months} meses, de {date(w.startsAt)} a {date(w.endsAt)}.
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-muted">{number(lots.length)} lote(s) de material rastreados nesta obra.</p>
      </DocSection>
      <div className="mt-6 grid grid-cols-2 gap-8">
        <Signature label="Responsável técnico, Revolution Imper" name={core.engineer} />
        <Signature label="Cliente" name={p.clientContactName ?? core.client.name} />
      </div>
    </>
  );
}
