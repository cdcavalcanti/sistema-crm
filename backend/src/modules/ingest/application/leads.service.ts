import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/database/prisma.service";

export type LeadInput = {
  origem: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  nome_estabelecimento?: string | null;
  anos_operacao?: number | null;
  segmento?: string | null;
  responsavel?: string | null;
  etapa?: string | null;
  observacoes?: string | null;
  metadados?: Record<string, unknown>;
};

function norm(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(data: LeadInput, ip?: string) {
    const email = data.email?.trim().toLowerCase() || null;
    const telDigits = (data.telefone ?? "").replace(/\D/g, "");

    if (telDigits.length >= 8) {
      const hit = await this.prisma.telefoneMatriculado.findUnique({
        where: { sufixo8: telDigits.slice(-8) },
      });
      if (hit) return this.ignore(data, ip, "telefone");
    }
    if (email) {
      const hit = await this.prisma.emailMatriculado.findUnique({ where: { email } });
      if (hit) return this.ignore(data, ip, "email");
    }

    let contato = email ? await this.prisma.contato.findUnique({ where: { email } }) : null;
    let contatoCriado = false;
    if (!contato) {
      contato = await this.prisma.contato.create({
        data: {
          nome: data.nome,
          email,
          telefone: data.telefone ?? null,
          nomeEstabelecimento: data.nome_estabelecimento ?? null,
          anosOperacao: data.anos_operacao ?? null,
          segmento: data.segmento ?? null,
          observacoes: data.observacoes ?? null,
        },
      });
      contatoCriado = true;
    }

    const etapas = await this.prisma.etapa.findMany({ include: { funil: true } });
    const wanted = norm(data.etapa || "Lead novo");
    const etapa =
      etapas.find((e) => norm(e.nome) === wanted) ??
      etapas.filter((e) => e.funil?.slug === "comercial").sort((a, b) => a.ordem - b.ordem)[0] ??
      etapas.sort((a, b) => a.ordem - b.ordem)[0];

    const opp = await this.prisma.oportunidade.create({
      data: {
        contatoId: contato.id,
        titulo: data.nome,
        origem: data.origem,
        interesse: data.segmento ?? null,
        nomeEstabelecimento: data.nome_estabelecimento ?? null,
        anosOperacao: data.anos_operacao ?? null,
        etapaId: etapa?.id ?? null,
        funilId: etapa?.funilId ?? null,
        responsavel: data.responsavel ?? null,
        observacoes: data.observacoes ?? null,
        metadados: (data.metadados ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.entradaLog.create({
      data: {
        canal: "leads",
        origem: data.origem,
        payload: data as unknown as Prisma.InputJsonValue,
        contatoId: contato.id,
        oportunidadeId: opp.id,
        ip: ip ?? null,
      },
    });

    return {
      contato_id: contato.id,
      oportunidade_id: opp.id,
      contato_criado: contatoCriado,
      etapa: etapa?.nome ?? null,
    };
  }

  private async ignore(data: LeadInput, ip: string | undefined, via: string) {
    await this.prisma.auditLog.create({
      data: {
        actorEmail: `webhook:${data.origem}`,
        acao: "lead.ignorado_matriculado",
        entidade: "contatos",
        detalhes: { via, origem: data.origem } as Prisma.InputJsonValue,
        ip: ip ?? null,
      },
    });
    return { ignorado: true, via };
  }
}
