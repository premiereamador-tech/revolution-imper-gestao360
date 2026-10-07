import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { decideApprovalAction } from "../financeiro/actions";
import { Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { canApprove } from "@/domain/approvals";
import { dateTime, money } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { approvalRequests, users } from "@/server/db/schema";

export const metadata: Metadata = { title: "Aprovações" };
const KIND: Record<string, string> = { compra: "Compra", despesa: "Despesa", desconto: "Desconto", aditivo: "Aditivo", medicao: "Medição", pagamento: "Pagamento" };
const ROLE: Record<string, string> = { supervisor: "Supervisor", diretoria: "Diretoria", financeiro: "Financeiro", engenheiro: "Engenheiro", comercial: "Comercial", admin: "Administrador" };

export default async function AprovacoesPage() {
  const user = await requireUser("approvals:decide");
  const rows = await db
    .select({ a: approvalRequests, requester: users.name })
    .from(approvalRequests)
    .leftJoin(users, eq(users.id, approvalRequests.requestedById))
    .where(and(eq(approvalRequests.companyId, user.companyId)))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(200);
  const pending = rows.filter((r) => r.a.status === "pendente");
  const done = rows.filter((r) => r.a.status !== "pendente");
  return (
    <>
      <PageHeader title="Aprovações" description="Alçadas por valor configuráveis em Configurações (ex.: até R$ 500 o supervisor aprova; acima, só a diretoria)." />
      <Card className="mb-6">
        <CardHeader title="Aguardando decisão" description={`${pending.length} solicitação(ões)`} />
        {pending.length === 0 ? (
          <EmptyState title="Nada aguardando aprovação" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Descrição</Th>
                <Th align="right">Valor</Th>
                <Th>Alçada</Th>
                <Th>Solicitado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pending.map(({ a, requester }) => {
                const allowed = canApprove(user.roleKey, a.requiredRole) && (a.requestedById !== user.id || user.roleKey === "admin");
                return (
                  <tr key={a.id}>
                    <Td>
                      <Badge tone="violet">{KIND[a.kind] ?? a.kind}</Badge>
                    </Td>
                    <Td>{a.description}</Td>
                    <Td align="right" className="font-medium">
                      {money(a.amount)}
                    </Td>
                    <Td>{ROLE[a.requiredRole] ?? a.requiredRole}</Td>
                    <Td className="text-[13px]">
                      {requester ?? "—"}
                      <p className="text-[12px] text-muted">{dateTime(a.createdAt)}</p>
                    </Td>
                    <Td>
                      {allowed ? (
                        <FormModal trigger="Decidir" title="Decidir solicitação" description={`${a.description} — ${money(a.amount)}`} action={decideApprovalAction} size="sm" submitLabel="Confirmar decisão">
                          <input type="hidden" name="id" value={a.id} />
                          <Select name="decision" label="Decisão" options={[{ value: "aprovar", label: "Aprovar" }, { value: "reprovar", label: "Reprovar" }]} defaultValue="aprovar" />
                          <Textarea name="comment" label="Comentário" rows={2} />
                        </FormModal>
                      ) : (
                        <span className="text-[12px] text-muted">Fora da sua alçada</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Histórico" />
        <Table>
          <thead>
            <tr>
              <Th>Tipo</Th>
              <Th>Descrição</Th>
              <Th align="right">Valor</Th>
              <Th>Decisão</Th>
              <Th>Quando</Th>
            </tr>
          </thead>
          <tbody>
            {done.map(({ a }) => (
              <tr key={a.id}>
                <Td>{KIND[a.kind] ?? a.kind}</Td>
                <Td>
                  {a.description}
                  {a.comment && <p className="text-[12px] text-muted">{a.comment}</p>}
                </Td>
                <Td align="right">{money(a.amount)}</Td>
                <Td>
                  <Badge tone={a.status === "aprovado" ? "green" : "red"}>{a.status}</Badge>
                </Td>
                <Td className="text-[13px]">{dateTime(a.decidedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
