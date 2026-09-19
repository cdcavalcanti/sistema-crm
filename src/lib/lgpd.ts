/**
 * Política de privacidade — texto operacional LGPD (white-label).
 * Troque o controlador e o contato do DPO na instância do cliente.
 * Versão alinhada a lgpd_config.versao_politica.
 */
export const LGPD_VERSAO_PADRAO = "2026-09-19";

export const LGPD_POLITICA = {
  versao: LGPD_VERSAO_PADRAO,
  atualizadoEm: "19/09/2026",
  controlador: "Sistema CRM (operador da instância)",
  secoes: [
    {
      titulo: "1. Quem somos",
      corpo:
        "Este CRM é operado pela organização que contrata/instancia a plataforma, para gestão comercial " +
        "(leads, oportunidades, WhatsApp e tarefas). Essa organização é a controladora dos dados pessoais " +
        "tratados nesta instância, nos termos da Lei nº 13.709/2018 (LGPD).",
    },
    {
      titulo: "2. Quais dados tratamos",
      corpo:
        "Dados de usuários da equipe (nome, e-mail, papel, acessos) e dados de leads/contatos comerciais " +
        "(nome, telefone, e-mail, empresa/organização, segmento, histórico de oportunidades, mensagens de " +
        "WhatsApp/Instagram quando integrados). Não pedimos dados sensíveis de categoria especial como regra de negócio.",
    },
    {
      titulo: "3. Finalidades e bases legais",
      corpo:
        "Tratamos dados para: (a) execução de atividades comerciais e pré-contratuais (art. 7º, V); " +
        "(b) legítimo interesse em CRM B2B e segurança da informação (art. 7º, IX), com avaliação de impacto quando cabível; " +
        "(c) consentimento quando exigido (ex.: analytics não essenciais); " +
        "(d) cumprimento de obrigação legal ou regulatória, quando aplicável.",
    },
    {
      titulo: "4. Compartilhamento",
      corpo:
        "Utilizamos operadores de infraestrutura (ex.: Supabase, provedores de e-mail/hospedagem, " +
        "WhatsApp via provedores autorizados, Google Calendar quando conectado). Dados não são vendidos. " +
        "Transferências internacionais, se houver, observam salvaguardas da LGPD.",
    },
    {
      titulo: "5. Retenção",
      corpo:
        "Mantemos dados pelo tempo necessário às finalidades comerciais e obrigações legais. " +
        "A retenção padrão de leads é configurável no painel LGPD (padrão ~5 anos). Após isso, " +
        "promovemos exclusão ou anonimização, salvo guarda legal.",
    },
    {
      titulo: "6. Direitos do titular",
      corpo:
        "Você pode solicitar confirmação de tratamento, acesso, correção, anonimização/exclusão, " +
        "portabilidade e oposição, pelos canais do Encarregado (DPO) ou pelo painel administrativo LGPD " +
        "(equipe autorizada). Responderemos no prazo legal.",
    },
    {
      titulo: "7. Segurança",
      corpo:
        "Aplicamos controle de acesso (papéis), registro de auditoria, comunicação criptografada (HTTPS) " +
        "e segregação de ambientes. Nenhum sistema é 100% seguro; reportamos incidentes relevantes conforme a lei.",
    },
    {
      titulo: "8. Contato do Encarregado (DPO)",
      corpo:
        "Para exercer direitos LGPD, use o e-mail do DPO configurado em Administração → LGPD " +
        "(preencha na instância do cliente; não use o e-mail de outro produto).",
    },
  ],
} as const;
