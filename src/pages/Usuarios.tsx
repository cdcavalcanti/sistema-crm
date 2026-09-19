import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fmtRelative } from "@/lib/format";

import { RESPONSAVEIS_CRM } from "@/lib/constants";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function fetchFn(path: string, body: unknown) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
  return data;
}

const ROLES: { value: AppRole; label: string }[] = [
  { value: "super_admin", label: "Super admin" },
  { value: "admin", label: "Administrador" },
  { value: "usuario", label: "Usuário" },
];

function NovoUsuarioDialog() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("usuario");
  const [responsavelCrm, setResponsavelCrm] = useState<string>("Comercial");

  const criar = useMutation({
    mutationFn: () =>
      fetchFn("/create-user", {
        nome,
        email,
        password,
        role,
        responsavel_crm: responsavelCrm,
      }),
    onSuccess: () => {
      toast.success("Usuário convidado. Envie a senha inicial por canal seguro.");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setOpen(false);
      setNome("");
      setEmail("");
      setPassword("");
      setRole("usuario");
      setResponsavelCrm("Comercial");
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            criar.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Senha inicial (mín. 8) — compartilhe fora do CRM</Label>
            <Input
              type="password"
              value={password}
              minLength={8}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => isSuperAdmin || r.value !== "super_admin").map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Carteira (responsável CRM)</Label>
            <Select value={responsavelCrm} onValueChange={setResponsavelCrm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSAVEIS_CRM.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Define quais oportunidades o vendedor enxerga (além do pool sem dono).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Criando…" : "Criar acesso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Usuarios() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, nome, email, criado_em, ultimo_acesso, responsavel_crm")
        .order("criado_em", { ascending: false });
      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");
      const rolesByUser: Record<string, AppRole[]> = {};
      for (const r of roles ?? []) {
        rolesByUser[r.user_id] = [...(rolesByUser[r.user_id] ?? []), r.role as AppRole];
      }
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser[p.user_id] ?? [],
      }));
    },
  });

  const alterarRole = useMutation({
    mutationFn: (input: { user_id: string; role: AppRole }) =>
      fetchFn("/update-user-role", input),
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Administração</p>
          <h1 className="page-title">Usuários</h1>
          <p className="page-subtitle">Gerencie o acesso da equipe.</p>
        </div>
        <NovoUsuarioDialog />
      </header>

      <div className="surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Carteira</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>Criado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
              </TableRow>
            )}
            {(data ?? []).map((u: any) => {
              const isSuperRow = u.roles.includes("super_admin");
              const podeEditar = isSuperAdmin || !isSuperRow;
              const papelAtual: AppRole = u.roles[0] ?? "usuario";
              return (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.nome ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {podeEditar ? (
                      <Select
                        value={papelAtual}
                        onValueChange={(v) =>
                          alterarRole.mutate({ user_id: u.user_id, role: v as AppRole })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => isSuperAdmin || r.value !== "super_admin").map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge>{papelAtual}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.responsavel_crm ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.ultimo_acesso ? (
                      <span title={new Date(u.ultimo_acesso).toLocaleString("pt-BR")}>
                        {fmtRelative(u.ultimo_acesso)}
                      </span>
                    ) : (
                      "Nunca acessou"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
