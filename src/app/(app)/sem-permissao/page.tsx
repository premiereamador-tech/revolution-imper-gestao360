import { LinkButton } from "@/components/ui/primitives";

export default function SemPermissao() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="font-display text-3xl font-semibold">Acesso não liberado</h1>
      <p className="mt-2 text-sm text-muted">Seu perfil não tem permissão para esta tela. Se precisar dela, peça ao administrador para ajustar seu perfil em Configurações.</p>
      <LinkButton href="/inicio" className="mt-6">
        Voltar para minha tela inicial
      </LinkButton>
    </div>
  );
}
