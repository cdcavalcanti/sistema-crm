import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="page-eyebrow">Erro 404</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Página não encontrada</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          A rota que você tentou abrir não existe.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Voltar para o dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
