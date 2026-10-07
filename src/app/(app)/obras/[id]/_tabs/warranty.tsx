import { deliveryTermAction } from "../../actions";
import { Input, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { date } from "@/lib/format";
import { can } from "@/server/auth/session";
import { projectWarranty } from "@/server/services/project-detail";
import type { TabProps } from "./types";

const REQ_KIND: Record<string, string> = { garantia: "Garantia", manutencao: "Manutenção", novo_servico: "Novo serviço" };

export async function WarrantyTab({ user, core, summary }: TabProps) {
  const w = await projectWarranty(core.p.id);
  const today = todayISO();
  const delivered = w.terms.length > 0;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Termo de entrega"
          description={delivered ? "Obra entregue. A garantia começou a contar na data da entrega." : "Ao assinar o termo, a obra passa para Em garantia e as garantias de cada área são criadas."}
          actions={
            <>
              {delivered && (
                <LinkButton href={`/impressao/obra/${core.p.id}/termo-de-entrega`} target="_blank" variant="secondary" size="sm" prefetch={false}>
                  Imprimir termo
                </LinkButton>
              )}
              {!delivered && can(user, "projects:edit") && (
                <FormModal trigger="Registrar entrega" title="Termo de entrega" description={`Garantia padrão desta obra: ${core.p.warrantyMonths ?? 60} meses.`} action={deliveryTermAction} size="sm" submitLabel="Assinar e entregar">
                  <input type="hidden" name="projectId" value={core.p.id} />
                  <Input name="deliveredAt" type="date" label="Data da entrega" defaultValue={today} required />
                  <Input name="companySignerName" label="Responsável Revolution Imper" required />
                  <Input name="clientSignerName" label="Responsável do cliente" defaultValue={core.p.clientContactName ?? ""} required />
                  <Textarea name="notes" label="Observações" />
                </FormModal>
              )}
            </>
          }
        />
        {delivered ? (
          <ul className="divide-y divide-border">
            {w.terms.map((t) => (
              <li key={t.id} className="px-5 py-3 text-sm">
                Entregue em <strong>{date(t.deliveredAt)}</strong>. Assinado por {t.companySignerName} (Revolution Imper) e {t.clientSignerName} (cliente).
                {t.notes && <p className="text-[13px] text-muted">{t.notes}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-muted">
            {summary.openNonconformities > 0 ? `Atenção: ${summary.openNonconformities} não conformidade(s) em aberto. Críticas impedem a entrega.` : "Sem pendências de qualidade em aberto."}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Garantias" />
        {w.warranties.length === 0 ? (
          <EmptyState title="Nenhuma garantia iniciada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Serviço</Th>
                <Th>Sistema</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {w.warranties.map(({ w: x, systemName }) => (
                <tr key={x.id}>
                  <Td>{x.service}</Td>
                  <Td>{systemName ?? "—"}</Td>
                  <Td className="tabular">{date(x.startsAt)}</Td>
                  <Td className="tabular">{date(x.endsAt)}</Td>
                  <Td>{x.endsAt < today ? <Badge tone="slate">Encerrada</Badge> : x.endsAt <= addDays(today, 60) ? <Badge tone="amber">Vence em breve</Badge> : <Badge tone="teal">Vigente</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Pós-venda" />
        {w.requests.length === 0 ? (
          <EmptyState title="Nenhuma solicitação de pós-venda" />
        ) : (
          <ul className="divide-y divide-border">
            {w.requests.map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{REQ_KIND[r.kind]}</Badge>
                  <span className="text-muted">aberta em {date(r.openedAt)}</span>
                  <Badge tone={r.status === "resolvida" ? "green" : "amber"}>{r.status.replace("_", " ")}</Badge>
                </div>
                <p className="mt-1">{r.problem}</p>
                {r.visitAt && <p className="text-[12px] text-muted">Visita: {date(r.visitAt)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
