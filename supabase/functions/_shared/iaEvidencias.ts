// Evidências da IA de leitura: só o que o client (com JWT) já enxerga via RLS.

export type Citacao = {
  tipo: "oportunidade" | "contato" | "tarefa" | "mensagem" | "comentario" | "etapa";
  id: string;
  campo?: string;
  label: string;
};

export type Evidencia = { texto: string; citacoes: Citacao[]; dados: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const MS_DIA = 86_400_000;

function diasAtras(n: number) {
  return new Date(Date.now() - n * MS_DIA).toISOString();
}

export function parsePergunta(texto: string): {
  tipo: "parado" | "sem_atividade" | "soma_etapa" | "ultima_nota" | "esfriou" | "livre";
  dias?: number;
  data?: string;
  responsavel?: string;
} {
  const t = texto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const mDias = t.match(/mais de\s+(\d+)\s+dias?/) || t.match(/(\d+)\s+dias?/);
  const dias = mDias ? Number(mDias[1]) : undefined;
  const mData = texto.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
  let data: string | undefined;
  if (mData) {
    const raw = mData[1];
    if (raw.includes("/")) {
      const [d, m, y] = raw.split("/");
      data = `${y}-${m}-${d}`;
    } else data = raw;
  }
  const mResp = texto.match(/(?:responsavel|do|da)\s+([A-Za-zÁ-ú][\wÁ-ú ]{1,40}?)(?:\s+nao|\s+sem|\s+desde|$)/i);
  const responsavel = mResp?.[1]?.trim();

  if (/esfri|parad|sem mover|nesta etapa/.test(t) && /dias|etapa/.test(t)) {
    return { tipo: /esfri/.test(t) ? "esfriou" : "parado", dias: dias ?? 7 };
  }
  if (/esfri/.test(t)) return { tipo: "esfriou", dias: dias ?? 7 };
  if (/nao tiveram atividade|sem atividade|desde/.test(t) && (data || /responsavel|desde/.test(t))) {
    return { tipo: "sem_atividade", data, responsavel, dias };
  }
  if (/soma|aberto por etapa|por etapa/.test(t)) return { tipo: "soma_etapa" };
  if (/ultima (mensagem|nota)|ultima nota|ultimo comentario/.test(t)) return { tipo: "ultima_nota" };
  if (/parad/.test(t)) return { tipo: "parado", dias: dias ?? 7 };
  return { tipo: "livre", dias, data, responsavel };
}

function aberta(tipo: string | null | undefined) {
  return tipo !== "ganho" && tipo !== "perdido";
}

async function ultimaAtividade(sb: Sb, opp: {
  id: string;
  contato_id: string;
  atualizado_em: string;
  criado_em: string;
}): Promise<{ em: string; fonte: Citacao }> {
  let em = opp.atualizado_em || opp.criado_em;
  let fonte: Citacao = {
    tipo: "oportunidade",
    id: opp.id,
    campo: "atualizado_em",
    label: "atualização do negócio",
  };

  const { data: coms } = await sb
    .from("oportunidade_comentarios")
    .select("id, criado_em, conteudo")
    .eq("oportunidade_id", opp.id)
    .order("criado_em", { ascending: false })
    .limit(1);
  const c = coms?.[0];
  if (c?.criado_em && c.criado_em > em) {
    em = c.criado_em;
    fonte = { tipo: "comentario", id: c.id, campo: "criado_em", label: "nota no negócio" };
  }

  const { data: tars } = await sb
    .from("tarefas")
    .select("id, atualizado_em, criado_em, titulo")
    .eq("oportunidade_id", opp.id)
    .order("atualizado_em", { ascending: false })
    .limit(1);
  const tar = tars?.[0];
  const tarEm = tar?.atualizado_em || tar?.criado_em;
  if (tarEm && tarEm > em) {
    em = tarEm;
    fonte = { tipo: "tarefa", id: tar.id, campo: "atualizado_em", label: tar.titulo || "tarefa" };
  }

  if (opp.contato_id) {
    const { data: convs } = await sb
      .from("conversas")
      .select("id")
      .eq("contato_id", opp.contato_id)
      .limit(5);
    const ids = (convs ?? []).map((x: { id: string }) => x.id);
    if (ids.length) {
      const { data: msgs } = await sb
        .from("mensagens")
        .select("id, criado_em, corpo, direcao")
        .in("conversa_id", ids)
        .order("criado_em", { ascending: false })
        .limit(1);
      const msg = msgs?.[0];
      if (msg?.criado_em && msg.criado_em > em) {
        em = msg.criado_em;
        fonte = { tipo: "mensagem", id: msg.id, campo: "criado_em", label: "mensagem do chat" };
      }
    }
  }
  return { em, fonte };
}

export async function evidenciaParado(sb: Sb, dias: number, etapaId?: string | null): Promise<Evidencia> {
  const corte = diasAtras(dias);
  let q = sb
    .from("oportunidades")
    .select("id, titulo, responsavel, origem, valor, etapa_id, contato_id, criado_em, atualizado_em, etapa:etapas(id, nome, tipo)")
    .order("atualizado_em", { ascending: true });
  if (etapaId) q = q.eq("etapa_id", etapaId);
  const { data, error } = await q;
  if (error) return { texto: "Não consegui ler as oportunidades visíveis neste tenant.", citacoes: [], dados: null };

  const linhas: Array<Record<string, unknown>> = [];
  const citacoes: Citacao[] = [];
  for (const o of data ?? []) {
    if (!aberta(o.etapa?.tipo)) continue;
    const at = await ultimaAtividade(sb, o);
    if (at.em > corte) continue;
    linhas.push({
      id: o.id,
      titulo: o.titulo,
      etapa: o.etapa?.nome ?? null,
      responsavel: o.responsavel ?? null,
      origem: o.origem,
      valor: o.valor,
      ultima_atividade: at.em,
      fonte_atividade: at.fonte,
    });
    citacoes.push({
      tipo: "oportunidade",
      id: o.id,
      campo: "atualizado_em",
      label: o.titulo || o.id,
    });
    citacoes.push(at.fonte);
  }
  return {
    texto: linhas.length
      ? `${linhas.length} negócio(s) visíveis parados há mais de ${dias} dias.`
      : `Nenhum negócio visível parado há mais de ${dias} dias neste recorte.`,
    citacoes,
    dados: { dias, negocios: linhas },
  };
}

export async function evidenciaSemAtividade(
  sb: Sb,
  opts: { data?: string; responsavel?: string; dias?: number },
): Promise<Evidencia> {
  const corte = opts.data
    ? new Date(`${opts.data}T00:00:00`).toISOString()
    : diasAtras(opts.dias ?? 7);
  let q = sb
    .from("oportunidades")
    .select("id, titulo, responsavel, origem, valor, contato_id, criado_em, atualizado_em, etapa:etapas(nome, tipo)");
  if (opts.responsavel) q = q.ilike("responsavel", opts.responsavel.trim());
  const { data, error } = await q;
  if (error) return { texto: "Não consegui ler as oportunidades visíveis.", citacoes: [], dados: null };

  const linhas: Array<Record<string, unknown>> = [];
  const citacoes: Citacao[] = [];
  for (const o of data ?? []) {
    if (!aberta(o.etapa?.tipo)) continue;
    const at = await ultimaAtividade(sb, o);
    if (at.em >= corte) continue;
    linhas.push({
      id: o.id,
      titulo: o.titulo,
      responsavel: o.responsavel,
      etapa: o.etapa?.nome,
      ultima_atividade: at.em,
    });
    citacoes.push({ tipo: "oportunidade", id: o.id, label: o.titulo || o.id, campo: "atualizado_em" });
  }
  const filtro = opts.responsavel ? ` do responsável "${opts.responsavel}"` : "";
  return {
    texto: linhas.length
      ? `${linhas.length} negócio(s)${filtro} sem atividade desde ${corte.slice(0, 10)}.`
      : `Nenhum negócio visível${filtro} sem atividade desde ${corte.slice(0, 10)}.`,
    citacoes,
    dados: { corte, responsavel: opts.responsavel ?? null, negocios: linhas },
  };
}

export async function evidenciaSomaEtapa(sb: Sb): Promise<Evidencia> {
  const { data: etapas, error: e1 } = await sb.from("etapas").select("id, nome, ordem, tipo, cor").order("ordem");
  if (e1) return { texto: "Etapas do pipeline não estão no CRM visível.", citacoes: [], dados: null };
  const { data: opps, error: e2 } = await sb
    .from("oportunidades")
    .select("id, valor, etapa_id, titulo, etapa:etapas(nome, tipo)");
  if (e2) return { texto: "Oportunidades visíveis não puderam ser lidas.", citacoes: [], dados: null };

  const por: Record<string, { etapa_id: string; nome: string; soma: number; qtd: number; sem_valor: number; ids: string[] }> = {};
  for (const e of etapas ?? []) {
    if (!aberta(e.tipo)) continue;
    por[e.id] = { etapa_id: e.id, nome: e.nome, soma: 0, qtd: 0, sem_valor: 0, ids: [] };
  }
  const citacoes: Citacao[] = [];
  for (const o of opps ?? []) {
    if (!aberta(o.etapa?.tipo)) continue;
    const bucket = o.etapa_id && por[o.etapa_id]
      ? por[o.etapa_id]
      : null;
    if (!bucket) continue;
    bucket.qtd += 1;
    bucket.ids.push(o.id);
    if (o.valor == null) bucket.sem_valor += 1;
    else bucket.soma += Number(o.valor) || 0;
    citacoes.push({
      tipo: "oportunidade",
      id: o.id,
      campo: "valor",
      label: o.titulo || o.id,
    });
  }
  const lista = Object.values(por);
  const total = lista.reduce((s, x) => s + x.soma, 0);
  return {
    texto: `Soma em aberto (só negócios visíveis, etapas que não são ganho/perdido): ${total}. Valores nulos não entram na soma — o CRM não inventa número.`,
    citacoes,
    dados: { total, por_etapa: lista },
  };
}

export async function evidenciaUltimaNota(sb: Sb, oportunidadeId: string): Promise<Evidencia> {
  const { data: o, error } = await sb
    .from("oportunidades")
    .select("id, titulo, contato_id, contato:contatos(id, nome)")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (error || !o) {
    return {
      texto: "Este negócio não está visível para o seu papel, ou não está no CRM.",
      citacoes: [],
      dados: null,
    };
  }
  const citacoes: Citacao[] = [{ tipo: "oportunidade", id: o.id, label: o.titulo || o.id }];
  let msg: { id: string; criado_em: string; corpo: string | null; direcao: string } | null = null;
  if (o.contato_id) {
    const { data: convs } = await sb.from("conversas").select("id").eq("contato_id", o.contato_id).limit(8);
    const ids = (convs ?? []).map((c: { id: string }) => c.id);
    if (ids.length) {
      const { data: msgs } = await sb
        .from("mensagens")
        .select("id, criado_em, corpo, direcao")
        .in("conversa_id", ids)
        .order("criado_em", { ascending: false })
        .limit(1);
      msg = msgs?.[0] ?? null;
    }
  }
  const { data: notes } = await sb
    .from("oportunidade_comentarios")
    .select("id, criado_em, conteudo, autor_email")
    .eq("oportunidade_id", o.id)
    .order("criado_em", { ascending: false })
    .limit(1);
  const nota = notes?.[0] ?? null;

  if (!msg && !nota) {
    return {
      texto: "Não há mensagem de chat nem nota deste contato no CRM.",
      citacoes,
      dados: { contato: o.contato, mensagem: null, nota: null },
    };
  }
  const msgEm = msg?.criado_em ?? "";
  const notaEm = nota?.criado_em ?? "";
  const usarMsg = !!msg && (!nota || msgEm >= notaEm);
  if (usarMsg && msg) {
    citacoes.push({ tipo: "mensagem", id: msg.id, campo: "corpo", label: "última mensagem" });
  } else if (nota) {
    citacoes.push({ tipo: "comentario", id: nota.id, campo: "conteudo", label: "última nota" });
  }
  return {
    texto: usarMsg
      ? "A última interação registrada é uma mensagem de chat."
      : "A última interação registrada é uma nota no negócio.",
    citacoes,
    dados: {
      contato: o.contato,
      escolhida: usarMsg ? "mensagem" : "nota",
      mensagem: msg,
      nota,
    },
  };
}

export async function evidenciaLivre(sb: Sb, oportunidadeId?: string | null): Promise<Evidencia> {
  if (oportunidadeId) {
    const { data: o, error } = await sb
      .from("oportunidades")
      .select(
        "id, titulo, valor, origem, responsavel, interesse, criado_em, atualizado_em, data_visita, observacoes, contato_id, contato:contatos(id, nome, email, telefone), etapa:etapas(id, nome, tipo)",
      )
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (error || !o) {
      return { texto: "Este negócio não está visível para o seu papel.", citacoes: [], dados: null };
    }
    const { data: tarefas } = await sb
      .from("tarefas")
      .select("id, titulo, status, due_date, prioridade")
      .eq("oportunidade_id", o.id)
      .in("status", ["aberta", "em_andamento"]);
    const vencidas = (tarefas ?? []).filter((t: { due_date: string | null }) => t.due_date && t.due_date < new Date().toISOString());
    const at = await ultimaAtividade(sb, o);
    return {
      texto: "Ficha do negócio visível (somente campos que existem no CRM).",
      citacoes: [
        { tipo: "oportunidade", id: o.id, label: o.titulo || o.id },
        at.fonte,
        ...vencidas.map((t: { id: string; titulo: string }) => ({
          tipo: "tarefa" as const,
          id: t.id,
          campo: "due_date",
          label: t.titulo,
        })),
      ],
      dados: { negocio: o, ultima_atividade: at, tarefas_abertas: tarefas ?? [], tarefas_vencidas: vencidas },
    };
  }

  const { data: opps } = await sb
    .from("oportunidades")
    .select("id, titulo, valor, origem, responsavel, etapa_id, atualizado_em, etapa:etapas(nome, tipo)")
    .order("atualizado_em", { ascending: false })
    .limit(80);
  const abertas = (opps ?? []).filter((o: { etapa?: { tipo?: string } }) => aberta(o.etapa?.tipo));
  return {
    texto: `${abertas.length} negócio(s) abertos visíveis neste tenant (até 80 mais recentes).`,
    citacoes: abertas.map((o: { id: string; titulo: string | null }) => ({
      tipo: "oportunidade" as const,
      id: o.id,
      label: o.titulo || o.id,
    })),
    dados: { negocios: abertas },
  };
}

export async function reunirEvidencias(
  sb: Sb,
  pergunta: string,
  oportunidadeId?: string | null,
): Promise<{ intent: ReturnType<typeof parsePergunta>; evidencia: Evidencia }> {
  const intent = parsePergunta(pergunta);
  if (intent.tipo === "ultima_nota") {
    if (!oportunidadeId) {
      return {
        intent,
        evidencia: {
          texto: "Para a última mensagem/nota, abra a ficha do negócio. Não está no recorte global.",
          citacoes: [],
          dados: null,
        },
      };
    }
    return { intent, evidencia: await evidenciaUltimaNota(sb, oportunidadeId) };
  }
  if (intent.tipo === "parado" || intent.tipo === "esfriou") {
    let etapaId: string | null = null;
    if (intent.tipo === "parado" && oportunidadeId) {
      const { data: o } = await sb.from("oportunidades").select("etapa_id").eq("id", oportunidadeId).maybeSingle();
      etapaId = o?.etapa_id ?? null;
    }
    return { intent, evidencia: await evidenciaParado(sb, intent.dias ?? 7, etapaId) };
  }
  if (intent.tipo === "sem_atividade") {
    return { intent, evidencia: await evidenciaSemAtividade(sb, intent) };
  }
  if (intent.tipo === "soma_etapa") {
    return { intent, evidencia: await evidenciaSomaEtapa(sb) };
  }
  return { intent, evidencia: await evidenciaLivre(sb, oportunidadeId) };
}

export function respostaDeterministica(pergunta: string, ev: Evidencia): string {
  const d = ev.dados as Record<string, unknown> | null;
  const linhas: string[] = [ev.texto];
  if (!d) {
    linhas.push("Se o dado não está no CRM visível, a resposta para aqui — sem palpite.");
    return linhas.join("\n");
  }
  if (Array.isArray((d as { negocios?: unknown[] }).negocios)) {
    const lista = (d as { negocios: Array<Record<string, unknown>> }).negocios;
    for (const n of lista.slice(0, 30)) {
      linhas.push(
        `- ${n.titulo ?? n.id} · etapa ${n.etapa ?? "—"} · responsável ${n.responsavel ?? "sem responsável"} · origem ${n.origem ?? "—"} · valor ${n.valor ?? "não informado no CRM"} · última atividade ${n.ultima_atividade ?? "—"} [[oportunidade:${n.id}]]`,
      );
    }
  }
  if (Array.isArray((d as { por_etapa?: unknown[] }).por_etapa)) {
    const lista = (d as { por_etapa: Array<Record<string, unknown>> }).por_etapa;
    for (const e of lista) {
      linhas.push(
        `- ${e.nome}: soma ${e.soma} em ${e.qtd} negócio(s); ${e.sem_valor} sem valor preenchido [[etapa:${e.etapa_id}]]`,
      );
    }
    if ((d as { total?: number }).total != null) linhas.push(`Total em aberto citado: ${(d as { total: number }).total} (só valores preenchidos).`);
  }
  if ((d as { mensagem?: unknown }).mensagem || (d as { nota?: unknown }).nota) {
    const msg = d.mensagem as { id?: string; corpo?: string; criado_em?: string; direcao?: string } | null;
    const nota = d.nota as { id?: string; conteudo?: string; criado_em?: string } | null;
    if ((d as { escolhida?: string }).escolhida === "mensagem" && msg) {
      linhas.push(`Mensagem (${msg.direcao ?? "—"} em ${msg.criado_em}): ${msg.corpo || "(sem corpo no CRM)"} [[mensagem:${msg.id}]]`);
    } else if (nota) {
      linhas.push(`Nota em ${nota.criado_em}: ${nota.conteudo || "(vazia)"} [[comentario:${nota.id}]]`);
    }
  }
  linhas.push("Só usei registros que o seu papel consegue ver neste tenant. O que não está no CRM não foi completado.");
  return linhas.join("\n");
}
