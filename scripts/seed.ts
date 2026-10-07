/**
 * Seed do Revolution Imper Gestão 360.
 *
 *   npm run db:seed            → estrutura base + administrador + dados de demonstração
 *   SEED_DEMO=false npm run db:seed → apenas estrutura base + administrador (produção)
 *
 * O administrador vem de ADMIN_EMAIL / ADMIN_PASSWORD. Nenhuma senha real fica no repositório:
 * se ADMIN_PASSWORD estiver vazia, uma senha aleatória é gerada e exibida uma única vez.
 */
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import * as s from "../src/server/db/schema";
import { DEFAULT_ROLES } from "../src/domain/permissions";
import { DEFAULT_APPROVAL_RULES } from "../src/domain/approvals";
import { DEFAULT_HEALTH_THRESHOLDS } from "../src/domain/health";
import { addDays, addMonths, isWeekend, todayISO } from "../src/domain/dates";
import { round2, splitInstallments } from "../src/domain/money";
import { hashPassword } from "../src/server/auth/password";
import { approveQuote, invoiceMeasurement, recordTightnessTest, signDeliveryTerm, type Actor } from "../src/server/services/automations";

const DEMO = process.env.SEED_DEMO !== "false";
const T = todayISO();

// PRNG determinístico — a demonstração é sempre igual.
let seed = 20261007;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a: number, b: number) => a + (b - a) * rnd();

function genCPF(base: number) {
  const d = String(base).padStart(9, "0").slice(0, 9).split("").map(Number);
  const dv = (arr: number[]) => {
    const sum = arr.reduce((acc, v, i) => acc + v * (arr.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  const x = d.join("");
  return x; // armazenado só com dígitos; a tela formata
}
function genCNPJ(base: number) {
  const d = (String(base).padStart(8, "0").slice(0, 8) + "0001").split("").map(Number);
  const dv = (arr: number[]) => {
    const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = arr.reduce((acc, v, i) => acc + v * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv(d));
  d.push(dv(d));
  const x = d.join("");
  return x;
}

function businessDaysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) if (!isWeekend(d)) days.push(d);
  return days;
}

const systems: Array<[string, string, number | null, number | null, string | null, number | null]> = [
  ["Manta asfáltica", "manta", 1, 1.15, "m²", 24],
  ["Manta aluminizada", "manta", 1, 1.15, "m²", 24],
  ["Membrana acrílica", "membrana", 3, 1.2, "kg", 4],
  ["Membrana de poliuretano", "membrana", 2, 1.5, "kg", 12],
  ["Membrana líquida", "membrana", 3, 1.4, "kg", 6],
  ["Argamassa polimérica", "cimenticio", 3, 3.0, "kg", 6],
  ["Sistema cimentício", "cimenticio", 2, 2.5, "kg", 24],
  ["Cristalizante", "cimenticio", 2, 1.0, "kg", 24],
  ["Hidrofugante", "impregnacao", 2, 0.3, "L", 6],
  ["Injeção", "injecao", null, null, null, 24],
  ["Tratamento de juntas", "juntas", null, null, null, 24],
  ["Selantes", "juntas", null, null, null, 24],
  ["Epóxi", "resina", 2, 0.6, "kg", 24],
];

async function main() {
  const [existing] = await db.select({ id: s.companies.id }).from(s.companies).limit(1);
  if (existing) {
    console.log("⚠️  Banco já possui dados. Use `npm run db:reset` para recriar do zero.");
    return;
  }

  // ------------------------------------------------------------------ base
  const [company] = await db
    .insert(s.companies)
    .values({ name: "Revolution Imper", legalName: "Revolution Imper Impermeabilizações", city: "Campinas", state: "SP" })
    .returning();
  const C = company.id;

  const roleIds: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const [row] = await db.insert(s.roles).values({ companyId: C, key: r.key, name: r.name, description: r.description, isSystem: true }).returning();
    roleIds[r.key] = row.id;
    await db.insert(s.rolePermissions).values(r.permissions.map((p) => ({ roleId: row.id, permission: p })));
  }

  const statuses: Array<[string, string, string, (typeof s.statusCategoryEnum.enumValues)[number]]> = [
    ["orcamento", "Orçamento", "slate", "pre_obra"],
    ["aguardando_aprovacao", "Aguardando aprovação", "slate", "pre_obra"],
    ["contratada", "Contratada", "blue", "pre_obra"],
    ["aguardando_inicio", "Aguardando início", "blue", "pre_obra"],
    ["mobilizacao", "Mobilização", "cyan", "ativa"],
    ["em_execucao", "Em execução", "green", "ativa"],
    ["pausada", "Pausada", "amber", "pausada"],
    ["aguardando_material", "Aguardando material", "amber", "pausada"],
    ["aguardando_cliente", "Aguardando cliente", "amber", "pausada"],
    ["atrasada", "Atrasada", "red", "ativa"],
    ["finalizacao", "Finalização", "cyan", "ativa"],
    ["concluida", "Concluída", "violet", "concluida"],
    ["entregue", "Entregue", "violet", "concluida"],
    ["em_garantia", "Em garantia", "teal", "garantia"],
    ["cancelada", "Cancelada", "slate", "cancelada"],
  ];
  const statusIds: Record<string, string> = {};
  for (const [i, [key, label, color, category]] of statuses.entries()) {
    const [row] = await db.insert(s.projectStatuses).values({ companyId: C, key, label, color, category, position: i }).returning();
    statusIds[key] = row.id;
  }

  const sys: Record<string, string> = {};
  for (const [name, family, coats, cons, unit, cure] of systems) {
    const [row] = await db
      .insert(s.waterproofingSystems)
      .values({ companyId: C, name, family, defaultCoats: coats, defaultConsumptionPerM2: cons, consumptionUnit: unit, minCureHours: cure })
      .returning();
    sys[name] = row.id;
  }
  const appTypes = ["Laje", "Cobertura", "Terraço", "Sacada", "Banheiro", "Cozinha", "Área molhada", "Piscina", "Reservatório", "Caixa d'água", "Floreira", "Baldrame", "Fundação", "Muro de arrimo", "Subsolo", "Fachada", "Telhado", "Calha", "Área industrial"];
  const appTypeIds: Record<string, string> = {};
  for (const name of appTypes) {
    const [row] = await db.insert(s.applicationTypes).values({ companyId: C, name }).returning();
    appTypeIds[name] = row.id;
  }

  const cats: Array<[string, "receita" | "despesa", (typeof s.dreGroupEnum.enumValues)[number], (typeof s.costCategoryEnum.enumValues)[number] | null]> = [
    ["Receita de serviços", "receita", "receita", null],
    ["Rendimentos financeiros", "receita", "receita_financeira", null],
    ["Compra de materiais (estoque)", "despesa", "custo_direto", "materiais"],
    ["Folha operacional (campo)", "despesa", "custo_direto", "mao_de_obra"],
    ["Serviços de terceiros", "despesa", "custo_direto", "terceiros"],
    ["Locação de equipamentos", "despesa", "custo_direto", "equipamentos"],
    ["Fretes e combustível de obra", "despesa", "custo_direto", "transporte"],
    ["Outros custos de obra", "despesa", "custo_direto", "outros"],
    ["Aluguel e condomínio", "despesa", "despesa_administrativa", null],
    ["Salários administrativos", "despesa", "despesa_administrativa", null],
    ["Contabilidade", "despesa", "despesa_administrativa", null],
    ["Software e telefonia", "despesa", "despesa_administrativa", null],
    ["Marketing", "despesa", "despesa_administrativa", null],
    ["Tarifas bancárias e juros", "despesa", "despesa_financeira", null],
  ];
  const cat: Record<string, string> = {};
  for (const [name, type, dreGroup, costCategory] of cats) {
    const [row] = await db.insert(s.financialCategories).values({ companyId: C, name, type, dreGroup, costCategory }).returning();
    cat[name] = row.id;
  }
  await db.insert(s.costCenters).values([
    { companyId: C, code: "ADM", name: "Administrativo", kind: "administrativo" },
    { companyId: C, code: "COM", name: "Comercial", kind: "comercial" },
  ]);
  await db.insert(s.settings).values([
    { companyId: C, key: "approvals.rules", value: DEFAULT_APPROVAL_RULES },
    { companyId: C, key: "health.thresholds", value: DEFAULT_HEALTH_THRESHOLDS },
    { companyId: C, key: "finance.minMarginPct", value: 20 },
    { companyId: C, key: "finance.taxRatePct", value: 6 },
  ]);
  const [central] = await db.insert(s.warehouses).values({ companyId: C, name: "Estoque central", type: "central" }).returning();

  // ------------------------------------------------------------------ admin
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@revolutionimper.com.br").toLowerCase();
  let adminPassword = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!adminPassword) {
    adminPassword = randomBytes(12).toString("base64url");
    generated = true;
  }
  const [admin] = await db
    .insert(s.users)
    .values({ companyId: C, roleId: roleIds.admin, name: process.env.ADMIN_NAME || "Administrador", email: adminEmail, passwordHash: await hashPassword(adminPassword) })
    .returning();

  console.log(`✅ Estrutura base criada. Administrador: ${adminEmail}${generated ? ` / senha gerada: ${adminPassword}  (troque após o primeiro acesso)` : ""}`);
  if (!DEMO) return;

  await seedDemo({ C, roleIds, statusIds, sys, appTypeIds, cat, centralId: central.id, adminId: admin.id });
}

interface Ctx {
  C: string;
  roleIds: Record<string, string>;
  statusIds: Record<string, string>;
  sys: Record<string, string>;
  appTypeIds: Record<string, string>;
  cat: Record<string, string>;
  centralId: string;
  adminId: string;
}

async function seedDemo(ctx: Ctx) {
  const { C, statusIds, sys, appTypeIds, cat, centralId } = ctx;
  const actor: Actor = { id: ctx.adminId, companyId: C, roleKey: "admin" };

  // ------------------------------------------------------------ banco
  const [bank] = await db
    .insert(s.bankAccounts)
    .values([
      { companyId: C, name: "Conta principal", bank: "Banco do Brasil", agency: "1234", accountNumber: "56789-0", openingBalance: 92_000, openingDate: addDays(T, -150) },
      { companyId: C, name: "Conta reserva", bank: "Sicoob", agency: "3001", accountNumber: "11223-4", openingBalance: 25_000, openingDate: addDays(T, -150) },
    ])
    .returning();

  // ------------------------------------------------------------ clientes
  const clientsData = [
    { personType: "PJ" as const, name: "Construtora Alfa Engenharia Ltda", tradeName: "Construtora Alfa", document: genCNPJ(45123987), contactName: "Eng. Fernanda Lima", phone: "1932514400", whatsapp: "19991234401", email: "obras@construtoraalfa.com.br", city: "Campinas", state: "SP", zipCode: "13025320", street: "Av. Norte-Sul", number: "1500", district: "Cambuí" },
    { personType: "PJ" as const, name: "Condomínio Residencial Villa Toscana", tradeName: "Villa Toscana", document: genCNPJ(31987001), contactName: "Síndico Paulo Ramos", phone: "1938710022", whatsapp: "19988776655", email: "sindico@villatoscana.com.br", city: "Valinhos", state: "SP", zipCode: "13271600", street: "Rua dos Vinhedos", number: "200", district: "Jardim Toscana" },
    { personType: "PJ" as const, name: "Grupo Rota Sul Logística e Hotelaria S.A.", tradeName: "Grupo Rota Sul", document: genCNPJ(70345612), contactName: "Juliana Prado (Facilities)", phone: "1938841200", whatsapp: "19997001122", email: "facilities@rotasul.com.br", city: "Paulínia", state: "SP", zipCode: "13140000", street: "Rod. SP-332", number: "km 130", district: "Distrito Industrial" },
    { personType: "PF" as const, name: "Ricardo Oliveira", document: genCPF(352418907), contactName: "Ricardo Oliveira", phone: "19998223344", whatsapp: "19998223344", email: "ricardo.oliveira@email.com", city: "Vinhedo", state: "SP", zipCode: "13280000", street: "Rua das Videiras", number: "48", district: "Santa Rosa" },
    { personType: "PJ" as const, name: "Instituto Educacional Primavera", tradeName: "Escola Primavera", document: genCNPJ(18765432), contactName: "Diretora Márcia Alves", phone: "1934561100", whatsapp: "19991110099", email: "administrativo@escolaprimavera.com.br", city: "Indaiatuba", state: "SP", zipCode: "13330000", street: "Av. Presidente Vargas", number: "900", district: "Centro" },
  ];
  const clientRows = await db.insert(s.clients).values(clientsData.map((c) => ({ companyId: C, ...c }))).returning();
  const [alfa, villa, rotaSul, ricardo, primavera] = clientRows;

  // ------------------------------------------------------------ funcionários e equipes
  const empData: Array<[string, string, number, "clt" | "diarista"]> = [
    ["Jorge Almeida", "Encarregado", 34, "clt"],
    ["Marcos Pereira", "Encarregado", 33, "clt"],
    ["Antônio Silva", "Encarregado", 32, "clt"],
    ["Luiz Fernando Costa", "Aplicador", 26, "clt"],
    ["Diego Santos", "Aplicador", 25, "clt"],
    ["Wellington Rocha", "Aplicador", 25, "clt"],
    ["Rafael Nunes", "Aplicador", 24, "diarista"],
    ["Edson Martins", "Aplicador", 24, "clt"],
    ["Carlos Henrique", "Ajudante", 17, "clt"],
    ["Bruno Teixeira", "Ajudante", 16, "diarista"],
  ];
  const emps = await db
    .insert(s.employees)
    .values(
      empData.map(([name, jobTitle, hourlyRate, employmentType], i) => ({
        companyId: C,
        name,
        jobTitle,
        role: jobTitle === "Encarregado" ? "Encarregado de obra" : jobTitle === "Aplicador" ? "Aplicador de impermeabilização" : "Ajudante geral",
        cpf: genCPF(281734560 + i * 7919),
        phone: `1999${String(1000000 + i * 13579).slice(0, 7)}`,
        admissionDate: addDays(T, -Math.round(200 + i * 97)),
        hourlyRate,
        salary: employmentType === "clt" ? round2(hourlyRate * 220) : null,
        dailyRate: employmentType === "diarista" ? hourlyRate * 9 : null,
        employmentType,
        pixKey: `${name.split(" ")[0].toLowerCase()}@pix.com`,
        bankName: "Nubank",
        emergencyContact: "Familiar — (19) 99999-0000",
        address: "Campinas/SP",
      })),
    )
    .returning();

  const teamDefs = [
    { name: "Equipe A", color: "blue", members: [0, 3, 4, 8] },
    { name: "Equipe B", color: "green", members: [1, 5, 6] },
    { name: "Equipe C", color: "amber", members: [2, 7, 9] },
  ];
  const teams = [];
  for (const t of teamDefs) {
    const [team] = await db.insert(s.teams).values({ companyId: C, name: t.name, color: t.color, foremanId: emps[t.members[0]].id }).returning();
    await db.insert(s.teamMembers).values(t.members.map((m, i) => ({ teamId: team.id, employeeId: emps[m].id, roleInTeam: i === 0 ? "encarregado" : emps[m].jobTitle === "Ajudante" ? "ajudante" : "aplicador" })));
    teams.push({ ...team, members: t.members.map((m) => emps[m]) });
  }

  // ------------------------------------------------------------ usuários de demonstração
  let demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) demoPassword = randomBytes(9).toString("base64url");
  const demoHash = await hashPassword(demoPassword);
  const demoUsers = [
    { name: "Carlos Mendes", email: "diretoria@demo.revolutionimper.com.br", role: "diretoria" },
    { name: "Patrícia Gomes", email: "financeiro@demo.revolutionimper.com.br", role: "financeiro" },
    { name: "Eng. Rafael Souza", email: "engenharia@demo.revolutionimper.com.br", role: "engenheiro" },
    { name: "Thiago Ramos", email: "comercial@demo.revolutionimper.com.br", role: "comercial" },
    { name: "Jorge Almeida", email: "encarregado@demo.revolutionimper.com.br", role: "encarregado", employeeId: emps[0].id },
    { name: "Luiz Fernando Costa", email: "aplicador@demo.revolutionimper.com.br", role: "aplicador", employeeId: emps[3].id },
    { name: "Fernanda Lima (Construtora Alfa)", email: "cliente@demo.revolutionimper.com.br", role: "cliente", clientId: alfa.id },
  ];
  const userRows = await db
    .insert(s.users)
    .values(demoUsers.map((u) => ({ companyId: C, roleId: ctx.roleIds[u.role], name: u.name, email: u.email, passwordHash: demoHash, employeeId: u.employeeId ?? null, clientId: u.clientId ?? null })))
    .returning();
  const engineer = userRows[2];
  const seller = userRows[3];

  // ------------------------------------------------------------ fornecedores e produtos
  const supplierNames = [
    ["Distribuidora ImperMax Ltda", "ImperMax", "Mantas, primers e acessórios", 28],
    ["Casa do Construtor Campinas", "Casa do Construtor", "Locação de equipamentos", 0],
    ["Química Paulista Revestimentos", "Química Paulista", "Membranas de PU e acrílicas", 30],
    ["Cimentec Argamassas Técnicas", "Cimentec", "Argamassas poliméricas e cristalizantes", 28],
    ["Ferragens Valinhos", "Ferragens Valinhos", "Ferramentas e consumíveis", 15],
    ["Gás & Solda Paulínia", "Gás & Solda", "GLP e maçaricos", 7],
    ["Selatec Vedações e Aplicações", "Selatec", "Selantes, mastiques e equipe parceira de aplicação", 7],
    ["EPI Forte Segurança", "EPI Forte", "Equipamentos de proteção individual", 21],
    ["TransCargas Rápido", "TransCargas", "Fretes", 15],
    ["Resinas Brasil Epóxi", "Resinas Brasil", "Epóxi e primers especiais", 28],
  ] as const;
  const suppliers = await db
    .insert(s.suppliers)
    .values(
      supplierNames.map(([legalName, tradeName, productsSupplied, paymentTermDays], i) => ({
        companyId: C, legalName, tradeName, productsSupplied, paymentTermDays, cnpj: genCNPJ(60100200 + i * 104729),
        contactName: "Comercial", phone: `193${String(2000000 + i * 31337).slice(0, 7)}`, email: `vendas@${tradeName.toLowerCase().replace(/[^a-z]/g, "")}.com.br`,
        rating: Math.round(between(3.4, 4.9) * 10) / 10,
      })),
    )
    .returning();

  const productDefs: Array<[string, string, string, string, number, number, string | null, number]> = [
    // sku, nome, fabricante, categoria, custo, mínimo, sistema, fornecedor
    ["MAN-AS-4", "Manta asfáltica 4mm tipo III (rolo 10m²)", "Fabricante A", "Mantas", 189, 20, "Manta asfáltica", 0],
    ["MAN-AS-3", "Manta asfáltica 3mm tipo II (rolo 10m²)", "Fabricante A", "Mantas", 152, 15, "Manta asfáltica", 0],
    ["MAN-AL-3", "Manta aluminizada 3mm (rolo 10m²)", "Fabricante B", "Mantas", 210, 15, "Manta aluminizada", 0],
    ["PRM-AS-18", "Primer asfáltico base água (18L)", "Fabricante A", "Primers", 168, 6, null, 0],
    ["PRM-EP-5", "Primer epóxi bicomponente (5kg)", "Fabricante D", "Primers", 245, 3, null, 9],
    ["PU-MEM-18", "Membrana de poliuretano monocomponente (18kg)", "Fabricante C", "Membranas", 690, 6, "Membrana de poliuretano", 2],
    ["ACR-MEM-18", "Membrana acrílica branca (18kg)", "Fabricante C", "Membranas", 310, 6, "Membrana acrílica", 2],
    ["LIQ-MEM-18", "Membrana líquida elastomérica (18kg)", "Fabricante C", "Membranas", 280, 4, "Membrana líquida", 2],
    ["ARG-POL-18", "Argamassa polimérica bicomponente (18kg)", "Fabricante D", "Argamassas", 98, 30, "Argamassa polimérica", 3],
    ["ARG-CIM-25", "Revestimento cimentício impermeável (25kg)", "Fabricante D", "Argamassas", 76, 20, "Sistema cimentício", 3],
    ["CRI-18", "Cristalizante para concreto (18kg)", "Fabricante D", "Cristalizantes", 132, 8, "Cristalizante", 3],
    ["HID-18", "Hidrofugante base silano (18L)", "Fabricante C", "Hidrofugantes", 220, 4, "Hidrofugante", 2],
    ["EPX-5", "Revestimento epóxi para reservatório (5kg)", "Fabricante D", "Epóxi", 360, 4, "Epóxi", 9],
    ["SEL-PU-600", "Selante PU para juntas (sachê 600ml)", "Fabricante E", "Selantes", 39, 40, "Selantes", 6],
    ["MAS-ASF-3", "Mastique asfáltico (3,6kg)", "Fabricante A", "Selantes", 58, 10, "Tratamento de juntas", 6],
    ["TEL-POL-50", "Tela de poliéster para reforço (rolo 50m)", "Fabricante C", "Acessórios", 120, 8, null, 2],
    ["TEL-VID-50", "Tela de fibra de vidro (rolo 50m)", "Fabricante C", "Acessórios", 98, 6, null, 2],
    ["BER-15", "Berço/cantoneira pré-moldada (barra 1m)", "Fabricante A", "Acessórios", 9, 60, null, 0],
    ["RAL-100", "Ralo com flange para manta 100mm", "Fabricante E", "Acessórios", 34, 20, null, 4],
    ["GLP-13", "Gás GLP P13", "Distribuidora", "Consumíveis", 118, 6, null, 5],
    ["DIS-ARG-20", "Argamassa de regularização (20kg)", "Fabricante D", "Argamassas", 24, 40, null, 3],
    ["ADI-ADE-18", "Adesivo de alta aderência (18L)", "Fabricante D", "Aditivos", 145, 4, null, 3],
    ["INJ-PU-5", "Resina de injeção PU expansiva (5L)", "Fabricante E", "Injeção", 520, 2, "Injeção", 9],
    ["BIT-ASF-18", "Emulsão asfáltica (18L)", "Fabricante A", "Primers", 135, 6, null, 0],
    ["EPI-LUV", "Luva nitrílica (par)", "EPI", "EPI", 7, 60, null, 7],
    ["EPI-OCU", "Óculos de proteção", "EPI", "EPI", 12, 20, null, 7],
    ["ROL-LA-23", "Rolo de lã 23cm", "Ferramentas", "Consumíveis", 22, 20, null, 4],
    ["TRI-PED", "Trincha 4\"", "Ferramentas", "Consumíveis", 14, 20, null, 4],
    ["LIX-36", "Disco de lixa grão 36", "Ferramentas", "Consumíveis", 6, 50, null, 4],
    ["FIT-ALU-10", "Fita aluminizada autoadesiva 10cm", "Fabricante A", "Acessórios", 65, 10, null, 0],
  ];
  const prod: Record<string, typeof s.products.$inferSelect> = {};
  for (const [i, [sku, name, manufacturer, category, cost, minStock, system]] of productDefs.entries()) {
    const unitBySku = sku.startsWith("MAN") ? "m²" : sku.startsWith("SEL") || sku.startsWith("BER") || sku.startsWith("RAL") || sku.startsWith("EPI") || sku.startsWith("ROL") || sku.startsWith("TRI") || sku.startsWith("LIX") || sku.startsWith("GLP") ? "un" : sku.startsWith("TEL") || sku.startsWith("FIT") ? "rolo" : "kg";
    const unitCost = sku.startsWith("MAN") ? round2(cost / 10) : sku.match(/-(18|25|20|5|3)$/) && unitBySku === "kg" ? round2(cost / Number(sku.match(/-(\d+)$/)![1])) : cost;
    const minQty = sku.startsWith("MAN") ? minStock * 10 : unitBySku === "kg" ? minStock * 6 : minStock;
    const [row] = await db
      .insert(s.products)
      .values({
        companyId: C, sku, name, manufacturer, category, unit: unitBySku, averageCost: unitCost, minStock: minQty,
        hasTechnicalSheet: !["DIS-ARG-20", "ADI-ADE-18"].includes(sku), systemId: system ? sys[system] : null,
      })
      .returning();
    prod[sku] = row;
    void i;
  }

  // Lotes + entradas no estoque central (com contas a pagar das compras)
  const batches: Record<string, string> = {};
  let poNumber = 1;
  async function purchase(sku: string, qty: number, date: string, opts: { expiresAt?: string | null; batch?: string; blocked?: boolean; supplier?: number } = {}) {
    const p = prod[sku];
    const supplierIdx = opts.supplier ?? productDefs.find((d) => d[0] === sku)![7];
    const batchNumber = opts.batch ?? `L${date.replaceAll("-", "").slice(2)}-${sku.slice(0, 3)}${Math.floor(rnd() * 90 + 10)}`;
    const [b] = await db
      .insert(s.productBatches)
      .values({
        productId: p.id, batchNumber, manufacturedAt: addDays(date, -30), expiresAt: opts.expiresAt === undefined ? addMonths(date, 12) : opts.expiresAt,
        supplierId: suppliers[supplierIdx].id, blocked: !!opts.blocked, blockReason: opts.blocked ? "Lote com variação de viscosidade — aguardando laudo do fabricante" : null,
      })
      .returning();
    batches[sku] = b.id;
    const [order] = await db
      .insert(s.purchaseOrders)
      .values({ companyId: C, number: poNumber++, supplierId: suppliers[supplierIdx].id, warehouseId: centralId, status: "entregue", total: round2(qty * p.averageCost), expectedDelivery: date, deliveredAt: date, approvedById: ctx.adminId })
      .returning();
    await db.insert(s.purchaseOrderItems).values({ orderId: order.id, productId: p.id, quantity: qty, unitPrice: p.averageCost, receivedQuantity: qty });
    await db.insert(s.stockMovements).values({ companyId: C, type: "entrada", productId: p.id, batchId: b.id, toWarehouseId: centralId, quantity: qty, unitCost: p.averageCost, purchaseOrderId: order.id, date, createdById: ctx.adminId });
    const due = addDays(date, suppliers[supplierIdx].paymentTermDays ?? 28);
    const amount = round2(qty * p.averageCost);
    const paid = due < T;
    const [ap] = await db
      .insert(s.accountsPayable)
      .values({ companyId: C, supplierId: suppliers[supplierIdx].id, categoryId: cat["Compra de materiais (estoque)"], purchaseOrderId: order.id, description: `Pedido ${order.number} — ${p.name}`.slice(0, 200), documentNumber: `NF ${10_000 + order.number}`, competenceDate: date, dueDate: due, amount, paidAmount: paid ? amount : 0, paidAt: paid ? due : null, bankAccountId: paid ? bank.id : null, method: paid ? "boleto" : null })
      .returning();
    if (paid) await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "out", amount, date: due, description: ap.description, payableId: ap.id, method: "boleto" });
    return b.id;
  }

  const stockPlan: Array<[string, number, number]> = [
    // sku, quantidade, dias atrás
    ["MAN-AS-4", 1700, 70], ["MAN-AS-3", 260, 70], ["MAN-AS-3", 600, 160], ["MAN-AL-3", 400, 20], ["PRM-AS-18", 900, 70], ["PRM-EP-5", 40, 60],
    ["PU-MEM-18", 1900, 60], ["ACR-MEM-18", 360, 45], ["LIQ-MEM-18", 216, 45], ["ARG-POL-18", 4200, 50], ["ARG-CIM-25", 600, 50],
    ["CRI-18", 300, 40], ["HID-18", 90, 40], ["EPX-5", 1000, 35], ["SEL-PU-600", 90, 60], ["MAS-ASF-3", 30, 60],
    ["TEL-POL-50", 12, 60], ["TEL-VID-50", 4, 60], ["BER-15", 220, 60], ["RAL-100", 14, 60], ["GLP-13", 9, 20],
    ["DIS-ARG-20", 2000, 50], ["ADI-ADE-18", 54, 50], ["INJ-PU-5", 10, 40], ["BIT-ASF-18", 180, 50], ["EPI-LUV", 120, 30],
    ["EPI-OCU", 25, 30], ["ROL-LA-23", 30, 30], ["TRI-PED", 12, 30], ["LIX-36", 80, 30], ["FIT-ALU-10", 8, 30],
  ];
  for (const [sku, qty, ago] of stockPlan) {
    let expiresAt: string | null | undefined;
    if (sku === "ACR-MEM-18") expiresAt = addDays(T, 18); // vencendo
    if (sku === "HID-18") expiresAt = addDays(T, -6); // vencido
    if (sku.startsWith("EPI") || sku.startsWith("ROL") || sku.startsWith("TRI") || sku.startsWith("LIX") || sku.startsWith("BER") || sku.startsWith("RAL")) expiresAt = null;
    await purchase(sku, qty, addDays(T, -ago), { expiresAt, blocked: sku === "LIQ-MEM-18" });
  }
  // Compra grande a vencer para o galpão (pressiona o caixa)
  await purchase("MAN-AL-3", 3600, addDays(T, -2), { supplier: 0 });

  // ------------------------------------------------------------ equipamentos, EPI, treinamentos
  const eqDefs: Array<[string, string, string]> = [
    ["PAT-001", "Maçarico profissional com regulador", "equipamento"], ["PAT-002", "Maçarico profissional com regulador", "equipamento"],
    ["PAT-003", "Lavadora de alta pressão 2.200 psi", "equipamento"], ["PAT-004", "Martelete rompedor 10kg", "equipamento"],
    ["PAT-005", "Furadeira de impacto 850W", "ferramenta"], ["PAT-006", "Compressor 50L", "equipamento"],
    ["PAT-007", "Escada extensiva 7m", "ferramenta"], ["PAT-008", "Extensão elétrica 50m", "ferramenta"],
    ["PAT-009", "Misturador de argamassa", "equipamento"], ["PAT-010", "Linha de vida portátil", "epi_coletivo"],
  ];
  const equipmentRows = await db
    .insert(s.equipment)
    .values(eqDefs.map(([assetTag, name, category], i) => ({ companyId: C, assetTag, name, category, status: "disponivel" as const, currentWarehouseId: centralId, acquisitionValue: round2(between(400, 6500)), nextMaintenanceAt: addDays(T, Math.round(between(-10, 120))), brand: ["Bosch", "Makita", "Vonder", "Karcher"][i % 4] })))
    .returning();

  const ppe = await db
    .insert(s.ppeItems)
    .values([
      { companyId: C, name: "Capacete com jugular", ca: "31469", caValidUntil: addMonths(T, 20), replacementDays: 365 },
      { companyId: C, name: "Luva de raspa (maçarico)", ca: "28011", caValidUntil: addMonths(T, 8), replacementDays: 30 },
      { companyId: C, name: "Botina de segurança", ca: "40377", caValidUntil: addMonths(T, 14), replacementDays: 180 },
      { companyId: C, name: "Cinto paraquedista", ca: "35529", caValidUntil: addMonths(T, 3), replacementDays: 365 },
      { companyId: C, name: "Respirador PFF2", ca: "38503", caValidUntil: addMonths(T, 11), replacementDays: 15 },
    ])
    .returning();
  for (const [i, e] of emps.entries()) {
    for (const item of ppe) {
      const delivered = addDays(T, -Math.round(between(5, Number(item.replacementDays))));
      await db.insert(s.ppeDeliveries).values({ employeeId: e.id, ppeItemId: item.id, quantity: 1, deliveredAt: delivered, nextReplacementAt: addDays(delivered, Number(item.replacementDays)), deliveredById: ctx.adminId });
    }
    void i;
  }
  const trainingRows = await db
    .insert(s.trainings)
    .values([
      { companyId: C, name: "NR-35 — Trabalho em altura", kind: "nr", validityMonths: 24 },
      { companyId: C, name: "NR-18 — Segurança na construção", kind: "nr", validityMonths: 24 },
      { companyId: C, name: "NR-06 — Uso de EPI", kind: "nr", validityMonths: 12 },
      { companyId: C, name: "Aplicação de manta a maçarico (fabricante)", kind: "treinamento", validityMonths: 36 },
    ])
    .returning();
  for (const [i, e] of emps.entries()) {
    for (const [j, t] of trainingRows.entries()) {
      if (j === 3 && e.jobTitle === "Ajudante") continue;
      const done = addDays(T, -Math.round(between(30, Number(t.validityMonths) * 30 - (i % 4 === 0 && j === 0 ? 700 : 0))));
      const validUntil = i === 4 && j === 0 ? addDays(T, 21) : addMonths(done, Number(t.validityMonths));
      await db.insert(s.employeeTrainings).values({ employeeId: e.id, trainingId: t.id, completedAt: done, validUntil });
    }
  }

  // ------------------------------------------------------------ referências técnicas e checklist
  const [ref] = await db
    .insert(s.technicalReferences)
    .values([
      { companyId: C, kind: "procedimento_interno", code: "PI-IMP-001", title: "Procedimento interno — Aplicação de manta asfáltica", version: "rev. 03", notes: "Procedimento da empresa. Vincule aqui a norma técnica aplicável e a ficha do fabricante vigentes." },
      { companyId: C, kind: "norma", code: "Norma de projeto/execução de impermeabilização", title: "Cadastre o código e a versão vigente da norma adotada pela empresa", version: "a definir", notes: "O sistema não reproduz texto de normas: anexe o documento licenciado da empresa." },
    ])
    .returning();
  const [tpl] = await db
    .insert(s.checklistTemplates)
    .values({ companyId: C, name: "Liberação de etapa — Manta asfáltica", stage: "Impermeabilização", systemId: sys["Manta asfáltica"], referenceId: ref.id })
    .returning();
  const questions: Array<[string, boolean]> = [
    ["Substrato limpo?", false], ["Substrato regularizado?", true], ["Trincas tratadas?", true], ["Ralos tratados?", true],
    ["Juntas tratadas?", false], ["Caimento correto?", true], ["Primer aplicado?", false], ["Reforços executados?", true],
    ["Número correto de demãos?", false], ["Tempo de cura respeitado?", false], ["Proteção mecânica realizada?", true], ["Teste de estanqueidade realizado?", true],
  ];
  const tplItems = await db
    .insert(s.checklistTemplateItems)
    .values(questions.map(([question, photoRequired], position) => ({ templateId: tpl.id, question, position, photoRequired })))
    .returning();
  const [tplArg] = await db
    .insert(s.checklistTemplates)
    .values({ companyId: C, name: "Liberação de etapa — Argamassa polimérica (áreas molhadas)", stage: "Impermeabilização", systemId: sys["Argamassa polimérica"] })
    .returning();
  await db.insert(s.checklistTemplateItems).values(
    ["Substrato limpo e umedecido?", "Cantos arredondados (meia-cana)?", "Tela de reforço nos ralos e cantos?", "Demãos cruzadas aplicadas?", "Tempo entre demãos respeitado?", "Teste de estanqueidade 72h realizado?"].map((question, position) => ({ templateId: tplArg.id, question, position, photoRequired: position >= 2 })),
  );

  // ------------------------------------------------------------ obras
  interface AreaDef { name: string; type: string; system: string; area: number; consumption: number; product: string; unitLabel: string }
  interface ProjectDef {
    code: string; name: string; client: typeof alfa; city: string; status: string; startOffset: number; days: number;
    areas: AreaDef[]; team: number; billing: "parcelas" | "medicao"; downPct: number; installments: number;
    progressTarget: number; materialOver: number; laborRatio: number; matRatio: number; plannedMargin: number;
    overdue?: number; extraThird?: number; retention?: number; warranty: number; subcontracted?: boolean;
  }
  const defs: ProjectDef[] = [
    {
      code: "OB-001", name: "Residencial Jardim das Palmeiras", client: alfa, city: "Campinas", status: "em_execucao", startOffset: -40, days: 60,
      areas: [
        { name: "Laje de cobertura — Torre 1", type: "Cobertura", system: "Manta asfáltica", area: 800, consumption: 1.15, product: "MAN-AS-4", unitLabel: "m²" },
        { name: "Áreas molhadas — Apartamentos", type: "Área molhada", system: "Argamassa polimérica", area: 650, consumption: 3.0, product: "ARG-POL-18", unitLabel: "kg" },
      ],
      team: 0, billing: "parcelas", downPct: 20, installments: 4, progressTarget: 0.64, materialOver: 0.02, laborRatio: 0.97, matRatio: 0.98, plannedMargin: 0.36, warranty: 60,
    },
    {
      code: "OB-002", name: "Edifício Comercial Vértice", client: alfa, city: "Campinas", status: "em_execucao", startOffset: -55, days: 50,
      areas: [
        { name: "Terraço técnico e heliponto", type: "Terraço", system: "Membrana de poliuretano", area: 980, consumption: 1.5, product: "PU-MEM-18", unitLabel: "kg" },
      ],
      team: 1, billing: "medicao", downPct: 10, installments: 3, progressTarget: 0.7, materialOver: 0.18, laborRatio: 1.0, matRatio: 1.18, plannedMargin: 0.32, retention: 5, warranty: 60,
    },
    {
      code: "OB-003", name: "Condomínio Villa Toscana — Piscinas e Reservatórios", client: villa, city: "Valinhos", status: "em_execucao", startOffset: -30, days: 45,
      areas: [
        { name: "Piscina adulto", type: "Piscina", system: "Argamassa polimérica", area: 220, consumption: 4.0, product: "ARG-POL-18", unitLabel: "kg" },
        { name: "Reservatório superior", type: "Reservatório", system: "Epóxi", area: 300, consumption: 0.9, product: "EPX-5", unitLabel: "kg" },
      ],
      team: 2, billing: "parcelas", downPct: 30, installments: 2, progressTarget: 0.55, materialOver: 0.22, laborRatio: 1.38, matRatio: 1.22, plannedMargin: 0.22, overdue: 1, extraThird: 0.12, warranty: 36,
    },
    {
      code: "OB-004", name: "Galpão Logístico Paulínia — Cobertura", client: rotaSul, city: "Paulínia", status: "mobilizacao", startOffset: 3, days: 40,
      areas: [{ name: "Cobertura metálica + laje — Galpão 2", type: "Cobertura", system: "Manta aluminizada", area: 3200, consumption: 1.15, product: "MAN-AL-3", unitLabel: "m²" }],
      team: 1, billing: "medicao", downPct: 15, installments: 3, progressTarget: 0, materialOver: 0, laborRatio: 1, matRatio: 1, plannedMargin: 0.34, retention: 5, warranty: 60,
    },
    {
      code: "OB-005", name: "Clínica Bem Viver — Lajes e Áreas Técnicas", client: alfa, city: "Campinas", status: "concluida", startOffset: -150, days: 35,
      areas: [{ name: "Laje técnica e casa de máquinas", type: "Laje", system: "Manta asfáltica", area: 420, consumption: 1.15, product: "MAN-AS-3", unitLabel: "m²" }],
      team: 0, billing: "parcelas", downPct: 30, installments: 2, progressTarget: 1, materialOver: 0.03, laborRatio: 0.95, matRatio: 0.97, plannedMargin: 0.35, warranty: 60,
    },
    {
      code: "OB-006", name: "Escola Primavera — Subsolo e Baldrames", client: primavera, city: "Indaiatuba", status: "aguardando_cliente", startOffset: -60, days: 40,
      areas: [{ name: "Cortina de subsolo e baldrames", type: "Subsolo", system: "Cristalizante", area: 600, consumption: 1.0, product: "CRI-18", unitLabel: "kg" }],
      team: 2, billing: "parcelas", downPct: 20, installments: 3, progressTarget: 0.3, materialOver: 0.04, laborRatio: 1.0, matRatio: 1.0, plannedMargin: 0.3, overdue: 1, warranty: 60,
    },
    {
      code: "OB-007", name: "Residência Família Oliveira", client: ricardo, city: "Vinhedo", status: "em_execucao", startOffset: -15, days: 25,
      areas: [
        { name: "Sacadas e terraço", type: "Sacada", system: "Membrana acrílica", area: 140, consumption: 1.2, product: "ACR-MEM-18", unitLabel: "kg" },
        { name: "Banheiros", type: "Banheiro", system: "Argamassa polimérica", area: 60, consumption: 3.0, product: "ARG-POL-18", unitLabel: "kg" },
      ],
      team: 0, billing: "parcelas", downPct: 40, installments: 2, progressTarget: 0.58, materialOver: 0.06, laborRatio: 1.08, matRatio: 1.05, plannedMargin: 0.21, warranty: 60, subcontracted: true,
    },
  ];

  const projectIds: Record<string, string> = {};
  for (const d of defs) {
    const start = addDays(T, d.startOffset);
    const plannedEnd = addDays(start, d.days);
    const contractedArea = d.areas.reduce((acc, a) => acc + a.area, 0);
    const workDaysPlanned = businessDaysBetween(start, plannedEnd).length;
    const team = teams[d.team];
    const teamHourly = team.members.reduce((acc, m) => acc + m.hourlyRate, 0);
    const laborFull = round2(teamHourly * 9.1 * workDaysPlanned);
    const materialFull = d.areas.reduce((acc, a) => acc + a.area * a.consumption * prod[a.product].averageCost, 0) + contractedArea * 1.6;
    const thirdParty = round2(contractedArea * 2.2);
    const transport = round2(workDaysPlanned * 55);
    const equipment = round2(workDaysPlanned * 35);
    const budget = {
      materiais: round2(materialFull / d.matRatio),
      mao_de_obra: d.subcontracted ? 0 : round2(laborFull / d.laborRatio),
      terceiros: round2(thirdParty + (d.subcontracted ? laborFull / d.laborRatio : 0)),
      transporte: transport,
      equipamentos: equipment,
      outros: round2(contractedArea * 0.8),
    };
    const costBase = Object.values(budget).reduce((a, b) => a + b, 0);
    const taxRate = 0.06;
    const contractValue = Math.round(costBase / (1 - d.plannedMargin - taxRate) / 100) * 100;
    const taxes = round2(contractValue * taxRate);

    const [contract] = await db
      .insert(s.contracts)
      .values({
        companyId: C, number: `CT-2026-${d.code.slice(3)}`, clientId: d.client.id, status: "assinado", value: contractValue, signedAt: addDays(start, -10), startDate: start,
        durationDays: d.days, downPayment: round2((contractValue * d.downPct) / 100), installments: d.installments, retentionRate: d.retention ?? 0, warrantyMonths: d.warranty,
        paymentTerms: d.billing === "medicao" ? `Entrada de ${d.downPct}% + medições mensais` : `Entrada de ${d.downPct}% + ${d.installments} parcelas mensais`,
      })
      .returning();
    const isDone = d.status === "concluida";
    const actualStart = d.startOffset <= 0 ? addDays(start, d.code === "OB-002" ? 2 : 0) : null;
    const [project] = await db
      .insert(s.projects)
      .values({
        companyId: C, code: d.code, name: d.name, clientId: d.client.id, contractId: contract.id, statusId: statusIds[d.status],
        address: d.client.street ? `${d.client.street}, ${d.client.number}` : null, city: d.city, state: "SP", zipCode: d.client.zipCode,
        clientContactName: d.client.contactName, clientContactPhone: d.client.whatsapp, clientContactEmail: d.client.email,
        engineerId: engineer.id, foremanEmployeeId: team.members[0].id, contractSignedAt: addDays(start, -10), plannedStart: start, actualStart,
        contractDays: d.days, plannedEnd, actualEnd: isDone ? addDays(plannedEnd, -2) : null, contractValue, retentionRate: d.retention ?? 0,
        contractedArea, dailyTargetArea: Math.ceil(contractedArea / Math.max(workDaysPlanned, 1)), warrantyMonths: d.warranty,
        paymentMethod: d.billing === "medicao" ? "Medição mensal (boleto)" : "PIX / boleto",
      })
      .returning();
    projectIds[d.code] = project.id;
    await db.insert(s.costCenters).values({ companyId: C, code: d.code, name: `Obra ${d.code} — ${d.name}`.slice(0, 160), kind: "obra", projectId: project.id });
    await db.insert(s.projectBudgets).values([...Object.entries(budget), ["impostos", taxes] as const].map(([category, amount]) => ({ projectId: project.id, category: category as (typeof s.costCategoryEnum.enumValues)[number], amount: amount as number })));
    const [wh] = await db.insert(s.warehouses).values({ companyId: C, name: `Obra ${d.code}`, type: "obra", projectId: project.id }).returning();
    if (!d.subcontracted) await db.insert(s.projectTeamAssignments).values({ projectId: project.id, teamId: team.id, startDate: start, endDate: isDone ? plannedEnd : null });

    // Áreas + ficha técnica de aplicação
    const areaRows = [];
    for (const a of d.areas) {
      const [row] = await db
        .insert(s.projectAreas)
        .values({
          projectId: project.id, name: a.name, applicationTypeId: appTypeIds[a.type], environmentType: a.type, structureType: a.type === "Piscina" || a.type === "Reservatório" ? "Concreto armado" : "Laje maciça",
          location: d.city, contractedArea: a.area, measuredArea: a.area, executedArea: 0, substrate: "Concreto", substrateCondition: d.code === "OB-003" ? "Irregular, com segregação pontual" : "Bom",
          moisture: d.code === "OB-006" ? "Úmido" : "Seco", hasCracks: d.code !== "OB-001", hasFissures: true, needsLeveling: a.type !== "Reservatório", slopeOk: d.code !== "OB-003",
          drains: Math.round(a.area / 60), pipes: Math.round(a.area / 120), joints: "Juntas de dilatação tratadas com mastique", baseboards: "Rodapé de 30 cm", finishing: "Proteção mecânica 3 cm",
          criticalPoints: a.type === "Piscina" ? "Passagens de dispositivos (retorno, skimmer, iluminação)" : "Ralos, soleiras e encontros com platibanda",
        })
        .returning();
      const sysDefaults = systems.find((x) => x[0] === a.system)!;
      await db.insert(s.waterproofingApplications).values({
        areaId: row.id, systemId: sys[a.system], manufacturer: prod[a.product].manufacturer, productId: prod[a.product].id,
        plannedQuantity: round2(a.area * a.consumption), plannedConsumptionPerM2: a.consumption, usedQuantity: 0,
        primer: a.system.startsWith("Manta") ? "Primer asfáltico base água" : a.system === "Epóxi" ? "Primer epóxi" : null,
        coats: sysDefaults[2], plannedThicknessMm: a.system.startsWith("Manta") ? 4 : 2, method: a.system.startsWith("Manta") ? "Maçarico" : "Rolo/trincha/desempenadeira",
        intervalBetweenCoatsHours: 6, cureHours: sysDefaults[5], teamId: team.id, technicalResponsibleId: engineer.id, startedAt: actualStart,
      });
      areaRows.push({ ...row, def: a });
    }

    // Abastecimento da obra: lançado após a simulação, com folga de 8% sobre o consumido
    const consumedByProduct = new Map<string, number>();
    // Execução: diários, ponto, consumo e custos
    if (actualStart) {
      const endExec = isDone ? addDays(plannedEnd, -2) : d.status === "aguardando_cliente" ? addDays(actualStart, 18) : T;
      const days = businessDaysBetween(actualStart, endExec);
      const targetExecuted = contractedArea * d.progressTarget;
      const perDay = targetExecuted / Math.max(days.length, 1);
      let areaIdx = 0;
      let executedInArea = 0;
      for (const [k, day] of days.entries()) {
        let produced = round2(Math.max(perDay * between(0.75, 1.25), 0));
        if (k === days.length - 1) {
          const sofar = areaRows.reduce((acc, a) => acc + Number(a.executedArea), 0);
          produced = round2(Math.max(targetExecuted - sofar, 0));
        }
        const area = areaRows[Math.min(areaIdx, areaRows.length - 1)];
        const capacity = area.def.area - executedInArea;
        produced = Math.min(produced, capacity);
        executedInArea += produced;
        area.executedArea = round2(Number(area.executedArea) + produced);
        if (executedInArea >= area.def.area - 0.01 && areaIdx < areaRows.length - 1) {
          areaIdx++;
          executedInArea = 0;
        }
        const weather = ["Ensolarado", "Ensolarado", "Nublado", "Parcialmente nublado", "Chuva leve à tarde"][Math.floor(rnd() * 5)];
        const workers = team.members.length - (rnd() < 0.08 ? 1 : 0);
        const [log] = await db
          .insert(s.dailyLogs)
          .values({
            projectId: project.id, date: day, weather, workersPresent: workers, hoursWorked: round2(workers * 9), executedArea: produced, areaId: area.id,
            activities: produced > 0 ? `Aplicação de ${area.def.system.toLowerCase()} em ${area.name.toLowerCase()} (${produced.toLocaleString("pt-BR")} m²).` : "Preparação de substrato.",
            interferences: weather.startsWith("Chuva") ? "Chuva interrompeu aplicação por 1h30." : null,
            notes: k % 7 === 0 ? "Visita do engenheiro responsável." : null, presentEmployeeIds: d.subcontracted ? [] : team.members.slice(0, workers).map((m) => m.id),
            createdById: ctx.adminId, signedById: engineer.id, signedAt: new Date(`${day}T18:00:00-03:00`),
          })
          .returning();

        // Consumo de material proporcional (rastreável por área, lote e funcionário)
        if (produced > 0) {
          const qty = round2(produced * area.def.consumption * (1 + d.materialOver) * between(0.97, 1.03));
          const unitCost = prod[area.def.product].averageCost;
          const [mv] = await db
            .insert(s.stockMovements)
            .values({ companyId: C, type: "consumo", productId: prod[area.def.product].id, batchId: batches[area.def.product], fromWarehouseId: wh.id, quantity: qty, unitCost, projectId: project.id, areaId: area.id, employeeId: team.members[0].id, date: day, createdById: ctx.adminId })
            .returning();
          await db.insert(s.projectCostEntries).values({ projectId: project.id, category: "materiais", amount: round2(qty * unitCost + produced * 1.6), date: day, description: `Consumo: ${prod[area.def.product].name} (${qty} ${prod[area.def.product].unit}) + acessórios`, source: "stock", sourceId: mv.id });
          await db.update(s.waterproofingApplications).set({ usedQuantity: sql`coalesce(${s.waterproofingApplications.usedQuantity},0) + ${qty}` }).where(eq(s.waterproofingApplications.areaId, area.id));
          consumedByProduct.set(area.def.product, (consumedByProduct.get(area.def.product) ?? 0) + qty);
        }

        // Ponto e custo de mão de obra (obras com equipe parceira são custeadas via contas a pagar)
        for (const m of d.subcontracted ? [] : team.members.slice(0, workers)) {
          const outMin = Math.round(between(0, 75));
          const clockIn = new Date(`${day}T07:00:00-03:00`);
          const clockOut = new Date(clockIn.getTime() + (10 * 60 + outMin) * 60_000 * (d.laborRatio > 1.2 ? 1.05 : 1));
          const worked = round2((clockOut.getTime() - clockIn.getTime()) / 3_600_000 - 1);
          const overtime = Math.max(round2(worked - 8), 0);
          const cost = round2((worked - overtime) * m.hourlyRate + overtime * m.hourlyRate * 1.5);
          const [te] = await db
            .insert(s.timeEntries)
            .values({ employeeId: m.id, projectId: project.id, date: day, clockIn, breakStart: new Date(`${day}T12:00:00-03:00`), breakEnd: new Date(`${day}T13:00:00-03:00`), clockOut, workedHours: worked, overtimeHours: overtime, executedArea: round2(produced / workers), laborCost: cost })
            .onConflictDoNothing()
            .returning();
          if (te) await db.insert(s.projectCostEntries).values({ projectId: project.id, category: "mao_de_obra", amount: round2(cost * (d.laborRatio > 1.2 ? 1.15 : 1)), date: day, description: `Mão de obra: ${m.name} (${worked}h)`, source: "timesheet", sourceId: te.id });
        }
        void log;
      }
      for (const a of areaRows) await db.update(s.projectAreas).set({ executedArea: a.executedArea }).where(eq(s.projectAreas.id, a.id));

      // Equipe parceira: medições semanais de mão de obra terceirizada
      if (d.subcontracted) {
        const weeks = Math.ceil(days.length / 5);
        const weekly = round2((laborFull * d.laborRatio * (days.length / workDaysPlanned)) / weeks);
        for (let wk = 0; wk < weeks; wk++) {
          const comp = days[Math.min(wk * 5 + 4, days.length - 1)];
          const due = addDays(comp, 7);
          const paid = due < T;
          const [ap] = await db
            .insert(s.accountsPayable)
            .values({ companyId: C, supplierId: suppliers[6].id, projectId: project.id, categoryId: cat["Serviços de terceiros"], description: `Equipe parceira de aplicação — semana ${wk + 1} — ${d.code}`, competenceDate: comp, dueDate: due, amount: weekly, paidAmount: paid ? weekly : 0, paidAt: paid ? due : null, bankAccountId: bank.id, method: "pix" })
            .returning();
          await db.insert(s.projectCostEntries).values({ projectId: project.id, category: "terceiros", amount: weekly, date: comp, description: ap.description, source: "payable", sourceId: ap.id });
          if (paid) await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "out", amount: weekly, date: due, description: ap.description, payableId: ap.id, method: "pix" });
        }
      }

      // Custos indiretos da obra (transporte, equipamentos, terceiros)
      const progress = d.progressTarget;
      await db.insert(s.projectCostEntries).values([
        { projectId: project.id, category: "transporte", amount: round2(budget.transporte * progress * between(0.9, 1.05)), date: addDays(actualStart, 3), description: "Fretes e combustível (acumulado)", source: "manual" },
        { projectId: project.id, category: "equipamentos", amount: round2(budget.equipamentos * progress * between(0.85, 1.0)), date: addDays(actualStart, 5), description: "Locação de andaimes e equipamentos", source: "manual" },
        { projectId: project.id, category: "outros", amount: round2(budget.outros * progress * between(0.8, 1.0)), date: addDays(actualStart, 6), description: "Consumíveis, EPIs e despesas de campo", source: "manual" },
      ]);
      const thirdAmount = round2(thirdParty * progress * between(0.9, 1.0) + (d.extraThird ? contractValue * d.extraThird : 0));
      const [apThird] = await db
        .insert(s.accountsPayable)
        .values({ companyId: C, supplierId: suppliers[1].id, projectId: project.id, categoryId: cat["Serviços de terceiros"], description: d.extraThird ? `Retrabalho terceirizado: demolição e regularização — ${d.code}` : `Serviços de terceiros — ${d.code}`, competenceDate: addDays(actualStart, 8), dueDate: addDays(actualStart, 38), amount: thirdAmount, paidAmount: addDays(actualStart, 38) < T ? thirdAmount : 0, paidAt: addDays(actualStart, 38) < T ? addDays(actualStart, 38) : null, bankAccountId: bank.id, method: "pix" })
        .returning();
      await db.insert(s.projectCostEntries).values({ projectId: project.id, category: "terceiros", amount: thirdAmount, date: apThird.competenceDate, description: apThird.description, source: "payable", sourceId: apThird.id });
      if (apThird.paidAmount > 0) await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "out", amount: apThird.paidAmount, date: apThird.paidAt!, description: apThird.description, payableId: apThird.id, method: "pix" });
    }

    for (const [sku, consumed] of consumedByProduct) {
      await db.insert(s.stockMovements).values({ companyId: C, type: "transferencia", productId: prod[sku].id, batchId: batches[sku], fromWarehouseId: centralId, toWarehouseId: wh.id, quantity: round2(consumed * 1.08), unitCost: prod[sku].averageCost, projectId: project.id, date: actualStart ?? start, createdById: ctx.adminId });
    }

    // Cronograma (Gantt)
    const phases = ["Mobilização", "Preparação do substrato", "Impermeabilização", "Teste de estanqueidade", "Proteção mecânica", "Limpeza e entrega"];
    const shares = [0.08, 0.2, 0.45, 0.1, 0.12, 0.05];
    const weights = [3, 15, 55, 7, 15, 5];
    let cursor = start;
    let prevTask: string | null = null;
    const progressOverall = isDone ? 1 : d.progressTarget;
    let acc = 0;
    for (const [i, ph] of phases.entries()) {
      const [phase] = await db.insert(s.projectPhases).values({ projectId: project.id, name: ph, position: i, weight: weights[i] }).returning();
      const dur = Math.max(Math.round(d.days * shares[i]), 1);
      const tStart = cursor;
      const tEnd = addDays(cursor, dur);
      const phaseStart = acc;
      acc += shares[i];
      const pr = Math.round(Math.min(Math.max((progressOverall - phaseStart) / shares[i], 0), 1) * 100);
      const [task]: Array<{ id: string }> = await db
        .insert(s.projectTasks)
        .values({ projectId: project.id, phaseId: phase.id, name: ph, plannedStart: tStart, plannedEnd: tEnd, actualStart: pr > 0 ? tStart : null, actualEnd: pr >= 100 ? tEnd : null, progress: pr, dependsOnTaskId: prevTask, responsibleId: engineer.id, position: i })
        .returning();
      prevTask = task.id;
      cursor = tEnd;
    }

    // Recebíveis
    const down = contract.downPayment;
    const arRows: (typeof s.accountsReceivable.$inferInsert)[] = [];
    arRows.push({ companyId: C, clientId: d.client.id, projectId: project.id, contractId: contract.id, categoryId: cat["Receita de serviços"], description: `Entrada — ${contract.number}`, installment: 0, installmentsTotal: d.installments, dueDate: start, amount: down });
    const rest = round2(contractValue - down);
    if (d.billing === "parcelas") {
      splitInstallments(rest, d.installments).forEach((amount, i) => {
        arRows.push({ companyId: C, clientId: d.client.id, projectId: project.id, contractId: contract.id, categoryId: cat["Receita de serviços"], description: `Parcela ${i + 1}/${d.installments} — ${contract.number}`, installment: i + 1, installmentsTotal: d.installments, dueDate: addMonths(start, i + 1), amount });
      });
    } else {
      splitInstallments(rest, d.installments).forEach((amount, i) => {
        arRows.push({ companyId: C, clientId: d.client.id, projectId: project.id, contractId: contract.id, categoryId: cat["Receita de serviços"], description: `Previsão de medição ${i + 1}/${d.installments} — ${contract.number}`, installment: i + 1, installmentsTotal: d.installments, dueDate: addMonths(start, i + 1), amount, forecast: true });
      });
    }
    const inserted = await db.insert(s.accountsReceivable).values(arRows).returning();
    // Baixas: tudo que venceu foi pago, exceto títulos marcados como inadimplentes
    let overdueLeft = d.overdue ?? 0;
    for (const r of inserted.filter((x) => !x.forecast && x.dueDate < T).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))) {
      if (overdueLeft > 0) {
        overdueLeft--;
        continue;
      }
      const paidOn = addDays(r.dueDate, Math.round(between(0, 4)));
      await db.update(s.accountsReceivable).set({ receivedAmount: r.amount, receivedAt: paidOn, bankAccountId: bank.id, method: "pix" }).where(eq(s.accountsReceivable.id, r.id));
      await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "in", amount: r.amount, date: paidOn, description: r.description, receivableId: r.id, method: "pix" });
    }

    // Fotos
    const stages: Array<["antes" | "durante" | "depois", number]> = isDone ? [["antes", 2], ["durante", 2], ["depois", 3]] : actualStart ? [["antes", 2], ["durante", 3]] : [["antes", 1]];
    for (const [stage, count] of stages) {
      for (let i = 1; i <= count; i++) {
        await db.insert(s.projectPhotos).values({ projectId: project.id, url: `/placeholders/${stage}-${((i - 1) % 3) + 1}.svg`, areaId: areaRows[(i - 1) % areaRows.length].id, stage, caption: `${areaRows[(i - 1) % areaRows.length].name} — ${stage}`, takenAt: new Date(`${stage === "antes" ? start : stage === "durante" ? addDays(start, 10 + i) : plannedEnd}T10:00:00-03:00`), createdById: ctx.adminId });
      }
    }
  }

  // ------------------------------------------------------------ medições (OB-002)
  const ob2 = projectIds["OB-002"];
  const [ob2Area] = await db.select().from(s.projectAreas).where(eq(s.projectAreas.projectId, ob2));
  const [ob2Project] = await db.select().from(s.projects).where(eq(s.projects.id, ob2));
  const unitPrice = round2((ob2Project.contractValue * 0.9) / ob2Area.contractedArea);
  const executed = ob2Area.executedArea;
  const m1q = Math.round(executed * 0.42);
  const m2q = Math.round(executed * 0.4);
  const m3q = round2(executed - m1q - m2q);
  const mkMeasurement = async (num: number, prev: number, qty: number, status: "executada" | "aprovada", startOff: number) => {
    const gross = round2(qty * unitPrice);
    const retention = round2(gross * 0.05);
    const [m] = await db
      .insert(s.measurements)
      .values({ projectId: ob2, number: num, periodStart: addDays(T, startOff), periodEnd: addDays(T, startOff + 14), status, grossValue: gross, retentionRate: 5, retentionValue: retention, netValue: round2(gross - retention), approvedAt: status === "aprovada" ? new Date() : null, approvedById: status === "aprovada" ? engineer.id : null })
      .returning();
    await db.insert(s.measurementItems).values({ measurementId: m.id, areaId: ob2Area.id, service: "Impermeabilização com membrana de PU", unit: "m²", contractedQuantity: ob2Area.contractedArea, previousQuantity: prev, currentQuantity: qty, unitPrice, value: gross });
    return m;
  };
  const m1 = await mkMeasurement(1, 0, m1q, "aprovada", -50);
  const m2 = await mkMeasurement(2, m1q, m2q, "aprovada", -30);
  await mkMeasurement(3, m1q + m2q, m3q, "executada", -14);
  const ar1 = await invoiceMeasurement(actor, m1.id, addDays(T, -25));
  await invoiceMeasurement(actor, m2.id, addDays(T, 6));
  await db.update(s.accountsReceivable).set({ receivedAmount: ar1.amount, receivedAt: addDays(T, -24), bankAccountId: bank.id, method: "boleto" }).where(eq(s.accountsReceivable.id, ar1.id));
  await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "in", amount: ar1.amount, date: addDays(T, -24), description: ar1.description, receivableId: ar1.id, method: "boleto" });
  await db.update(s.measurements).set({ status: "recebida" }).where(eq(s.measurements.id, m1.id));

  // Aditivo aprovado na OB-001
  const [ob1] = await db.select().from(s.projects).where(eq(s.projects.id, projectIds["OB-001"]));
  await db.insert(s.contractAdditions).values({ contractId: ob1.contractId!, number: 1, description: "Impermeabilização adicional da casa de bombas (45 m²)", quantity: 45, unit: "m²", value: 6_850, extraDays: 4, status: "aprovado", approvedAt: new Date() });
  await db.insert(s.projectBudgets).values({ projectId: ob1.id, category: "terceiros", amount: 0 }).onConflictDoNothing();

  // ------------------------------------------------------------ qualidade
  await db.insert(s.nonconformities).values([
    { projectId: projectIds["OB-003"], title: "Infiltração na passagem do dispositivo de retorno — piscina adulto", description: "Umidade identificada no entorno da passagem após enchimento parcial.", severity: "critica", cause: "Tratamento inadequado de passagem", correctiveAction: "Remover argamassa no entorno, aplicar flange e reforço com tela, reaplicar 3 demãos.", detectedAt: addDays(T, -6), dueDate: addDays(T, 2), status: "em_tratamento", isRework: true, estimatedReworkCost: 4_800, teamId: teams[2].id, systemId: sys["Argamassa polimérica"], responsibleId: engineer.id },
    { projectId: projectIds["OB-002"], title: "Espessura abaixo do especificado em trecho do terraço", description: "Medição com medidor de película indicou espessura média abaixo do previsto em ~40 m².", severity: "media", cause: "Demão insuficiente", correctiveAction: "Aplicar demão adicional no trecho.", detectedAt: addDays(T, -3), dueDate: addDays(T, 4), status: "aberta", isRework: true, estimatedReworkCost: 1_900, teamId: teams[1].id, systemId: sys["Membrana de poliuretano"], responsibleId: engineer.id },
    { projectId: projectIds["OB-001"], title: "Ralo sem reforço de tela no apto 302", severity: "baixa", cause: "Falha de execução", correctiveAction: "Executado reforço e reaplicação.", detectedAt: addDays(T, -18), dueDate: addDays(T, -15), resolvedAt: addDays(T, -16), status: "resolvida", isRework: true, estimatedReworkCost: 220, teamId: teams[0].id, systemId: sys["Argamassa polimérica"], responsibleId: engineer.id },
  ]);
  const [ob1Area] = await db.select().from(s.projectAreas).where(eq(s.projectAreas.projectId, projectIds["OB-001"])).limit(1);
  await recordTightnessTest(actor, { projectId: projectIds["OB-001"], areaId: ob1Area.id, startedAt: new Date(`${addDays(T, -12)}T08:00:00-03:00`), endedAt: new Date(`${addDays(T, -9)}T08:00:00-03:00`), initialCondition: "Lâmina d'água de 5 cm, ralos tamponados", result: "Sem infiltrações após 72h", approved: true });
  const [ob3Area] = await db.select().from(s.projectAreas).where(eq(s.projectAreas.projectId, projectIds["OB-003"])).limit(1);
  await recordTightnessTest(actor, { projectId: projectIds["OB-003"], areaId: ob3Area.id, startedAt: new Date(`${addDays(T, -5)}T08:00:00-03:00`), endedAt: new Date(`${addDays(T, -2)}T08:00:00-03:00`), initialCondition: "Enchimento até 1,20 m", result: "Queda de nível de 1,5 cm em 72h — infiltração no canto do skimmer", approved: false });

  const [checklist] = await db.insert(s.checklists).values({ templateId: tpl.id, projectId: projectIds["OB-001"], areaId: ob1Area.id, status: "aprovado", filledById: userRows[4].id, completedAt: new Date() }).returning();
  await db.insert(s.checklistAnswers).values(tplItems.map((it) => ({ checklistId: checklist.id, itemId: it.id, answer: "sim" })));
  await db.insert(s.checklists).values({ templateId: tplArg.id, projectId: projectIds["OB-007"], status: "aberto" });

  // ------------------------------------------------------------ entrega e garantia (OB-005)
  await signDeliveryTerm(actor, projectIds["OB-005"], { deliveredAt: addDays(T, -117), companySignerName: "Eng. Rafael Souza", clientSignerName: "Eng. Fernanda Lima", notes: "Entregue sem pendências." });
  const [w] = await db.select().from(s.warranties).where(eq(s.warranties.projectId, projectIds["OB-005"])).limit(1);
  await db.insert(s.serviceRequests).values({ companyId: C, clientId: alfa.id, projectId: projectIds["OB-005"], warrantyId: w.id, kind: "garantia", problem: "Mancha de umidade no forro da sala 3 após chuva forte.", openedAt: addDays(T, -4), visitAt: addDays(T, 2), status: "visita_agendada", responsibleId: engineer.id });

  // Equipamentos em uso
  const eqAssign = [[0, "OB-001", 0, 20], [2, "OB-001", 3, 30], [1, "OB-005", 0, -20], [3, "OB-003", 7, 5], [5, "OB-002", 5, 12]] as const;
  for (const [idx, code, emp, ret] of eqAssign) {
    await db.update(s.equipment).set({ status: "em_uso", currentProjectId: projectIds[code], currentHolderId: emps[emp].id, currentWarehouseId: null, checkedOutAt: addDays(T, -20), expectedReturnAt: addDays(T, ret) }).where(eq(s.equipment.id, equipmentRows[idx].id));
    await db.insert(s.equipmentMovements).values({ equipmentId: equipmentRows[idx].id, type: "retirada", projectId: projectIds[code], employeeId: emps[emp].id, date: addDays(T, -20), expectedReturnAt: addDays(T, ret), createdById: ctx.adminId });
  }
  await db.insert(s.equipmentMaintenance).values({ equipmentId: equipmentRows[3].id, kind: "preventiva", date: addDays(T, -40), cost: 280, supplierId: suppliers[1].id, description: "Troca de escovas e lubrificação", nextReviewAt: addDays(T, 50) });

  // ------------------------------------------------------------ despesas administrativas (6 meses)
  const adm: Array<[string, string, number, number]> = [
    ["Aluguel e condomínio", "Aluguel do galpão/escritório", 5_200, 5],
    ["Salários administrativos", "Folha administrativa", 11_800, 5],
    ["Contabilidade", "Honorários contábeis", 1_450, 10],
    ["Software e telefonia", "Internet, telefonia e softwares", 690, 15],
    ["Marketing", "Tráfego pago e materiais", 1_800, 20],
    ["Tarifas bancárias e juros", "Tarifas bancárias", 210, 28],
  ];
  for (let mOff = -5; mOff <= 1; mOff++) {
    for (const [catName, desc, amount, day] of adm) {
      const due = `${addMonths(T, mOff).slice(0, 7)}-${String(day).padStart(2, "0")}`;
      const paid = due < T;
      const [ap] = await db
        .insert(s.accountsPayable)
        .values({ companyId: C, categoryId: cat[catName], description: `${desc} — ${due.slice(5, 7)}/${due.slice(0, 4)}`, competenceDate: due, dueDate: due, amount: round2(amount * between(0.95, 1.05)), paidAmount: 0, bankAccountId: bank.id })
        .returning();
      if (paid && !(catName === "Marketing" && mOff === 0)) {
        await db.update(s.accountsPayable).set({ paidAmount: ap.amount, paidAt: due, method: "pix" }).where(eq(s.accountsPayable.id, ap.id));
        await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "out", amount: ap.amount, date: due, description: ap.description, payableId: ap.id, method: "pix" });
      }
    }
    // Folha operacional (custo já apropriado às obras pelo ponto; aqui é o desembolso)
    const payday = `${addMonths(T, mOff).slice(0, 7)}-05`;
    const [folha] = await db
      .insert(s.accountsPayable)
      .values({ companyId: C, categoryId: cat["Folha operacional (campo)"], description: `Folha operacional — ${payday.slice(5, 7)}/${payday.slice(0, 4)}`, competenceDate: payday, dueDate: payday, amount: 52_000, bankAccountId: bank.id })
      .returning();
    if (payday < T) {
      await db.update(s.accountsPayable).set({ paidAmount: folha.amount, paidAt: payday, method: "transferencia" }).where(eq(s.accountsPayable.id, folha.id));
      await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "out", amount: folha.amount, date: payday, description: folha.description, payableId: folha.id, method: "transferencia" });
    }
  }
  // Recebimentos históricos de obras antigas (dá volume ao caixa e à DRE)
  for (let mOff = -5; mOff <= -1; mOff++) {
    const date = `${addMonths(T, mOff).slice(0, 7)}-18`;
    const amount = round2(between(68_000, 96_000));
    const [r] = await db
      .insert(s.accountsReceivable)
      .values({ companyId: C, clientId: [alfa, villa, rotaSul][Math.abs(mOff) % 3].id, categoryId: cat["Receita de serviços"], description: `Serviços diversos de manutenção e pequenas obras — ${date.slice(5, 7)}/${date.slice(0, 4)}`, dueDate: date, amount, receivedAmount: amount, receivedAt: date, bankAccountId: bank.id, method: "pix" })
      .returning();
    await db.insert(s.cashTransactions).values({ companyId: C, bankAccountId: bank.id, direction: "in", amount, date, description: r.description, receivableId: r.id, method: "pix" });
  }
  // Despesa aguardando aprovação (alçada da diretoria)
  const [pendingAp] = await db
    .insert(s.accountsPayable)
    .values({ companyId: C, supplierId: suppliers[1].id, projectId: projectIds["OB-003"], categoryId: cat["Locação de equipamentos"], description: "Locação de bomba submersa e desumidificador — OB-003", competenceDate: T, dueDate: addDays(T, 10), amount: 2_350, approvalStatus: "pendente" })
    .returning();
  await db.insert(s.approvalRequests).values({ companyId: C, kind: "despesa", entityId: pendingAp.id, amount: pendingAp.amount, description: pendingAp.description, requiredRole: "diretoria", requestedById: engineer.id });

  // ------------------------------------------------------------ comercial
  const leadDefs: Array<[string, (typeof s.leadStageEnum.enumValues)[number], (typeof s.leadSourceEnum.enumValues)[number], number, string, string | null]> = [
    ["Condomínio Edifício Aurora", "lead", "google", 45_000, "Campinas", null],
    ["Marina Costa (residência)", "contato", "instagram", 12_000, "Valinhos", null],
    ["Supermercado Bom Preço — câmara fria", "visita_agendada", "indicacao", 78_000, "Sumaré", null],
    ["Igreja Batista Central", "visita_realizada", "whatsapp", 32_000, "Hortolândia", null],
    ["Clínica OdontoVida", "orcamento", "site", 18_500, "Campinas", null],
    ["Shopping Parque das Águas — estacionamento", "proposta_enviada", "parceiro", 210_000, "Campinas", null],
    ["Indústria Metalúrgica Vale", "negociacao", "cliente_antigo", 145_000, "Americana", null],
    ["Grupo Rota Sul — Hotel Serra Azul", "fechado", "cliente_antigo", 0, "Atibaia", null],
    ["Família Tanaka", "perdido", "facebook", 9_800, "Vinhedo", "Preço"],
    ["Academia Fit+", "perdido", "google", 22_000, "Campinas", "Optou por concorrente com prazo menor"],
    ["Restaurante Sabor da Serra", "lead", "instagram", 8_500, "Jundiaí", null],
    ["Prefeitura — creche municipal (licitação)", "contato", "outros", 98_000, "Paulínia", null],
  ];
  const leadRows = await db
    .insert(s.leads)
    .values(leadDefs.map(([name, stage, source, estimatedValue, city, lostReason], i) => ({ companyId: C, name, stage, source, estimatedValue, city, lostReason, sellerId: seller.id, phone: `1998${String(1000000 + i * 4111).slice(0, 7)}`, closedAt: stage === "fechado" || stage === "perdido" ? new Date(`${addDays(T, -i * 3)}T12:00:00-03:00`) : null, createdAt: new Date(`${addDays(T, -60 + i * 4)}T09:00:00-03:00`) })))
    .returning();
  await db.insert(s.technicalVisits).values([
    { companyId: C, leadId: leadRows[3].id, scheduledAt: new Date(`${addDays(T, -5)}T09:00:00-03:00`), doneAt: new Date(`${addDays(T, -5)}T10:30:00-03:00`), address: "Rua Central, 100 — Hortolândia/SP", reportedProblem: "Infiltração na laje do salão principal em dias de chuva.", infiltrationType: "Infiltração por laje de cobertura", approxArea: 380, probableCauses: "Manta antiga degradada, rodapés descolados.", proposedSolution: "Remoção da manta antiga, regularização e nova manta asfáltica 4mm com proteção mecânica.", suggestedMaterials: "Manta asfáltica 4mm, primer, mastique.", responsibleId: engineer.id },
    { companyId: C, leadId: leadRows[2].id, scheduledAt: new Date(`${addDays(T, 2)}T14:00:00-03:00`), address: "Av. Rebouças, 3000 — Sumaré/SP", reportedProblem: "Umidade no piso e paredes da câmara fria.", responsibleId: engineer.id },
  ]);

  // Orçamentos: um aprovado via automação (gera contrato + obra OB-008), um enviado, um rascunho
  const mkQuote = async (number: number, clientId: string, title: string, status: "rascunho" | "enviado", items: Array<[string, string, number, number, number, number, string | null]>, extra: Partial<typeof s.quotes.$inferInsert> = {}) => {
    const [q] = await db
      .insert(s.quotes)
      .values({ companyId: C, number, clientId, title, status, validUntil: addDays(T, 15), taxRate: 6, executionDays: 30, warrantyMonths: 60, paymentTerms: "Entrada de 20% + medições mensais", createdById: seller.id, siteCity: "Atibaia", siteState: "SP", ...extra })
      .returning();
    await db.insert(s.quoteItems).values(items.map(([service, description, quantity, mat, lab, price, system], position) => ({ quoteId: q.id, position, service, description, unit: "m²", quantity, materialUnitCost: mat, laborUnitCost: lab, unitPrice: price, systemId: system ? sys[system] : null })));
    return q;
  };
  const hotelQuote = await mkQuote(101, rotaSul.id, "Hotel Serra Azul — Coberturas e Terraços", "enviado", [
    ["Cobertura — Bloco A", "Manta asfáltica 4mm tipo III com proteção mecânica", 1_200, 32, 24, 118, "Manta asfáltica"],
    ["Terraços dos apartamentos", "Membrana de poliuretano 2 demãos", 480, 46, 28, 142, "Membrana de poliuretano"],
  ], { siteAddress: "Estrada da Serra, 1200", leadId: leadRows[7].id });
  await approveQuote(actor, hotelQuote.id, { startDate: addDays(T, 12), billing: "medicao", downPaymentPct: 20, installments: 2, retentionRate: 5 });
  await mkQuote(102, alfa.id, "Shopping Parque das Águas — Estacionamento G2", "enviado", [
    ["Laje do estacionamento G2", "Membrana de poliuretano alifático com camada de desgaste", 2_600, 52, 26, 128, "Membrana de poliuretano"],
  ], { siteCity: "Campinas", leadId: leadRows[5].id });
  await mkQuote(103, villa.id, "Villa Toscana — Floreiras da área comum", "rascunho", [
    ["Floreiras", "Argamassa polimérica + manta líquida", 85, 22, 30, 96, "Argamassa polimérica"],
  ], { siteCity: "Valinhos" });

  console.log("✅ Demonstração criada: 5 clientes, 8 obras, 10 funcionários, 3 equipes, 10 fornecedores, 30 produtos.");
  console.log(`   Usuários de demonstração (senha: ${demoPassword}):`);
  for (const u of demoUsers) console.log(`   • ${u.email.padEnd(44)} ${u.role}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
