import { describe, expect, it } from "vitest";
import { prepararDestinatarios } from "./disparoPlanilha";
import { paraE164 } from "./telefoneDisparo";

describe("paraE164", () => {
  it("aceita celular BR sem DDI", () => {
    expect(paraE164("11999990000", "BR")).toBe("5511999990000");
  });
  it("recusa número inválido em BR", () => {
    expect(paraE164("123", "BR")).toBeNull();
  });
});

describe("prepararDestinatarios", () => {
  it("monta lista e reporta erros por linha", () => {
    const r = prepararDestinatarios({
      linhas: [
        { nome: "Maria", telefone: "11999990000", v1: "Oi" },
        { nome: "", telefone: "11999990001", v1: "x" },
        { nome: "João", telefone: "11999990000", v1: "dup" },
      ],
      colunaNome: "nome",
      colunaTelefone: "telefone",
      origensVariaveis: [{ coluna: "v1" }],
      totalVariaveis: 1,
      pais: "BR",
    });
    expect(r.destinatarios).toHaveLength(1);
    expect(r.destinatarios[0].telefone).toBe("5511999990000");
    expect(r.erros.some((e) => e.motivo === "nome_vazio")).toBe(true);
    expect(r.duplicados).toBe(1);
  });
});
