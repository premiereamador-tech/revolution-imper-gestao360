"use client";

import { ActionForm, Input, SubmitButton } from "@/components/ui/form";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Input name="email" type="email" label="E-mail" autoComplete="username" required autoFocus />
      <Input name="password" type="password" label="Senha" autoComplete="current-password" required />
      <SubmitButton className="w-full" size="lg" pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
    </ActionForm>
  );
}
