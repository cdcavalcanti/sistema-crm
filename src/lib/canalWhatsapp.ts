/** Status unificado do canal WhatsApp comercial (sessão + templates oficiais). */
export type CanalWhatsappStatus = {
  sessao_ok: boolean;
  sessao_rotulo: string;
  numero: string | null;
  templates_ok: boolean | null; // null = não checado
  templates_rotulo: string;
};

export function rotuloSessaoWhatsapp(status: string | undefined): string {
  const s = (status ?? "").toUpperCase();
  if (s.includes("SCAN") || s.includes("QR")) return "Aguardando QR";
  if (s.includes("START") || s.includes("INIT") || s.includes("OPENING")) return "Conectando";
  if (s.includes("FAIL") || s.includes("ERROR")) return "Falha na conexão";
  if (s.includes("STOP") || s.includes("CLOSE") || s.includes("LOGOUT")) return "Desconectado";
  if (s.includes("WORKING") || s.includes("ONLINE") || s.includes("AUTH")) return "Online";
  return status ? "Verificar conexão" : "Desconhecido";
}

export function resumoCanal(c: CanalWhatsappStatus): {
  ok: boolean;
  titulo: string;
  detalhe: string;
} {
  if (!c.sessao_ok) {
    return {
      ok: false,
      titulo: "WhatsApp comercial fora",
      detalhe: `${c.sessao_rotulo}. Reconecte no Chat.`,
    };
  }
  if (c.templates_ok === false) {
    return {
      ok: false,
      titulo: "Templates oficiais indisponíveis",
      detalhe: c.templates_rotulo,
    };
  }
  return {
    ok: true,
    titulo: "WhatsApp comercial OK",
    detalhe: c.numero
      ? `Número ${c.numero}${c.templates_ok ? " · templates OK" : ""}`
      : c.templates_rotulo,
  };
}
