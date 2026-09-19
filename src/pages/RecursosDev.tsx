import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Webhook, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const WEBHOOK_URL = `${FUNCTIONS_BASE}/leads`;
const WHATSAPP_WEBHOOK_URL = `${FUNCTIONS_BASE}/whatsapp-webhook?secret=SEU_WHATSAPP_WEBHOOK_SECRET`;

type Etapa = { id: string; nome: string; cor: string | null; ordem: number; tipo: string | null };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="absolute right-2 top-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copiar
        </>
      )}
    </Button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <CopyButton text={children} />
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 pr-20 text-xs leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const CAMPOS = [
  { campo: "origem", tipo: "string", obrigatorio: true, descricao: "Texto livre identificando a origem (ex: \"Whatsapp\", \"SITE - Contato\", \"Indicação\")." },
  { campo: "etapa", tipo: "string", obrigatorio: false, descricao: "Nome da etapa de destino (case/acento-insensitive). Default: \"Lead novo\"." },
  { campo: "nome", tipo: "string", obrigatorio: true, descricao: "Nome do contato/decisor que entrou em contato." },
  { campo: "email", tipo: "string", obrigatorio: false, descricao: "E-mail do contato (usado como chave de upsert de contato)." },
  { campo: "telefone", tipo: "string", obrigatorio: false, descricao: "Celular/WhatsApp do contato." },
  { campo: "nome_estabelecimento", tipo: "string", obrigatorio: false, descricao: "Nome da empresa / organização (campo legado nome_estabelecimento)." },
  { campo: "anos_operacao", tipo: "int (0–100)", obrigatorio: false, descricao: "Anos de operação do estabelecimento (campo legado anos_operacao)." },
  { campo: "segmento", tipo: "string", obrigatorio: false, descricao: "Categoria do lead — use os valores de SEGMENTOS_CRM do cliente." },
  { campo: "responsavel", tipo: "string", obrigatorio: false, descricao: "Dono da oportunidade no CRM (ex: \"Comercial\", \"CS\")." },
  { campo: "data_visita", tipo: "string", obrigatorio: false, descricao: "ISO 8601 (\"2026-05-29T17:00:00-03:00\") ou BR (\"29/05/2026 às 17:00\")." },
  { campo: "google_event_id", tipo: "string", obrigatorio: false, descricao: "ID do evento no Google Calendar. Com data_visita, cacheia o evento localmente." },
  { campo: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres salvas na oportunidade." },
];

const EXEMPLOS = {
  leadNovo: {
    label: "Lead novo (formulário simples)",
    json: JSON.stringify(
      {
        origem: "SITE - Contato",
        nome: "Maria Silva",
        email: "maria@empresa.example.com",
        telefone: "5548999990000",
        nome_estabelecimento: "Empresa X",
        anos_operacao: 8,
        segmento: "Segmento A",
      },
      null,
      2,
    ),
  },
  visitaAgendada: {
    label: "Visita Agendada (com data BR)",
    json: JSON.stringify(
      {
        origem: "Agenda Google - Agendou diretamente pelo link",
        etapa: "Visita Agendada",
        nome: "João Souza",
        email: "joao@empresa.example.com",
        telefone: "5548988888888",
        nome_estabelecimento: "Organização Y",
        anos_operacao: 5,
        segmento: "Serviços",
        data_visita: "29/05/2026 às 17:00",
        google_event_id: "abcd1234efgh",
        observacoes: "Agendado pelo site",
      },
      null,
      2,
    ),
  },
  whatsapp: {
    label: "Whatsapp — Atendimento direto",
    json: JSON.stringify(
      {
        origem: "Whatsapp",
        etapa: "Atendimento",
        responsavel: "Comercial",
        nome: "Ana Costa",
        telefone: "5548977776666",
        observacoes: "Decisor entrou em contato pelo WhatsApp Business",
      },
      null,
      2,
    ),
  },
  metaAds: {
    label: "Meta Ads (com metadados de campanha)",
    json: JSON.stringify(
      {
        origem: "Meta Ads",
        nome: "Lead Meta",
        email: "lead.meta@example.com",
        campaign_name: "Fechamentos 2027",
        ad_name: "Vídeo institucional",
        form_name: "Lead form empresas",
        lead_id: "1234567890",
      },
      null,
      2,
    ),
  },
};

function curlDe(json: string) {
  // Escapa aspas duplas e converte multi-linha → string única pra ficar copiável.
  const compacto = JSON.stringify(JSON.parse(json));
  const escapado = compacto.replace(/'/g, "'\\''");
  return `curl -X POST ${WEBHOOK_URL} \\
  -H "Content-Type: application/json" \\
  -d '${escapado}'`;
}

const RESPOSTAS = {
  sucesso: JSON.stringify(
    {
      ok: true,
      contato_id: "uuid-do-contato",
      oportunidade_id: "uuid-da-oportunidade",
      contato_criado: true,
      etapa: "Visita Agendada",
    },
    null,
    2,
  ),
  erro400: JSON.stringify(
    {
      error: "invalid_payload",
      details: {
        formErrors: [],
        fieldErrors: {
          data_visita: ["data_visita inválida (use ISO 8601 ou 'dd/mm/yyyy às hh:mm')"],
        },
      },
    },
    null,
    2,
  ),
  erro500: JSON.stringify(
    {
      error: "internal_error",
      message: "...",
    },
    null,
    2,
  ),
};

export default function RecursosDev() {
  const { data: etapas, isLoading: loadingEtapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etapas")
        .select("id, nome, cor, ordem, tipo")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Etapa[];
    },
  });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="page-eyebrow">API · Integrações</p>
        <h1 className="page-title">Recursos para Desenvolvedores</h1>
        <p className="page-subtitle">
          Endpoint público pra criar leads e oportunidades a partir de formulários,
          n8n ou qualquer integração HTTP.
        </p>
      </header>

      {/* Endpoint base */}
      <section className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Endpoint</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
              POST
            </span>
            <code className="break-all rounded bg-muted/60 px-2 py-0.5 font-mono text-xs">
              {WEBHOOK_URL}
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Header obrigatório:</strong>{" "}
            <code className="rounded bg-muted/60 px-1 py-0.5">Content-Type: application/json</code>
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>Autenticação:</strong> nenhuma — endpoint público. Validação é
            feita pelo payload (campos obrigatórios e tipos).
          </p>
        </div>
      </section>

      {/* Campos do payload */}
      <section className="surface-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Campos do payload</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Campo</th>
                <th className="pb-2 pr-4 font-medium">Tipo</th>
                <th className="pb-2 pr-4 font-medium">Obrig.</th>
                <th className="pb-2 font-medium">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {CAMPOS.map((c) => (
                <tr key={c.campo} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pr-4 align-top">
                    <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs">
                      {c.campo}
                    </code>
                  </td>
                  <td className="py-2.5 pr-4 align-top text-xs text-muted-foreground">{c.tipo}</td>
                  <td className="py-2.5 pr-4 align-top text-xs">
                    {c.obrigatorio ? (
                      <span className="font-medium text-foreground">Sim</span>
                    ) : (
                      <span className="text-muted-foreground">Não</span>
                    )}
                  </td>
                  <td className="py-2.5 align-top text-xs text-muted-foreground">{c.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Quaisquer outros campos no payload (utm_*, campaign_*, mensagem, etc.) são
          preservados automaticamente em <code className="rounded bg-muted/60 px-1">metadados</code>{" "}
          da oportunidade.
        </p>
      </section>

      {/* Etapas válidas */}
      <section className="surface-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Etapas válidas</h2>
        <p className="text-xs text-muted-foreground">
          Use no campo <code className="rounded bg-muted/60 px-1">etapa</code>. Matching é
          case/acento-insensitive — <code className="rounded bg-muted/60 px-1">"Visita Agendada"</code>,{" "}
          <code className="rounded bg-muted/60 px-1">"visita agendada"</code>, e{" "}
          <code className="rounded bg-muted/60 px-1">"VISITA AGENDADA"</code> são equivalentes.
          Se a etapa não bater, cai em <strong>"Lead novo"</strong>.
        </p>
        {loadingEtapas && <Skeleton className="h-32 w-full" />}
        {etapas && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {etapas.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: e.cor ?? "hsl(var(--primary))" }}
                  />
                  <code className="truncate font-mono text-xs">{e.nome}</code>
                </div>
                {e.tipo && (
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {e.tipo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Exemplos */}
      <section className="surface-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Exemplos de uso</h2>
        <Tabs defaultValue="leadNovo">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="leadNovo">Lead novo</TabsTrigger>
            <TabsTrigger value="visitaAgendada">Visita</TabsTrigger>
            <TabsTrigger value="whatsapp">Whatsapp</TabsTrigger>
            <TabsTrigger value="metaAds">Meta Ads</TabsTrigger>
          </TabsList>
          {(Object.keys(EXEMPLOS) as Array<keyof typeof EXEMPLOS>).map((key) => (
            <TabsContent key={key} value={key} className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">{EXEMPLOS[key].label}</p>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Body (JSON)
                  </p>
                  <CodeBlock>{EXEMPLOS[key].json}</CodeBlock>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    curl (terminal)
                  </p>
                  <CodeBlock>{curlDe(EXEMPLOS[key].json)}</CodeBlock>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* Integrações de entrada (em código) */}
      <section className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Entradas em código (site e Meta)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Captação migrada do n8n para Edge Functions, gravando direto no Supabase do CRM
          no CRM. Cada submissão fica registrada em <code className="rounded bg-muted/60 px-1">entradas_log</code>.
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Site / Landing pages</p>
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">POST</span>
              <code className="break-all rounded bg-muted/60 px-2 py-0.5 font-mono text-xs">{`${FUNCTIONS_BASE}/lp-intake`}</code>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Campos: <code className="rounded bg-muted/60 px-1">nome</code> (obrigatório), telefone, email,
              nome_estabelecimento (estabelecimento), anos_operacao (anos de operação), turma_aluno/segmento (segmento), form_name, url. Re-aponte os formulários do
              <strong> empresa.example.com</strong> para cá.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Meta Lead Ads</p>
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">GET/POST</span>
              <code className="break-all rounded bg-muted/60 px-2 py-0.5 font-mono text-xs">{`${FUNCTIONS_BASE}/meta-leads`}</code>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure como Callback URL do webhook de <strong>leadgen</strong> no app do Meta. Secrets:
              <code className="rounded bg-muted/60 px-1">META_VERIFY_TOKEN</code>,
              <code className="rounded bg-muted/60 px-1">META_PAGE_ACCESS_TOKEN</code>,
              <code className="rounded bg-muted/60 px-1">META_APP_SECRET</code> (opcional, valida assinatura).
            </p>
          </div>
        </div>
      </section>

      {/* Agenda (Google Calendar) */}
      <section className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Agenda (Google Calendar → CRM)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          A função <code className="rounded bg-muted/60 px-1">agenda-sync</code> roda por <strong>cron
          a cada 1 min</strong> e importa as visitas do calendário{" "}
          <code className="rounded bg-muted/60 px-1">agenda@empresa.example.com</code> para o
          pipeline em <strong>"Visita Agendada"</strong> (dedupe por <code className="rounded bg-muted/60 px-1">google_event_id</code>).
          Sem WhatsApp. Reusa o OAuth do <code className="rounded bg-muted/60 px-1">google-calendar-sync</code>.
        </p>
        <p className="text-xs text-muted-foreground">
          Diagnóstico (lista sem criar):{" "}
          <code className="break-all rounded bg-muted/60 px-1">{`${FUNCTIONS_BASE}/agenda-sync?secret=…&dryRun=1`}</code>
        </p>
      </section>

      {/* Chat de WhatsApp (WAHA) */}
      <section className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Chat de WhatsApp (WAHA)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          O Chat usa o provedor <strong>WAHA</strong> (WhatsApp HTTP API). Configure uma instância
          WAHA <strong>exclusiva desta instância</strong> (sessão, número e secret próprios — não
          compartilhar com outros projetos) e aponte o webhook de mensagens para a Edge Function abaixo.
        </p>
        <div className="space-y-2 text-sm">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Webhook de entrada (configure na WAHA)
          </p>
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
              POST
            </span>
            <code className="break-all rounded bg-muted/60 px-2 py-0.5 font-mono text-xs">
              {WHATSAPP_WEBHOOK_URL}
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Eventos esperados: <code className="rounded bg-muted/60 px-1">message</code> /{" "}
            <code className="rounded bg-muted/60 px-1">message.any</code>. Mensagens recebidas viram
            conversas; o número é casado a um contato pelo telefone.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Secrets (supabase secrets set …)
          </p>
          <CodeBlock>{`WAHA_URL=https://sua-instancia-waha
WAHA_API_KEY=...                 # chave da instância WAHA desta instância
WAHA_SESSION=...                 # sessão/número exclusivo desta instância
WHATSAPP_WEBHOOK_SECRET=...      # secret próprio do webhook (gere um aleatório)`}</CodeBlock>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Deploy das functions
          </p>
          <CodeBlock>{`supabase functions deploy whatsapp-webhook --no-verify-jwt
supabase functions deploy whatsapp-send
supabase functions deploy whatsapp-templates
supabase functions deploy whatsapp-send-template`}</CodeBlock>
        </div>
      </section>

      {/* Templates oficiais (Meta via Chatwoot Cloud) */}
      <section className="surface-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">
            Templates WhatsApp (Meta / Chatwoot Cloud)
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          O chat do dia a dia continua na <strong>WAHA</strong>. Templates aprovados pela Meta
          (fora da janela de 24h) saem pela inbox <strong>WhatsApp Cloud API</strong> do Chatwoot —
          a mesma conta já usada no Instagram. No chat, o botão de template (ícone de layout) lista
          e dispara esses modelos; o texto renderizado é espelhado em{" "}
          <code className="rounded bg-muted/60 px-1">mensagens</code>.
        </p>
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Secrets (além dos de Instagram / Chatwoot)
          </p>
          <CodeBlock>{`CHATWOOT_URL=https://app.chatwoot.com
CHATWOOT_TOKEN=...                 # api_access_token (já usado no IG)
CHATWOOT_ACCOUNT_ID=4
CHATWOOT_WHATSAPP_INBOX_ID=...     # inbox Channel::Whatsapp (Cloud API) — NÃO a inbox API/WAHA local
# opcional: restringe nomes (vírgula). Vazio = todos APPROVED
# WHATSAPP_TEMPLATE_ALLOWLIST=boas_vindas,orcamento_pronto`}</CodeBlock>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Deploy
          </p>
          <CodeBlock>{`supabase functions deploy whatsapp-templates
supabase functions deploy whatsapp-send-template
supabase functions deploy disparos
supabase functions deploy disparo-worker`}</CodeBlock>
        </div>
        <p className="text-xs text-muted-foreground">
          A fila <strong>/remarketing</strong> usa os mesmos templates (campanha de
          recuperação). Rode a migration{" "}
          <code className="rounded bg-muted/60 px-1">20260904_0032_remarketing_recuperacao.sql</code>{" "}
          e ative o pg_cron no projeto se ainda não estiver.
        </p>
        <p className="text-xs text-muted-foreground">
          Disparos em massa: tela <strong>/meta</strong> (planilha → rascunho → iniciar).
          Migration{" "}
          <code className="rounded bg-muted/60 px-1">20260904_0033_disparos_meta.sql</code>.
          Enquanto a aba estiver aberta, o CRM chama <code className="rounded bg-muted/60 px-1">tick</code>{" "}
          a cada ~6s; opcionalmente cron em{" "}
          <code className="rounded bg-muted/60 px-1">disparo-worker?secret=AGENDA_SYNC_SECRET</code>{" "}
          (ex.: a cada minuto) se a aba fechar.
        </p>
      </section>

      {/* Respostas */}
      <section className="surface-card p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Respostas esperadas</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs">
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-600">
                200 OK
              </span>
              <span className="font-medium">Sucesso</span>
            </p>
            <CodeBlock>{RESPOSTAS.sucesso}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs">
              <span className="rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-600">
                400
              </span>
              <span className="font-medium">Payload inválido</span>
            </p>
            <CodeBlock>{RESPOSTAS.erro400}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs">
              <span className="rounded bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-rose-600">
                500
              </span>
              <span className="font-medium">Erro interno</span>
            </p>
            <CodeBlock>{RESPOSTAS.erro500}</CodeBlock>
          </div>
        </div>
      </section>
    </div>
  );
}
