import { podeVerCarteira } from "./carteira.policy";
import type { Actor } from "../../../core/auth/auth.types";

const vendedor: Actor = {
  id: "1",
  email: "a@b.c",
  nome: "A",
  roles: ["usuario"],
  responsavelCrm: "Comercial",
};

const admin: Actor = {
  id: "2",
  email: "admin@b.c",
  nome: "Admin",
  roles: ["admin"],
  responsavelCrm: "CS",
};

describe("podeVerCarteira", () => {
  it("admin vê qualquer carteira", () => {
    expect(podeVerCarteira(admin, "Outro")).toBe(true);
  });

  it("vendedor só vê a própria", () => {
    expect(podeVerCarteira(vendedor, "Comercial")).toBe(true);
    expect(podeVerCarteira(vendedor, "CS")).toBe(false);
  });

  it("sem responsável é visível", () => {
    expect(podeVerCarteira(vendedor, null)).toBe(true);
    expect(podeVerCarteira(vendedor, "  ")).toBe(true);
  });
});
