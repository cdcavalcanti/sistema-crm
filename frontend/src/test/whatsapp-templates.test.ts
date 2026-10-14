// Testa o parser/renderer de templates do WhatsApp.
//
// Este módulo é a fonte da verdade: o preview do chat usa ele direto, e as
// duas edge functions carregam uma cópia embutida (o editor do dashboard do
// Supabase não aceita arquivo compartilhado). Estes testes valem pelos três.
import { describe, expect, it } from "vitest";
import {
  approvedTemplates,
  extractPlaceholders,
  parseTemplate,
  pickWhatsappInbox,
  renderTemplate,
  sanitizeParam,
  type RawTemplate,
} from "@/lib/whatsappTemplates";

const positional: RawTemplate = {
  name: "orcamento_pronto",
  language: "pt_BR",
  status: "APPROVED",
  category: "UTILITY",
  components: [
    { type: "HEADER", format: "TEXT", text: "Vai Xorá Tintas" },
    { type: "BODY", text: "Oi {{1}}, seu orçamento nº {{2}} está pronto!" },
    { type: "FOOTER", text: "Responda para falar com um consultor." },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Quero ver" }] },
  ],
};

describe("extractPlaceholders", () => {
  it("captura na ordem e sem repetir", () => {
    expect(extractPlaceholders("{{2}} e {{1}} e {{2}}")).toEqual(["2", "1"]);
  });

  it("aceita espaço interno e nome", () => {
    expect(extractPlaceholders("Oi {{ nome }}")).toEqual(["nome"]);
  });

  it("texto sem variável devolve vazio", () => {
    expect(extractPlaceholders("sem variavel")).toEqual([]);
    expect(extractPlaceholders(null)).toEqual([]);
  });
});

describe("parseTemplate", () => {
  it("extrai corpo, variáveis e botões", () => {
    const t = parseTemplate(positional)!;
    expect(t.variables).toEqual(["1", "2"]);
    expect(t.named).toBe(false);
    expect(t.header_text).toBe("Vai Xorá Tintas");
    expect(t.footer_text).toBe("Responda para falar com um consultor.");
    expect(t.buttons).toEqual(["Quero ver"]);
    expect(t.supported).toBe(true);
  });

  it("detecta NAMED pelo parameter_format", () => {
    const t = parseTemplate({
      ...positional,
      parameter_format: "NAMED",
      components: [{ type: "BODY", text: "Oi {{nome}}" }],
    })!;
    expect(t.named).toBe(true);
    expect(t.variables).toEqual(["nome"]);
  });

  // Instância antiga do Chatwoot pode não mandar parameter_format; o
  // placeholder não-numérico é a evidência.
  it("infere NAMED sem parameter_format", () => {
    const t = parseTemplate({
      ...positional,
      components: [{ type: "BODY", text: "Oi {{nome}}" }],
    })!;
    expect(t.named).toBe(true);
  });

  it("marca header de mídia como não suportado", () => {
    const t = parseTemplate({
      ...positional,
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Olá {{1}}" },
      ],
    })!;
    expect(t.supported).toBe(false);
    expect(t.unsupported_reason).toBe("media_header");
  });

  it("marca variável no header como não suportado", () => {
    const t = parseTemplate({
      ...positional,
      components: [
        { type: "HEADER", format: "TEXT", text: "Pedido {{1}}" },
        { type: "BODY", text: "Olá" },
      ],
    })!;
    expect(t.supported).toBe(false);
    expect(t.unsupported_reason).toBe("header_variables");
  });

  it("marca botão com URL dinâmica como não suportado", () => {
    const t = parseTemplate({
      ...positional,
      components: [
        { type: "BODY", text: "Olá" },
        {
          type: "BUTTONS",
          buttons: [{ type: "URL", text: "Rastrear", url: "https://x.com/{{1}}" }],
        },
      ],
    })!;
    expect(t.supported).toBe(false);
    expect(t.unsupported_reason).toBe("button_variables");
  });

  it("descarta template sem corpo", () => {
    expect(parseTemplate({ name: "x", language: "pt_BR", components: [] })).toBeNull();
    expect(parseTemplate({ language: "pt_BR" })).toBeNull();
  });
});

describe("approvedTemplates", () => {
  const copy01 = { ...positional, name: "contato_copy01" };
  const copy02 = { ...positional, name: "contato_copy02" };

  // O Chatwoot guarda a resposta da Meta verbatim: vem PENDING e REJECTED
  // junto. Se vazasse pra UI, o consultor escolheria um template que a Meta
  // recusa na hora do envio.
  it("filtra só APPROVED", () => {
    const list = approvedTemplates({
      message_templates: [
        copy01,
        { ...copy02, status: "PENDING" },
        { ...copy02, status: "REJECTED" },
      ],
    });
    expect(list.map((t) => t.name)).toEqual(["contato_copy01"]);
  });

  // CRM: allowlist vazia = todos os APPROVED. Com allowlist explícita,
  // só os nomes listados passam (estilo Vai Xorá).
  it("sem allowlist, passa todos os APPROVED", () => {
    const list = approvedTemplates({
      message_templates: [
        copy01,
        copy02,
        { ...positional, name: "orcamento_pronto" },
        { ...positional, name: "campanha_natal" },
      ],
    });
    expect(list.map((t) => t.name)).toEqual([
      "contato_copy01",
      "contato_copy02",
      "orcamento_pronto",
      "campanha_natal",
    ]);
  });

  it("com allowlist, restringe aos nomes informados", () => {
    const list = approvedTemplates(
      {
        message_templates: [
          copy01,
          copy02,
          { ...positional, name: "orcamento_pronto" },
        ],
      },
      ["contato_copy01", "contato_copy02"],
    );
    expect(list.map((t) => t.name)).toEqual(["contato_copy01", "contato_copy02"]);
  });

  it("ignora caixa e espaço no nome da allowlist", () => {
    const list = approvedTemplates(
      { message_templates: [{ ...positional, name: " Contato_Copy01 " }] },
      ["contato_copy01"],
    );
    expect(list).toHaveLength(1);
  });

  it("aprovado fora da allowlist não passa", () => {
    expect(
      approvedTemplates({ message_templates: [positional] }, ["contato_copy01"]),
    ).toEqual([]);
  });

  it("inbox sem templates devolve vazio", () => {
    expect(approvedTemplates({})).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("substitui variáveis e junta header/body/footer", () => {
    const t = parseTemplate(positional)!;
    expect(renderTemplate(t, { "1": "João", "2": "123" })).toBe(
      "Vai Xorá Tintas\n\nOi João, seu orçamento nº 123 está pronto!\n\nResponda para falar com um consultor.",
    );
  });

  it("mantém o placeholder quando falta valor", () => {
    const t = parseTemplate({ ...positional, components: [{ type: "BODY", text: "Oi {{1}}" }] })!;
    expect(renderTemplate(t, {})).toBe("Oi {{1}}");
  });

  // O preview usa esta função enquanto o consultor digita: valor vazio (ou só
  // espaço) tem que continuar mostrando {{1}}, senão some da tela o que falta
  // preencher. No servidor esse caso já foi barrado antes de renderizar.
  it("trata valor vazio ou em branco como ausente", () => {
    const t = parseTemplate({ ...positional, components: [{ type: "BODY", text: "Oi {{1}}" }] })!;
    expect(renderTemplate(t, { "1": "" })).toBe("Oi {{1}}");
    expect(renderTemplate(t, { "1": "   " })).toBe("Oi {{1}}");
  });

  it("substitui todas as ocorrências da mesma variável", () => {
    const t = parseTemplate({
      ...positional,
      components: [{ type: "BODY", text: "{{1}} e {{1}}" }],
    })!;
    expect(renderTemplate(t, { "1": "X" })).toBe("X e X");
  });
});

describe("sanitizeParam", () => {
  // A Meta rejeita parâmetro com quebra de linha/tab.
  it("achata espaços e newlines", () => {
    expect(sanitizeParam("  a\n\nb\tc  ")).toBe("a b c");
  });

  it("remove < > \" '", () => {
    expect(sanitizeParam('<b>"João\'s"</b>')).toBe("bJoãos/b");
  });

  it("trunca em 1000 chars", () => {
    expect(sanitizeParam("x".repeat(1500)).length).toBe(1000);
  });
});

describe("pickWhatsappInbox", () => {
  const wa = { id: 143, channel_type: "Channel::Whatsapp" };
  const web = { id: 9, channel_type: "Channel::WebWidget" };

  it("acha pelo id", () => {
    expect(pickWhatsappInbox([web, wa], 143)).toBe(wa);
  });

  it("ignora inbox que não é whatsapp mesmo com id batendo", () => {
    expect(pickWhatsappInbox([web], 9)).toBeNull();
  });

  it("sem id, resolve se só existe um whatsapp", () => {
    expect(pickWhatsappInbox([web, wa], null)).toBe(wa);
  });

  it("sem id e com vários whatsapp, não chuta", () => {
    expect(pickWhatsappInbox([wa, { id: 2, channel_type: "Channel::Whatsapp" }], null)).toBeNull();
  });
});
