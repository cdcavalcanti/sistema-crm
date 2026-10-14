// Aviso comercial quando entra um lead/agendamento.
// Envia via WAHA a partir do número notificador para o WhatsApp do comercial.
// Best-effort: uma falha aqui NÃO deve impedir a criação do lead.

export type AvisoSecretaria = {
  tipo: "lead" | "agendamento";
  nome: string;
  telefone?: string | null;
  email?: string | null;
  nome_estabelecimento?: string | null;
  anos_operacao?: number | null;
  segmento?: string | null;
  origem?: string | null;
  data_visita?: string | null;
};

function fmtTel(tel?: string | null): string {
  if (!tel) return "—";
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

function fmtDataHora(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function montarTexto(a: AvisoSecretaria): string {
  const linhas: string[] = ["*✅ NEURO FOOD ✅*", ""];
  if (a.tipo === "agendamento") {
    linhas.push("📅 *Nova demo / visita agendada*");
  } else {
    linhas.push("🆕 *Novo lead cadastrado*");
  }
  linhas.push("━━━━━━━━━━━━━━━");
  linhas.push(`👤 *Nome:* ${a.nome || "—"}`);
  linhas.push(`📱 *Telefone:* ${fmtTel(a.telefone)}`);
  if (a.email) linhas.push(`📧 *E-mail:* ${a.email}`);
  if (a.nome_estabelecimento) linhas.push(`🍽️ *Estabelecimento:* ${a.nome_estabelecimento}${a.anos_operacao ? ` (${a.anos_operacao} anos)` : ""}`);
  if (a.segmento) linhas.push(`🏷️ *Segmento:* ${a.segmento}`);
  if (a.tipo === "agendamento" && a.data_visita) linhas.push(`📆 *Data da visita:* ${fmtDataHora(a.data_visita)}`);
  if (a.origem) linhas.push(`🌐 *Origem:* ${a.origem}`);
  return linhas.join("\n");
}

export async function avisarSecretaria(a: AvisoSecretaria): Promise<boolean> {
  if (Deno.env.get("AVISO_SECRETARIA_ATIVO") === "0") return false;
  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  // envia do número notificador (mesmo dos alertas) para o WhatsApp do comercial
  const session = Deno.env.get("ALERTA_WAHA_SESSION") ?? Deno.env.get("WAHA_SESSION") ?? "default";
  const chatId = Deno.env.get("SECRETARIA_CHATID") ?? "554891630277@c.us";
  if (!wahaUrl || !wahaKey) return false;
  try {
    const r = await fetch(`${wahaUrl}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
      body: JSON.stringify({ session, chatId, text: montarTexto(a) }),
    });
    return r.ok;
  } catch (e) {
    console.error("avisar_secretaria_falhou", e);
    return false;
  }
}
