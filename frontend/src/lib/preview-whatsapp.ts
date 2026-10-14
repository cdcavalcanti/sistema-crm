import {
  mergeTemplateCatalog,
  rascunhoParaCatalog,
  saveTemplateDraft,
  seedTemplates,
  type CatalogTemplate,
  type NovoTemplateInput,
} from "@/lib/meta-templates-store";

type Dest = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  erro: string | null;
};

type Disparo = {
  id: string;
  nome: string;
  inbox_id: number;
  template: string;
  idioma: string;
  status: string;
  arquivo: string | null;
  autor: string | null;
  criado_em: string;
  intervalo_min_s: number;
  intervalo_max_s: number;
  contagem?: {
    pendente: number;
    enviando: number;
    enviado: number;
    falhou: number;
    pulado: number;
    total: number;
  };
  destinatarios?: Dest[];
};

const disparos: Disparo[] = [];

function uid() {
  return crypto.randomUUID?.() ?? `pv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function previewWhatsappInvoke(name: string, body: Record<string, unknown> = {}) {
  if (name === "whatsapp-templates") {
    if (body.action === "criar") {
      const item = rascunhoParaCatalog(body as unknown as NovoTemplateInput);
      saveTemplateDraft(item);
      return { data: { ok: true, status: item.status, template: item }, error: null };
    }
    const fromApi = seedTemplates();
    return {
      data: {
        inbox_id: 1,
        templates: mergeTemplateCatalog(fromApi),
      },
      error: null,
    };
  }

  if (name === "disparos") {
    const action = String(body.action ?? "list");
    if (action === "list") return { data: { disparos: [...disparos] }, error: null };
    if (action === "get") {
      const found = disparos.find((d) => d.id === body.id);
      return { data: found ?? null, error: found ? null : { message: "Campanha não encontrada" } };
    }
    if (action === "criar") {
      const destinatarios = (Array.isArray(body.destinatarios) ? body.destinatarios : []).map((d: Record<string, string>) => ({
        id: uid(),
        nome: String(d.nome ?? ""),
        telefone: String(d.telefone ?? ""),
        status: "pendente",
        erro: null,
      })) as Dest[];
      const row: Disparo = {
        id: uid(),
        nome: String(body.nome ?? "Campanha"),
        inbox_id: 1,
        template: String(body.template ?? ""),
        idioma: String(body.idioma ?? "pt_BR"),
        status: "rascunho",
        arquivo: body.arquivo ? String(body.arquivo) : null,
        autor: "preview@crm.local",
        criado_em: new Date().toISOString(),
        intervalo_min_s: Number(body.intervalo_min_s ?? 5),
        intervalo_max_s: Number(body.intervalo_max_s ?? 7),
        contagem: {
          pendente: destinatarios.length,
          enviando: 0,
          enviado: 0,
          falhou: 0,
          pulado: 0,
          total: destinatarios.length,
        },
        destinatarios,
      };
      disparos.unshift(row);
      return { data: row, error: null };
    }
    if (action === "iniciar") {
      const found = disparos.find((d) => d.id === body.id);
      if (found) found.status = "enviando";
      return { data: found, error: found ? null : { message: "Campanha não encontrada" } };
    }
    if (action === "cancelar") {
      const found = disparos.find((d) => d.id === body.id);
      if (found) found.status = "cancelado";
      return { data: found, error: found ? null : { message: "Campanha não encontrada" } };
    }
    if (action === "excluir") {
      const idx = disparos.findIndex((d) => d.id === body.id);
      if (idx >= 0) disparos.splice(idx, 1);
      return { data: { ok: true }, error: null };
    }
    if (action === "tick") {
      const found = disparos.find((d) => d.id === body.id);
      return { data: { disparo: found }, error: null };
    }
    return { data: { ok: true, preview: true }, error: null };
  }

  if (name === "whatsapp-status") return { data: { conectado: false }, error: null };
  return { data: { ok: true, preview: true }, error: null };
}

export type { CatalogTemplate };
