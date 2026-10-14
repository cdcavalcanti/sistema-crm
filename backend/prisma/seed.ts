import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const comercial = await prisma.funil.upsert({
    where: { slug: "comercial" },
    update: {},
    create: { nome: "Comercial", slug: "comercial", cor: "#6D4CFF", ordem: 1, tipo: "vendas" },
  });
  const nps = await prisma.funil.upsert({
    where: { slug: "nps" },
    update: {},
    create: { nome: "NPS / CS", slug: "nps", cor: "#10b981", ordem: 2, tipo: "nps" },
  });
  const diag = await prisma.funil.upsert({
    where: { slug: "diagnostico" },
    update: {},
    create: { nome: "Diagnóstico", slug: "diagnostico", cor: "#0ea5e9", ordem: 3, tipo: "diagnostico" },
  });

  const etapasComercial = [
    { nome: "Lead novo", ordem: 1, cor: "#6D4CFF", tipo: "inicial" },
    { nome: "Qualificação", ordem: 2, cor: "#8b5cf6", tipo: "andamento" },
    { nome: "Reunião", ordem: 3, cor: "#3b82f6", tipo: "andamento" },
    { nome: "Proposta", ordem: 4, cor: "#0ea5e9", tipo: "andamento" },
    { nome: "Ganho", ordem: 5, cor: "#10b981", tipo: "ganho" },
    { nome: "Perdido", ordem: 6, cor: "#ef4444", tipo: "perdido" },
  ];
  if ((await prisma.etapa.count({ where: { funilId: comercial.id } })) === 0) {
    await prisma.etapa.createMany({ data: etapasComercial.map((e) => ({ ...e, funilId: comercial.id })) });
  }
  if ((await prisma.etapa.count({ where: { funilId: nps.id } })) === 0) {
    await prisma.etapa.createMany({
      data: [
        { nome: "Agendamento do onboarding", ordem: 1, cor: "#10b981", tipo: "andamento", funilId: nps.id },
        { nome: "Onboarding realizado", ordem: 2, cor: "#14b8a6", tipo: "andamento", funilId: nps.id },
        { nome: "Entrega de quick-wins", ordem: 3, cor: "#06b6d4", tipo: "andamento", funilId: nps.id },
        { nome: "Entrega do projeto principal", ordem: 4, cor: "#3b82f6", tipo: "andamento", funilId: nps.id },
        { nome: "NPS", ordem: 5, cor: "#6D4CFF", tipo: "ganho", funilId: nps.id },
      ],
    });
  }
  if ((await prisma.etapa.count({ where: { funilId: diag.id } })) === 0) {
    await prisma.etapa.createMany({
      data: [
        { nome: "Entrada do diagnóstico", ordem: 1, cor: "#0ea5e9", tipo: "inicial", funilId: diag.id },
        { nome: "Análise", ordem: 2, cor: "#3b82f6", tipo: "andamento", funilId: diag.id },
        { nome: "Entregue", ordem: 3, cor: "#10b981", tipo: "ganho", funilId: diag.id },
      ],
    });
  }

  await prisma.iaTenantConfig.upsert({
    where: { id: true },
    update: {},
    create: { id: true, persona: "Consultor Vortex", oQuePodePrometer: "Só o que está no CRM." },
  });
  await prisma.lgpdConfig.upsert({
    where: { id: true },
    update: {},
    create: { id: true, texto: "Usamos seus dados para operar o CRM deste contrato.", ativo: true },
  });

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email && password && (await prisma.user.count()) === 0) {
    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        nome: process.env.BOOTSTRAP_ADMIN_NOME || "Admin",
        profile: {
          create: {
            email: email.toLowerCase(),
            nome: process.env.BOOTSTRAP_ADMIN_NOME || "Admin",
            responsavelCrm: "Comercial",
          },
        },
        roles: { create: { role: "super_admin" } },
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
