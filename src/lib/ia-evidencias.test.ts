import { describe, expect, it } from "vitest";
import { parsePergunta } from "@/lib/ia-evidencias";

describe("parsePergunta", () => {
  it("detecta parado nesta etapa", () => {
    const r = parsePergunta("O que está parado há mais de 7 dias nesta etapa?");
    expect(r.tipo).toBe("parado");
    expect(r.dias).toBe(7);
  });

  it("detecta sem atividade do responsável desde uma data", () => {
    const r = parsePergunta("Quais negócios do Comercial não tiveram atividade desde 01/09/2026?");
    expect(r.tipo).toBe("sem_atividade");
    expect(r.data).toBe("2026-09-01");
    expect(r.responsavel?.toLowerCase()).toContain("comercial");
  });

  it("detecta soma por etapa", () => {
    expect(parsePergunta("Qual a soma em aberto por etapa, neste pipeline?").tipo).toBe("soma_etapa");
  });

  it("detecta última mensagem ou nota", () => {
    expect(parsePergunta("Qual foi a última mensagem ou nota deste contato?").tipo).toBe("ultima_nota");
  });

  it("detecta o que esfriou", () => {
    const r = parsePergunta("O que esfriou há mais de 14 dias?");
    expect(r.tipo).toBe("esfriou");
    expect(r.dias).toBe(14);
  });
});
