import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("hash e verifica", async () => {
    const hash = await hashPassword("segredo-123");
    expect(hash).not.toBe("segredo-123");
    expect(await verifyPassword("segredo-123", hash)).toBe(true);
    expect(await verifyPassword("outra", hash)).toBe(false);
  });
});
