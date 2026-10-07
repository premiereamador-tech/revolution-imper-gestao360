import { uploadPhotoAction } from "../../actions";
import { Input, Select } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { dateTime } from "@/lib/format";
import { can, type SessionUser } from "@/server/auth/session";
import { projectAreasWithApps, projectPhotoList } from "@/server/services/project-detail";
import type { Core } from "./types";

export const STAGES = [
  ["antes", "Antes"],
  ["durante", "Durante"],
  ["depois", "Depois"],
  ["nao_conformidade", "Não conformidade"],
  ["correcao", "Correção"],
  ["entrega", "Entrega"],
] as const;

const srcOf = (ph: { url: string | null; fileId: string | null }) => (ph.fileId ? `/api/files/${ph.fileId}` : (ph.url ?? ""));

export async function PhotosTab({ user, core }: { user: SessionUser; core: Core }) {
  const [photos, areas] = await Promise.all([projectPhotoList(core.p.id), projectAreasWithApps(core.p.id)]);
  const compare = areas
    .map((a) => ({ area: a, before: photos.find((p) => p.ph.areaId === a.id && p.ph.stage === "antes"), after: photos.filter((p) => p.ph.areaId === a.id && p.ph.stage === "depois").at(-1) }))
    .filter((c) => c.before && c.after);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {can(user, "field:use") && (
          <FormModal trigger="Enviar fotos" title="Enviar fotos" description="JPG, PNG ou WEBP, até 20 por vez." action={uploadPhotoAction} submitLabel="Enviar">
            <input type="hidden" name="projectId" value={core.p.id} />
            <Input name="file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple label="Fotos" required />
            <div className="grid grid-cols-2 gap-3">
              <Select name="stage" label="Etapa" options={STAGES.map(([v, l]) => ({ value: v, label: l }))} defaultValue="durante" />
              <Select name="areaId" label="Ambiente" options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Geral" />
            </div>
            <Input name="caption" label="Legenda" />
          </FormModal>
        )}
      </div>

      {compare.length > 0 && (
        <Card>
          <CardHeader title="Antes × depois" description="Comparação lado a lado por ambiente." />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            {compare.map(({ area, before, after }) => (
              <figure key={area.id}>
                <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={srcOf(before!.ph)} alt={`${area.name} antes`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={srcOf(after!.ph)} alt={`${area.name} depois`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                </div>
                <figcaption className="mt-2 flex justify-between text-[13px] text-muted">
                  <span>{area.name}</span>
                  <span>Antes | Depois</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}

      {photos.length === 0 && (
        <Card>
          <EmptyState title="Nenhuma foto ainda" description="Fotos enviadas pelo celular aparecem aqui organizadas por etapa e ambiente." />
        </Card>
      )}

      {STAGES.map(([stage, label]) => {
        const list = photos.filter((p) => p.ph.stage === stage);
        if (!list.length) return null;
        return (
          <Card key={stage}>
            <CardHeader title={label} description={`${list.length} foto(s)`} />
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
              {list.map(({ ph, areaName }) => (
                <a key={ph.id} href={srcOf(ph)} target="_blank" rel="noreferrer" className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={srcOf(ph)} alt={ph.caption ?? label} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-border transition group-hover:ring-primary" />
                  <p className="mt-1 truncate text-[12px] text-text">{areaName ?? "Geral"}</p>
                  <p className="text-[11px] text-muted">{dateTime(ph.takenAt)}</p>
                </a>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
