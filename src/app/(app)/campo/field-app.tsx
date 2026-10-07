"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, Camera, CheckSquare, ClipboardList, Clock, Flag, Package, Ruler, WifiOff, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/cn";
import { createDailyLogAction, createNonconformityAction, registerConsumptionAction, uploadPhotoAction } from "../obras/actions";
import { punchAction } from "../equipe/actions";
import { submitChecklistAction } from "./actions";
import { enqueue, fieldsToFormData, formDataToFields, listQueue, removeQueued, updateQueued } from "@/components/pwa/offline-queue";

type ActionFn = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
const ACTIONS: Record<string, ActionFn> = {
  diario: createDailyLogAction,
  ponto: punchAction,
  material: registerConsumptionAction,
  ocorrencia: createNonconformityAction,
  checklist: submitChecklistAction,
  foto: uploadPhotoAction,
};

export interface FieldData {
  greeting: string;
  firstName: string;
  employeeId: string | null;
  nextPunchLabel: string | null;
  punchesToday: Array<{ label: string; time: string }>;
  project: { id: string; name: string; code: string; warehouseId: string | null } | null;
  today: { team: number; target: number | null; executed: number; date: string };
  areas: Array<{ id: string; name: string }>;
  materials: Array<{ value: string; label: string }>;
  checklists: Array<{ templateId: string; name: string; checklistId?: string; items: Array<{ id: string; question: string; photoRequired: boolean; required: boolean }> }>;
  canMeasure: boolean;
  canMaterial: boolean;
  canOccurrence: boolean;
  initialAction?: string;
}

type Panel = "ponto" | "diario" | "fotos" | "material" | "checklist" | "ocorrencia" | "finalizar" | null;

// Idempotência: o mesmo registro reenviado pela fila não duplica no servidor.
const uuid = () => crypto.randomUUID();
const input = "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base";

export function FieldApp({ data }: { data: FieldData }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>((data.initialAction as Panel) ?? null);
  const [toast, setToast] = useState<{ tone: "ok" | "err" | "queue"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  const syncing = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      setQueueSize((await listQueue()).length);
    } catch {
      /* IndexedDB indisponível (navegação privada) */
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const items = await listQueue();
      let sent = 0;
      for (const item of items) {
        const fn = ACTIONS[item.action];
        if (!fn) {
          await removeQueued(item.id!);
          continue;
        }
        try {
          const r = await fn(null, fieldsToFormData(item.fields));
          if (r.ok) {
            await removeQueued(item.id!);
            sent++;
          } else {
            // Erro de regra: não adianta reenviar — guarda o motivo para o usuário ver
            await updateQueued({ ...item, attempts: item.attempts + 1, lastError: r.error });
            if (item.attempts >= 2) await removeQueued(item.id!);
          }
        } catch {
          break; // ainda sem rede
        }
      }
      if (sent) {
        setToast({ tone: "ok", text: `${sent} registro(s) feitos sem internet foram enviados.` });
        router.refresh();
      }
    } finally {
      syncing.current = false;
      refreshQueue();
    }
  }, [refreshQueue, router]);

  useEffect(() => {
    // Ao abrir e sempre que a internet voltar, envia o que ficou na fila
    const t = setTimeout(() => {
      refreshQueue();
      sync();
    }, 0);
    window.addEventListener("online", sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", sync);
    };
  }, [refreshQueue, sync]);

  async function submit(actionKey: string, label: string, fd: FormData) {
    if (!fd.get("clientUuid")) fd.set("clientUuid", uuid());
    if (actionKey === "ponto") fd.set("at", new Date().toISOString());
    setPending(true);
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const r = await ACTIONS[actionKey](null, fd);
      if (r.ok) {
        setToast({ tone: "ok", text: r.message ?? "Registrado." });
        setPanel(null);
        router.refresh();
      } else {
        setToast({ tone: "err", text: r.error });
      }
    } catch {
      await enqueue({ action: actionKey, label, fields: formDataToFields(fd) });
      await refreshQueue();
      setToast({ tone: "queue", text: "Sem internet: salvo no celular. Será enviado automaticamente quando a conexão voltar." });
      setPanel(null);
    } finally {
      setPending(false);
    }
  }

  const onSubmit = (actionKey: string, label: string) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(actionKey, label, new FormData(e.currentTarget));
  };

  const p = data.project;
  const progress = data.today.target ? Math.min((data.today.executed / data.today.target) * 100, 100) : 0;

  const buttons: Array<{ key: Panel; label: string; icon: ReactNode; disabled?: boolean; tone?: string }> = [
    { key: "ponto", label: data.nextPunchLabel ? `Bater ponto: ${data.nextPunchLabel.toLowerCase()}` : "Ponto do dia completo", icon: <Clock className="size-7" />, disabled: !data.employeeId || !data.nextPunchLabel, tone: "bg-primary text-white" },
    { key: "diario", label: "Diário", icon: <ClipboardList className="size-7" />, disabled: !p },
    { key: "fotos", label: "Fotos", icon: <Camera className="size-7" />, disabled: !p },
    { key: "material", label: "Material", icon: <Package className="size-7" />, disabled: !p || !p.warehouseId || !data.canMaterial },
    { key: "checklist", label: "Checklist", icon: <CheckSquare className="size-7" />, disabled: !p || data.checklists.length === 0 },
    { key: "ocorrencia", label: "Ocorrência", icon: <AlertTriangle className="size-7" />, disabled: !p || !data.canOccurrence, tone: "bg-warning-soft text-[#7a4e00]" },
    { key: "finalizar", label: "Finalizar dia", icon: <Flag className="size-7" />, disabled: !p, tone: "bg-abyss text-white" },
  ];

  return (
    <div className="mx-auto max-w-lg">
      {(!online || queueSize > 0) && (
        <div className={cn("mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm", online ? "bg-accent-soft text-[#1d6f77]" : "bg-warning-soft text-[#7a4e00]")}>
          <WifiOff className="size-4 shrink-0" />
          {online ? `${queueSize} registro(s) aguardando envio…` : `Sem internet. ${queueSize ? `${queueSize} registro(s) guardados no celular.` : "Você pode continuar registrando."}`}
          {online && queueSize > 0 && (
            <button type="button" onClick={sync} className="ml-auto font-medium underline">
              Enviar agora
            </button>
          )}
        </div>
      )}

      <section className="rounded-2xl bg-abyss p-5 text-white">
        <p className="text-white/70">
          {data.greeting}, {data.firstName}.
        </p>
        {p ? (
          <>
            <p className="mt-3 text-[13px] text-white/60">Obra atual</p>
            <p className="font-display text-[28px] font-semibold leading-tight">{p.name}</p>
            <p className="text-[13px] text-white/60">{p.code}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/8 px-2 py-2.5">
                <p className="text-[12px] text-white/60">Equipe</p>
                <p className="font-display text-2xl font-semibold">{data.today.team}</p>
              </div>
              <div className="rounded-xl bg-white/8 px-2 py-2.5">
                <p className="text-[12px] text-white/60">Meta</p>
                <p className="font-display text-2xl font-semibold">{data.today.target ? `${data.today.target} m²` : "—"}</p>
              </div>
              <div className="rounded-xl bg-white/8 px-2 py-2.5">
                <p className="text-[12px] text-white/60">Executado</p>
                <p className="font-display text-2xl font-semibold text-accent">{data.today.executed} m²</p>
              </div>
            </div>
            {data.today.target ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-white/80">Você não está alocado em nenhuma obra hoje. Fale com o supervisor.</p>
        )}
        {data.punchesToday.length > 0 && (
          <p className="mt-3 text-[13px] text-white/70">
            Ponto hoje: {data.punchesToday.map((x) => `${x.label} ${x.time}`).join(", ")}
          </p>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {buttons.map((b, i) => (
          <button
            key={b.key}
            type="button"
            disabled={b.disabled}
            onClick={() => setPanel(b.key)}
            className={cn(
              "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-border px-3 py-4 text-center text-[17px] font-semibold transition active:scale-[0.98] disabled:opacity-40",
              b.tone ?? "bg-surface text-text",
              i === 0 && "col-span-2 min-h-24 flex-row text-[19px]",
            )}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>

      {toast && (
        <div role="status" className={cn("fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-2xl px-4 py-3 text-[15px] shadow-xl", toast.tone === "ok" ? "bg-success text-white" : toast.tone === "err" ? "bg-danger text-white" : "bg-abyss text-white")}>
          <div className="flex items-start gap-3">
            <p className="flex-1">{toast.text}</p>
            <button type="button" onClick={() => setToast(null)} aria-label="Fechar">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background" role="dialog" aria-modal="true">
          <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
            <p className="font-display text-xl font-semibold">{buttons.find((b) => b.key === panel)?.label}</p>
            <button type="button" onClick={() => setPanel(null)} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Fechar">
              <X className="size-6" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {panel === "ponto" && data.employeeId && (
              <form onSubmit={onSubmit("ponto", "Ponto")} className="space-y-4">
                <input type="hidden" name="employeeId" value={data.employeeId} />
                <input type="hidden" name="projectId" value={p?.id ?? ""} />
                <GeoHidden />
                <p className="text-center text-lg">Registrar <strong>{data.nextPunchLabel}</strong> agora?</p>
                <Big pending={pending}>Confirmar {data.nextPunchLabel?.toLowerCase()}</Big>
              </form>
            )}

            {(panel === "diario" || panel === "finalizar") && p && (
              <form onSubmit={onSubmit("diario", "Diário de obra")} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <input type="hidden" name="date" value={data.today.date} />
                {panel === "finalizar" && <input type="hidden" name="sign" value="on" />}
                <L label="Área executada hoje (m²)">
                  <input name="executedArea" inputMode="decimal" className={input} defaultValue="0" />
                </L>
                <L label="Em qual área">
                  <select name="areaId" className={input} defaultValue={data.areas[0]?.id}>
                    {data.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </L>
                <div className="grid grid-cols-2 gap-3">
                  <L label="Pessoas">
                    <input name="workersPresent" type="number" min={0} className={input} defaultValue={data.today.team} />
                  </L>
                  <L label="Horas (total)">
                    <input name="hoursWorked" inputMode="decimal" className={input} defaultValue={data.today.team * 9} />
                  </L>
                </div>
                <L label="Clima">
                  <select name="weather" className={input}>
                    {["Ensolarado", "Parcialmente nublado", "Nublado", "Chuva leve", "Chuva forte"].map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </L>
                <L label="O que foi feito">
                  <textarea name="activities" rows={3} className="w-full rounded-xl border border-border p-3 text-base" />
                </L>
                <L label="Problemas, atrasos ou visitas">
                  <textarea name="interferences" rows={2} className="w-full rounded-xl border border-border p-3 text-base" />
                </L>
                <Big pending={pending}>{panel === "finalizar" ? "Finalizar e assinar o dia" : "Salvar diário"}</Big>
              </form>
            )}

            {panel === "fotos" && p && (
              <form onSubmit={onSubmit("foto", "Fotos")} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <L label="Fotos">
                  <input name="file" type="file" accept="image/*" capture="environment" multiple required className="block w-full rounded-xl border border-dashed border-border bg-surface p-6 text-base" />
                </L>
                <L label="Etapa">
                  <select name="stage" className={input} defaultValue="durante">
                    <option value="antes">Antes</option>
                    <option value="durante">Durante</option>
                    <option value="depois">Depois</option>
                    <option value="nao_conformidade">Problema</option>
                    <option value="correcao">Correção</option>
                  </select>
                </L>
                <L label="Ambiente">
                  <select name="areaId" className={input}>
                    <option value="">Geral</option>
                    {data.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </L>
                <Big pending={pending}>Enviar fotos</Big>
              </form>
            )}

            {panel === "material" && p?.warehouseId && (
              <form onSubmit={onSubmit("material", "Consumo de material")} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <input type="hidden" name="fromWarehouseId" value={p.warehouseId} />
                <input type="hidden" name="date" value={data.today.date} />
                <input type="hidden" name="employeeId" value={data.employeeId ?? ""} />
                <L label="Material (lote)">
                  <select name="batchProduct" required className={input}>
                    {data.materials.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="Quantidade usada">
                  <input name="quantity" inputMode="decimal" required className={input} />
                </L>
                <L label="Onde foi usado">
                  <select name="areaId" className={input}>
                    {data.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="Tipo">
                  <select name="type" className={input} defaultValue="consumo">
                    <option value="consumo">Consumo</option>
                    <option value="perda">Perda / avaria</option>
                  </select>
                </L>
                <Big pending={pending}>Lançar material</Big>
              </form>
            )}

            {panel === "checklist" && p && <ChecklistForm data={data} pending={pending} onSubmit={onSubmit("checklist", "Checklist")} />}

            {panel === "ocorrencia" && p && (
              <form onSubmit={onSubmit("ocorrencia", "Ocorrência")} className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <L label="O que aconteceu">
                  <input name="title" required className={input} placeholder="Ex.: infiltração no ralo do apto 12" />
                </L>
                <L label="Detalhes">
                  <textarea name="description" rows={3} className="w-full rounded-xl border border-border p-3 text-base" />
                </L>
                <L label="Gravidade">
                  <select name="severity" className={input} defaultValue="media">
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica (para a obra)</option>
                  </select>
                </L>
                <L label="Área">
                  <select name="areaId" className={input}>
                    <option value="">Geral</option>
                    {data.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </L>
                <input type="hidden" name="isRework" value="on" />
                <Big pending={pending}>Registrar ocorrência</Big>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistForm({ data, pending, onSubmit }: { data: FieldData; pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  const [idx, setIdx] = useState(0);
  const c = data.checklists[idx];
  return (
    <form onSubmit={onSubmit} className="space-y-4" key={c.templateId}>
      <input type="hidden" name="projectId" value={data.project!.id} />
      <input type="hidden" name="templateId" value={c.templateId} />
      {c.checklistId && <input type="hidden" name="checklistId" value={c.checklistId} />}
      <L label="Checklist">
        <select className={input} value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {data.checklists.map((x, i) => (
            <option key={x.templateId} value={i}>
              {x.name}
              {x.checklistId ? " (pendente)" : ""}
            </option>
          ))}
        </select>
      </L>
      <L label="Área">
        <select name="areaId" className={input}>
          {data.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </L>
      <ol className="space-y-3">
        {c.items.map((it, n) => (
          <li key={it.id} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-base font-medium">
              {n + 1}. {it.question}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ["sim", "Sim"],
                ["nao", "Não"],
                ["na", "N/A"],
              ].map(([v, l]) => (
                <label key={v} className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-border text-base has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white">
                  <input type="radio" name={`q_${it.id}`} value={v} required={it.required} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
            {it.photoRequired && (
              <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                <Ruler className="size-4" /> Foto obrigatória
                <input name={`f_${it.id}`} type="file" accept="image/*" capture="environment" className="text-sm" />
              </label>
            )}
          </li>
        ))}
      </ol>
      <Big pending={pending}>Enviar checklist</Big>
    </form>
  );
}

function GeoHidden() {
  const [c, setC] = useState({ lat: "", lng: "" });
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setC({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => undefined,
      { timeout: 6000 },
    );
  }, []);
  return (
    <>
      <input type="hidden" name="latitude" value={c.lat} />
      <input type="hidden" name="longitude" value={c.lng} />
    </>
  );
}

function L({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-medium">{label}</span>
      {children}
    </label>
  );
}

function Big({ children, pending }: { children: ReactNode; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="h-14 w-full rounded-2xl bg-primary text-lg font-semibold text-white disabled:opacity-60">
      {pending ? "Enviando…" : children}
    </button>
  );
}
