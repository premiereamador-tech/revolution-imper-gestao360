"use client";

import { useState } from "react";
import { moveLeadAction } from "../actions";
import { ActionForm, SubmitButton } from "@/components/ui/form";

export function LeadMove({ id, stage, stages }: { id: string; stage: string; stages: Array<[string, string]> }) {
  const [value, setValue] = useState(stage);
  return (
    <ActionForm action={moveLeadAction} className="mt-2 space-y-1.5" successMessage={false}>
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-1.5">
        <label className="sr-only" htmlFor={`stage-${id}`}>
          Etapa
        </label>
        <select id={`stage-${id}`} name="stage" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-1.5 text-[12px]">
          {stages.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {value !== stage && (
          <SubmitButton size="sm" className="h-8 px-2 text-[12px]" pendingLabel="…">
            Mover
          </SubmitButton>
        )}
      </div>
      {value === "perdido" && value !== stage && <input name="lostReason" placeholder="Motivo da perda" className="h-8 w-full rounded-md border border-border px-2 text-[12px]" required />}
    </ActionForm>
  );
}
