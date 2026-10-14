import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const PAPEIS = [
  { id: "super_admin", nome: "Super admin", desc: "Tudo: usuários, logs, API, saúde, melhorias." },
  { id: "admin", nome: "Administrador", desc: "Funil, equipe, LGPD, IA do tenant, relatórios." },
  { id: "usuario", nome: "Usuário", desc: "Carteira: só vê o que a regra de responsável libera." },
];

export default function Papeis() {
  const { roles } = useAuth();
  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Administração</p>
        <h1 className="page-title">Papéis</h1>
        <p className="page-subtitle">Quem pergunta ou grava no CRM respeita o papel. Convites em Usuários.</p>
      </header>
      <div className="grid gap-3">
        {PAPEIS.map((p) => (
          <div key={p.id} className="surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium">{p.nome}</h2>
              {roles.includes(p.id as typeof roles[number]) && (
                <span className="text-[10px] uppercase tracking-[0.2em] text-primary">seu papel</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
          </div>
        ))}
      </div>
      <Link to="/admin/usuarios" className="text-sm text-primary hover:underline">
        Abrir usuários
      </Link>
    </div>
  );
}
