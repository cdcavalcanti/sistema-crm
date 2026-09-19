import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ListTodo, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Info = { titulo: string; descricao?: string | null; resumo?: string | null; status: string };

const STATUS_LABEL: Record<string, string> = {
  aprovada: "já aprovada",
  concluida: "já concluída",
  backlog: "no backlog",
};

export default function AprovarMelhoria() {
  const [params] = useSearchParams();
  const id = params.get("id");
  const acao = params.get("acao") === "backlog" ? "backlog" : "aprovar";
  const t = params.get("t");

  const [info, setInfo] = useState<Info | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !t) {
      setErro("Link inválido.");
      setCarregando(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string } & Info>(
        "melhoria-acao",
        { body: { op: "info", id, t } },
      );
      if (error || !data?.ok) setErro("Solicitação não encontrada ou link expirado.");
      else setInfo(data);
      setCarregando(false);
    })();
  }, [id, t]);

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; status?: string; error?: string }>(
      "melhoria-acao",
      { body: { op: "executar", id, t, acao } },
    );
    setEnviando(false);
    if (error || !data?.ok) {
      setErro("Não foi possível concluir. Tente novamente.");
      return;
    }
    setResultado(data.status ?? acao);
  };

  const ehBacklog = acao === "backlog";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        {carregando && <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />}

        {!carregando && erro && !info && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-rose-500" />
            <h1 className="mt-3 text-lg font-semibold">Ops</h1>
            <p className="mt-1 text-sm text-slate-500">{erro}</p>
          </>
        )}

        {!carregando && info && !resultado && (
          <>
            {info.status !== "aguardando_aprovacao" && info.status !== "solicitada" ? (
              <>
                <CheckCircle2 className="mx-auto h-12 w-12 text-slate-400" />
                <h1 className="mt-3 text-lg font-semibold">Esta melhoria está {STATUS_LABEL[info.status] ?? info.status}</h1>
                <p className="mt-2 text-sm text-slate-500">{info.titulo}</p>
              </>
            ) : (
              <>
                <div className="text-4xl">{ehBacklog ? "📋" : "✅"}</div>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">Sistema CRM</p>
                <h1 className="mt-1 text-lg font-semibold">
                  {ehBacklog ? "Adicionar ao backlog?" : "Aprovar e publicar?"}
                </h1>
                <p className="mt-3 text-sm font-medium text-slate-700">{info.titulo}</p>
                {info.descricao && <p className="mt-1 text-sm text-slate-500">{info.descricao}</p>}
                <p className="mt-3 text-xs text-slate-400">
                  {ehBacklog
                    ? "Será guardada para depois (não sobe agora)."
                    : "Ao confirmar, o ajuste sobe sozinho assim que o build passar."}
                </p>
                {erro && <p className="mt-3 text-sm text-rose-500">{erro}</p>}
                <Button
                  onClick={confirmar}
                  disabled={enviando}
                  className={`mt-5 w-full ${ehBacklog ? "" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : ehBacklog ? "Adicionar ao backlog" : "Confirmar aprovação"}
                </Button>
              </>
            )}
          </>
        )}

        {resultado && (
          <>
            {resultado === "backlog" ? (
              <ListTodo className="mx-auto h-12 w-12 text-slate-500" />
            ) : (
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            )}
            <h1 className="mt-3 text-lg font-semibold">
              {resultado === "backlog" ? "Adicionado ao backlog" : "Aprovado!"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {resultado === "backlog"
                ? "A melhoria foi guardada para depois."
                : "Vai publicar sozinho assim que o build passar. O grupo será avisado. 🚀"}
            </p>
            <p className="mt-4 text-sm font-medium text-slate-700">{info?.titulo}</p>
          </>
        )}
      </div>
    </div>
  );
}
