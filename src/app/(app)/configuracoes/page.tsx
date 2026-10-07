import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import {
  createChecklistTemplateAction,
  createReferenceAction,
  createUserAction,
  updateApprovalRulesAction,
  updateParametersAction,
  updateRolePermissionsAction,
  updateStatusAction,
  updateUserAction,
} from "./actions";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { DEFAULT_APPROVAL_RULES, type ApprovalKind, type ApprovalRules } from "@/domain/approvals";
import { DEFAULT_HEALTH_THRESHOLDS, type HealthThresholds } from "@/domain/health";
import { PERMISSIONS, type Permission } from "@/domain/permissions";
import { dateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { auditLogs, checklistTemplateItems, checklistTemplates, clients, employees, projectStatuses, rolePermissions, roles, technicalReferences, users, waterproofingSystems } from "@/server/db/schema";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = { title: "Configurações" };

const TABS = [
  ["usuarios", "Usuários"],
  ["perfis", "Perfis e permissões"],
  ["aprovacoes", "Alçadas de aprovação"],
  ["parametros", "Semáforo e finanças"],
  ["status", "Status de obra"],
  ["checklists", "Checklists e normas"],
  ["integracoes", "Integrações"],
  ["auditoria", "Auditoria"],
] as const;

const KIND_LABEL: Record<ApprovalKind, string> = { compra: "Compras", despesa: "Despesas", desconto: "Descontos em orçamento", aditivo: "Aditivos", medicao: "Medições", pagamento: "Pagamentos" };
const HEALTH_LABEL: Record<keyof HealthThresholds, string> = {
  delayDaysWarning: "Atraso para atenção (dias)",
  delayDaysCritical: "Atraso crítico (dias)",
  budgetOverrunWarningPct: "Estouro de custo para atenção (%)",
  budgetOverrunCriticalPct: "Estouro de custo crítico (%)",
  overdueReceivableWarning: "Vencido a receber para atenção (R$)",
  overdueReceivableCritical: "Vencido a receber crítico (R$)",
  materialOverconsumptionPct: "Consumo de material acima do previsto (%)",
  productivityLowRatio: "Produtividade baixa (fração da meta, ex. 0,8)",
  minMarginWarningPct: "Margem mínima por obra (%)",
  yellowScore: "Pontos para amarelo",
  redScore: "Pontos para vermelho",
};

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const admin = await requireUser("settings:manage");
  const { tab = "usuarios" } = await searchParams;
  const C = admin.companyId;
  const roleList = await db.select().from(roles).where(eq(roles.companyId, C)).orderBy(asc(roles.name));
  const roleOpts = roleList.map((r) => ({ value: r.id, label: r.name }));

  return (
    <>
      <PageHeader title="Configurações" description="Usuários, permissões, alçadas e parâmetros. Toda alteração fica registrada na auditoria." />
      <Tabs items={TABS.map(([key, label]) => ({ key, label, href: `/configuracoes?tab=${key}` }))} active={tab} />

      {tab === "usuarios" && <UsersTab companyId={C} roleOpts={roleOpts} />}
      {tab === "perfis" && <RolesTab roleList={roleList} />}
      {tab === "aprovacoes" && <ApprovalsTab companyId={C} />}
      {tab === "parametros" && <ParamsTab companyId={C} />}
      {tab === "status" && <StatusTab companyId={C} />}
      {tab === "checklists" && <ChecklistsTab companyId={C} />}
      {tab === "integracoes" && <IntegrationsTab />}
      {tab === "auditoria" && <AuditTab companyId={C} />}
    </>
  );
}

async function UsersTab({ companyId, roleOpts }: { companyId: string; roleOpts: Array<{ value: string; label: string }> }) {
  const [list, emps, cls] = await Promise.all([
    db.select({ u: users, role: roles.name }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.companyId, companyId)).orderBy(asc(users.name)),
    db.select({ value: employees.id, label: employees.name }).from(employees).where(eq(employees.companyId, companyId)).orderBy(asc(employees.name)),
    db.select({ value: clients.id, label: clients.name }).from(clients).where(eq(clients.companyId, companyId)).orderBy(asc(clients.name)),
  ]);
  return (
    <Card>
      <CardHeader
        title="Usuários"
        actions={
          <FormModal trigger="Novo usuário" title="Novo usuário" action={createUserAction}>
            <Input name="name" label="Nome" required />
            <Input name="email" type="email" label="E-mail (login)" required />
            <Select name="roleId" label="Perfil" required options={roleOpts} placeholder="Selecione" />
            <Input name="password" type="password" label="Senha inicial" required hint="Mínimo 10 caracteres, com letras e números." autoComplete="new-password" />
            <Select name="employeeId" label="Vincular a funcionário (app de campo)" placeholder="—" options={emps} />
            <Select name="clientId" label="Vincular a cliente (portal)" placeholder="—" options={cls} />
          </FormModal>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Nome</Th>
            <Th>E-mail</Th>
            <Th>Perfil</Th>
            <Th>Último acesso</Th>
            <Th>Situação</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.map(({ u, role }) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}</Td>
              <Td>{u.email}</Td>
              <Td>{role}</Td>
              <Td className="text-[13px]">{dateTime(u.lastLoginAt)}</Td>
              <Td>
                {u.active ? <Badge tone="green">Ativo</Badge> : <Badge tone="slate">Inativo</Badge>}
                {u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="red" className="ml-1">Bloqueado</Badge>}
              </Td>
              <Td>
                <FormModal trigger="Editar" title={`Editar ${u.name}`} action={updateUserAction} variant="secondary" size="sm">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="roleId" label="Perfil" defaultValue={u.roleId} options={roleOpts} />
                  <Select name="active" label="Situação" defaultValue={u.active ? "sim" : "nao"} options={[{ value: "sim", label: "Ativo" }, { value: "nao", label: "Inativo" }]} />
                  <Input name="password" type="password" label="Nova senha (opcional)" autoComplete="new-password" hint="Também desbloqueia a conta." />
                </FormModal>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function RolesTab({ roleList }: { roleList: Array<typeof roles.$inferSelect> }) {
  const perms = await db.select().from(rolePermissions);
  const groups = new Map<string, Permission[]>();
  for (const p of Object.keys(PERMISSIONS) as Permission[]) {
    const g = p.split(":")[0];
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {roleList.map((r) => {
        const granted = new Set(perms.filter((p) => p.roleId === r.id).map((p) => p.permission));
        return (
          <Card key={r.id}>
            <CardHeader title={r.name} description={r.description ?? undefined} />
            <CardBody>
              <ActionForm action={updateRolePermissionsAction}>
                <input type="hidden" name="roleId" value={r.id} />
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {[...groups.values()].flat().map((p) => (
                    <label key={p} className="flex items-start gap-2 text-[13px]">
                      <input type="checkbox" name="perm" value={p} defaultChecked={granted.has(p)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                      {PERMISSIONS[p]}
                    </label>
                  ))}
                </div>
                <SubmitButton size="sm" variant="secondary" className="mt-4">
                  Salvar permissões
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

async function ApprovalsTab({ companyId }: { companyId: string }) {
  const rules = await getSetting<ApprovalRules>(companyId, "approvals.rules", DEFAULT_APPROVAL_RULES);
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Alçadas" description="Até o limite, o perfil indicado aprova. Acima dele, somente diretoria (ou administrador)." />
      <CardBody>
        <ActionForm action={updateApprovalRulesAction} className="space-y-4">
          {(Object.keys(KIND_LABEL) as ApprovalKind[]).map((k) => {
            const first = (rules[k] ?? DEFAULT_APPROVAL_RULES[k]).find((t) => t.maxAmount !== null);
            return (
              <div key={k} className="grid items-end gap-3 sm:grid-cols-[1fr_160px_200px]">
                <p className="text-sm font-medium sm:pb-2.5">{KIND_LABEL[k]}</p>
                <Input name={`${k}.limit`} label="Limite (R$)" inputMode="decimal" defaultValue={first?.maxAmount ? String(first.maxAmount) : ""} placeholder="Sem alçada" />
                <Select name={`${k}.role`} label="Aprova até o limite" defaultValue={first?.role ?? "supervisor"} options={[{ value: "supervisor", label: "Supervisor" }, { value: "engenheiro", label: "Engenheiro" }, { value: "financeiro", label: "Financeiro" }, { value: "comercial", label: "Comercial" }, { value: "compras", label: "Compras" }]} />
              </div>
            );
          })}
          <SubmitButton>Salvar alçadas</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

async function ParamsTab({ companyId }: { companyId: string }) {
  const [h, tax, minMargin] = await Promise.all([
    getSetting<HealthThresholds>(companyId, "health.thresholds", DEFAULT_HEALTH_THRESHOLDS),
    getSetting<number>(companyId, "finance.taxRatePct", 6),
    getSetting<number>(companyId, "finance.minMarginPct", 20),
  ]);
  const t = { ...DEFAULT_HEALTH_THRESHOLDS, ...h };
  return (
    <ActionForm action={updateParametersAction} className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Semáforo das obras" description="Cada critério soma pontos; a soma define a cor. Prejuízo projetado é sempre vermelho." />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(HEALTH_LABEL) as Array<keyof HealthThresholds>).map((k) => (
            <Input key={k} name={`h.${k}`} label={HEALTH_LABEL[k]} inputMode="decimal" defaultValue={String(t[k]).replace(".", ",")} />
          ))}
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Finanças" />
        <CardBody className="space-y-3">
          <Input name="taxRatePct" label="Impostos sobre faturamento na DRE (%)" inputMode="decimal" defaultValue={String(tax).replace(".", ",")} />
          <Input name="minMarginPct" label="Margem mínima para alertas do Insights (%)" inputMode="decimal" defaultValue={String(minMargin).replace(".", ",")} />
          <SubmitButton>Salvar parâmetros</SubmitButton>
        </CardBody>
      </Card>
    </ActionForm>
  );
}

async function StatusTab({ companyId }: { companyId: string }) {
  const list = await db.select().from(projectStatuses).where(eq(projectStatuses.companyId, companyId)).orderBy(asc(projectStatuses.position));
  const CAT: Record<string, string> = { pre_obra: "Antes da obra", ativa: "Em andamento", pausada: "Paralisada", concluida: "Concluída", garantia: "Garantia", cancelada: "Cancelada" };
  return (
    <Card className="max-w-4xl">
      <CardHeader title="Status de obra" description="Nome e cor são livres. A categoria define como o sistema trata a obra (avanço, atrasos, garantia) e não muda." />
      <Table>
        <thead>
          <tr>
            <Th>Status</Th>
            <Th>Categoria</Th>
            <Th>Ativo</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              <Td>
                <Badge tone={s.color}>{s.label}</Badge>
              </Td>
              <Td className="text-muted">{CAT[s.category]}</Td>
              <Td>{s.active ? "Sim" : "Não"}</Td>
              <Td>
                <FormModal trigger="Editar" title={`Status: ${s.label}`} action={updateStatusAction} variant="ghost" size="sm">
                  <input type="hidden" name="id" value={s.id} />
                  <Input name="label" label="Nome" defaultValue={s.label} required />
                  <Select name="color" label="Cor" defaultValue={s.color} options={["slate", "blue", "cyan", "green", "teal", "amber", "red", "violet"].map((c) => ({ value: c, label: c }))} />
                  <Select name="active" label="Disponível" defaultValue={s.active ? "sim" : "nao"} options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]} />
                </FormModal>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function ChecklistsTab({ companyId }: { companyId: string }) {
  const [templates, items, refs, systems] = await Promise.all([
    db.select().from(checklistTemplates).where(eq(checklistTemplates.companyId, companyId)).orderBy(asc(checklistTemplates.name)),
    db.select().from(checklistTemplateItems).orderBy(asc(checklistTemplateItems.position)),
    db.select().from(technicalReferences).where(eq(technicalReferences.companyId, companyId)),
    db.select({ value: waterproofingSystems.id, label: waterproofingSystems.name }).from(waterproofingSystems).where(eq(waterproofingSystems.companyId, companyId)),
  ]);
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader
          title="Modelos de checklist"
          description="Usados para liberar etapas. Itens com foto obrigatória exigem registro fotográfico."
          actions={
            <FormModal trigger="Novo modelo" title="Novo modelo de checklist" action={createChecklistTemplateAction} wide>
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="name" label="Nome" required />
                <Input name="stage" label="Etapa" placeholder="Ex.: Impermeabilização" />
                <Select name="systemId" label="Sistema" placeholder="Qualquer" options={systems} />
                <Select name="referenceId" label="Norma / procedimento vinculado" placeholder="—" options={refs.map((r) => ({ value: r.id, label: `${r.code} ${r.version ?? ""}` }))} />
              </div>
              <Textarea name="items" label="Itens (um por linha)" rows={8} required placeholder={"Substrato limpo?\nCaimento correto?\nPrimer aplicado?"} />
              <Input name="photoItems" label="Números dos itens com foto obrigatória" placeholder="Ex.: 2, 4" />
            </FormModal>
          }
        />
        <ul className="divide-y divide-border">
          {templates.map((t) => (
            <li key={t.id} className="px-5 py-4">
              <p className="font-medium">
                {t.name} <span className="text-[12px] font-normal text-muted">v{t.version}</span>
              </p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[13px]">
                {items
                  .filter((i) => i.templateId === t.id)
                  .map((i) => (
                    <li key={i.id}>
                      {i.question}
                      {i.photoRequired && <Badge tone="blue" className="ml-1.5">foto</Badge>}
                    </li>
                  ))}
              </ol>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="h-fit">
        <CardHeader
          title="Normas e procedimentos"
          description="Registre código, versão e o documento da empresa. O sistema não reproduz texto de normas."
          actions={
            <FormModal trigger="Nova referência" title="Nova referência técnica" action={createReferenceAction} size="sm">
              <Select name="kind" label="Tipo" options={[{ value: "norma", label: "Norma técnica" }, { value: "fabricante", label: "Recomendação do fabricante" }, { value: "procedimento_interno", label: "Procedimento interno" }]} />
              <Input name="code" label="Código" required />
              <Input name="title" label="Título" required />
              <Input name="version" label="Versão / ano" />
              <Textarea name="notes" label="Observações" rows={2} />
            </FormModal>
          }
        />
        <ul className="divide-y divide-border">
          {refs.map((r) => (
            <li key={r.id} className="px-5 py-3 text-sm">
              <p className="font-medium">{r.code}</p>
              <p className="text-[13px]">{r.title}</p>
              <p className="text-[12px] text-muted">
                {r.kind.replace("_", " ")}, versão {r.version ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const rows: Array<[string, string, string, string]> = [
    ["CEP", "CEP_PROVIDER", "viacep | mock", "Ativo (ViaCEP). Preenche endereço nos cadastros."],
    ["E-mail", "NOTIFY_EMAIL_DRIVER, SMTP_URL", "mock | smtp", "Modo simulado registra o envio no log. Configure SMTP para enviar de verdade."],
    ["WhatsApp Business", "NOTIFY_WHATSAPP_DRIVER, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID", "mock | meta", "Adaptador pronto para a API oficial da Meta."],
    ["Storage de arquivos", "STORAGE_DRIVER, S3_*", "local | s3", "Qualquer serviço compatível com S3 (AWS, R2, MinIO…)."],
    ["PIX / boleto", "src/server/integrations/br.ts → ChargeProvider", "mock", "Interface pronta; implemente o adaptador do banco ou gateway contratado."],
    ["NF-e / NFS-e", "src/server/integrations/br.ts → InvoiceIssuer", "—", "Interface pronta para o emissor fiscal contratado."],
    ["CNPJ", "src/server/integrations/br.ts → CnpjProvider", "—", "Interface pronta para consulta de CNPJ."],
    ["Assinatura digital", "contracts.signature_provider", "—", "Campos preparados no contrato para o provedor escolhido."],
    ["IA para Insights", "src/domain/insights.ts → InsightProvider", "regras", "Hoje: regras internas. Um provedor de IA pode ser plugado sem mudar telas."],
  ];
  return (
    <Card>
      <CardHeader title="Integrações" description="Credenciais ficam apenas em variáveis de ambiente, nunca no código ou no banco. Veja o README para ativar cada uma." />
      <Table>
        <thead>
          <tr>
            <Th>Integração</Th>
            <Th>Configuração</Th>
            <Th>Modos</Th>
            <Th>Situação</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c, d]) => (
            <tr key={a}>
              <Td className="font-medium">{a}</Td>
              <Td className="font-mono text-[12px]">{b}</Td>
              <Td>{c}</Td>
              <Td className="text-[13px]">{d}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function AuditTab({ companyId }: { companyId: string }) {
  const logs = await db.select({ l: auditLogs, user: users.name }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId)).where(eq(auditLogs.companyId, companyId)).orderBy(desc(auditLogs.createdAt)).limit(150);
  return (
    <Card>
      <CardHeader title="Auditoria" description="Últimas 150 operações. Valores anteriores e novos ficam guardados (senhas e tokens são omitidos)." />
      <Table>
        <thead>
          <tr>
            <Th>Quando</Th>
            <Th>Usuário</Th>
            <Th>Operação</Th>
            <Th>Registro</Th>
            <Th>Alteração</Th>
          </tr>
        </thead>
        <tbody>
          {logs.map(({ l, user }) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-[13px]">{dateTime(l.createdAt)}</Td>
              <Td className="text-[13px]">{user ?? "Sistema"}</Td>
              <Td className="font-mono text-[12px]">{l.action}</Td>
              <Td className="text-[12px] text-muted">
                {l.entity}
                {l.ip && <span className="block">IP {l.ip}</span>}
              </Td>
              <Td className="max-w-md">
                {l.before !== null || l.after !== null ? (
                  <details>
                    <summary className="cursor-pointer text-[12px] text-primary">ver valores</summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify({ antes: l.before, depois: l.after }, null, 2)}</pre>
                  </details>
                ) : (
                  "—"
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
