// Módulo compartilhado de criação de lead (contato + oportunidade) no Supabase
// do Sistema CRM. Espelha a lógica da função `leads` para ser reutilizado pelas
// integrações em código (lp-intake, meta-leads).
//
// Recebe um client já criado com service role e um payload normalizado.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type LeadInput = {
  origem: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  nome_estabelecimento?: string | null;
  anos_operacao?: number | null;
  segmento?: string | null; // vira contatos.segmento + oportunidades.interesse
  responsavel?: string | null;
  etapa?: string | null; // nome da etapa; default "Lead novo"
  observacoes?: string | null;
  metadados?: Record<string, unknown>;
};

export type LeadResult = {
  contato_id: string;
  oportunidade_id: string;
  contato_criado: boolean;
  etapa: string;
  // true quando o telefone/e-mail é de cliente já ativo → não cadastra no CRM.
  ignorado?: boolean;
};

export function normalizeEmail(email?: string | null) {
  if (!email) return null;
  return email.toLowerCase().trim();
}

function normalizeEtapaName(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export async function criarLead(supabase: SupabaseClient, data: LeadInput): Promise<LeadResult> {
  const email = normalizeEmail(data.email);

  // -------- Upsert contato (chave: email) --------
  let contatoId: string;
  let contatoCriado = false;

  const camposContato = {
    nome: data.nome,
    telefone: data.telefone ?? null,
    nome_estabelecimento: data.nome_estabelecimento ?? null,
    anos_operacao: data.anos_operacao ?? null,
    segmento: data.segmento ?? null,
  };

  const telDigits = (data.telefone ?? "").replace(/\D/g, "");
  const selectContato = "id, nome, telefone, email, nome_estabelecimento, anos_operacao, segmento";

  // -------- Cliente já ativo / já é cliente ativo não vira lead --------
  // Casa por TELEFONE (últimos 8 dígitos) OU E-MAIL contra a blocklist de
  // clientes ativos. Se qualquer um bater, não cadastra nada no CRM (só
  // registra no audit). O e-mail cobre o caso de a pessoa usar um telefone
  // diferente do cadastrado.
  let matriculado = false;
  if (telDigits.length >= 8) {
    const { data: t } = await supabase
      .from("telefones_matriculados").select("id").eq("sufixo8", telDigits.slice(-8)).limit(1).maybeSingle();
    if (t) matriculado = true;
  }
  if (!matriculado && email) {
    const { data: e } = await supabase
      .from("emails_matriculados").select("id").eq("email", email).limit(1).maybeSingle();
    if (e) matriculado = true;
  }
  if (matriculado) {
    await supabase.from("audit_logs").insert({
      user_id: null,
      actor_email: `webhook:${data.origem}`,
      acao: "lead.ignorado_matriculado",
      entidade: "contatos",
      entidade_id: null,
      detalhes: { origem: data.origem, telefone: data.telefone, email, nome: data.nome },
    });
    return { contato_id: "", oportunidade_id: "", contato_criado: false, etapa: "", ignorado: true };
  }

  // Dedupe: 1) por e-mail; 2) se não achar, por telefone (últimos 8 dígitos).
  // Evita contatos duplicados quando a mesma pessoa entra por canais diferentes
  // (ex.: Meta com um e-mail e Agenda com outro, mas o mesmo número).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existing: any = null;
  if (email) {
    const { data: e } = await supabase.from("contatos").select(selectContato).eq("email", email).maybeSingle();
    existing = e ?? null;
  }
  if (!existing && telDigits.length >= 8) {
    const { data: e } = await supabase
      .from("contatos").select(selectContato)
      // casa pela coluna normalizada (só dígitos) — independe da formatação salva
      .ilike("telefone_digits", `%${telDigits.slice(-8)}%`)
      .order("criado_em", { ascending: true }).limit(1).maybeSingle();
    existing = e ?? null;
  }

  if (existing) {
    contatoId = existing.id;
    await supabase
      .from("contatos")
      .update({
        nome: existing.nome || camposContato.nome,
        telefone: existing.telefone ?? camposContato.telefone,
        email: existing.email ?? email,
        nome_estabelecimento: camposContato.nome_estabelecimento ?? existing.nome_estabelecimento,
        anos_operacao: camposContato.anos_operacao ?? existing.anos_operacao,
        segmento: camposContato.segmento ?? existing.segmento,
      })
      .eq("id", contatoId);
  } else {
    const { data: novo, error } = await supabase
      .from("contatos")
      .insert({ ...camposContato, email })
      .select("id")
      .single();
    if (error || !novo) throw error ?? new Error("contato_insert_failed");
    contatoId = novo.id;
    contatoCriado = true;
  }

  // -------- Uma oportunidade por contato --------
  // Se o contato já tem uma oportunidade ABERTA (etapa que não é ganho/perdido),
  // não cria outra: registra a reentrada como comentário na timeline e guarda a
  // nova origem em metadados.origens (histórico de canais por onde ele voltou).
  const { data: oppsContato } = await supabase
    .from("oportunidades")
    .select("id, metadados, etapa:etapas(nome, tipo)")
    .eq("contato_id", contatoId)
    .order("criado_em", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aberta = (oppsContato ?? []).find((o: any) => {
    const t = o.etapa?.tipo;
    return t !== "ganho" && t !== "perdido";
  });

  if (aberta) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md: Record<string, any> = aberta.metadados ?? {};
    const origensAntes = Array.isArray(md.origens) ? md.origens : [];
    const origens = [...origensAntes, { origem: data.origem, em: new Date().toISOString() }];
    await supabase.from("oportunidades").update({ metadados: { ...md, origens } }).eq("id", aberta.id);

    await supabase.from("oportunidade_comentarios").insert({
      oportunidade_id: aberta.id,
      user_id: null,
      autor_email: `webhook:${data.origem}`,
      autor_nome: "Automático",
      conteudo: `🔁 Este contato entrou novamente — origem: *${data.origem}*.` +
        ` Oportunidade mantida (uma por contato); confira se é a mesma intenção.`,
    });

    await supabase.from("audit_logs").insert({
      user_id: null,
      actor_email: `webhook:${data.origem}`,
      acao: "lead.reentrada",
      entidade: "oportunidades",
      entidade_id: aberta.id,
      detalhes: { origem: data.origem, contato_id: contatoId, origens: origens.length },
    });

    return {
      contato_id: contatoId,
      oportunidade_id: aberta.id,
      contato_criado: contatoCriado,
      etapa: aberta.etapa?.nome ?? "",
    };
  }

  // -------- Resolver etapa (default "Lead novo") --------
  const etapaPedida = (data.etapa ?? "Lead novo").trim();
  const { data: etapasAll } = await supabase
    .from("etapas")
    .select("id, nome, ordem")
    .order("ordem", { ascending: true });
  const etapasList = (etapasAll ?? []) as Array<{ id: string; nome: string; ordem: number }>;
  const alvo = normalizeEtapaName(etapaPedida);
  const etapaMatch = etapasList.find((e) => normalizeEtapaName(e.nome) === alvo);
  const etapa = etapaMatch ?? etapasList[0] ?? null;
  const etapaNome = etapa?.nome ?? etapaPedida;

  // -------- Criar oportunidade --------
  const { data: oportunidade, error: oppErr } = await supabase
    .from("oportunidades")
    .insert({
      contato_id: contatoId,
      titulo: data.nome,
      interesse: data.segmento ?? null,
      nome_estabelecimento: data.nome_estabelecimento ?? null,
      anos_operacao: data.anos_operacao ?? null,
      descricao: data.observacoes ?? null,
      origem: data.origem,
      etapa_id: etapa?.id ?? null,
      observacoes: data.observacoes ?? null,
      responsavel: data.responsavel ?? null,
      metadados: data.metadados ?? {},
    })
    .select("id")
    .single();
  if (oppErr || !oportunidade) throw oppErr ?? new Error("oportunidade_insert_failed");

  // -------- Audit log --------
  await supabase.from("audit_logs").insert({
    user_id: null,
    actor_email: `webhook:${data.origem}`,
    acao: "lead.recebido",
    entidade: "oportunidades",
    entidade_id: oportunidade.id,
    detalhes: { origem: data.origem, email, contato_criado: contatoCriado, etapa: etapaNome },
  });

  return {
    contato_id: contatoId,
    oportunidade_id: oportunidade.id,
    contato_criado: contatoCriado,
    etapa: etapaNome,
  };
}
