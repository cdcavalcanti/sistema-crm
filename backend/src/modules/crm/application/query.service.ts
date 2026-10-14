import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isAdmin, type Actor } from "../../../core/auth/auth.types";
import { PrismaService } from "../../../core/database/prisma.service";
import { isKnownTable, TABLE_REGISTRY } from "../domain/table-registry";
import { RecordsRepository, type FilterOp, type QueryInput } from "../infrastructure/records.repository";
import { carteiraWhere } from "./carteira.policy";

@Injectable()
export class QueryService {
  constructor(
    private readonly records: RecordsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async run(actor: Actor, input: QueryInput) {
    if (!isKnownTable(input.table)) {
      throw new NotFoundException(`unknown_table:${input.table}`);
    }
    const meta = TABLE_REGISTRY[input.table];
    const write = input.op !== "select";
    if (write && meta.adminWrite && !isAdmin(actor)) {
      throw new ForbiddenException("admin_only");
    }

    const extraWhere = await this.scopeWhere(actor, input.table);
    const result = await this.records.execute({ ...input, extraWhere });
    return result;
  }

  async rpc(actor: Actor, name: string, args: Record<string, unknown> = {}) {
    switch (name) {
      case "registrar_acesso":
        await this.prisma.profile.updateMany({
          where: { userId: actor.id },
          data: { ultimoAcesso: new Date() },
        });
        return null;
      case "has_role":
        return actor.roles.includes(String(args._role) as Actor["roles"][number]);
      case "is_admin_or_super":
        return isAdmin(actor);
      case "meu_responsavel_crm":
        return actor.responsavelCrm;
      case "pode_ver_carteira":
        return isAdmin(actor) || !args._responsavel || args._responsavel === actor.responsavelCrm;
      default:
        return null;
    }
  }

  private async scopeWhere(actor: Actor, table: string): Promise<Record<string, unknown> | undefined> {
    const meta = TABLE_REGISTRY[table];
    if (!meta.carteiraField || isAdmin(actor)) return undefined;
    if (meta.carteiraField === "responsavel") {
      return carteiraWhere(actor);
    }
    const ids = await this.prisma.oportunidade.findMany({
      where: carteiraWhere(actor) ?? {},
      select: { id: true },
    });
    return {
      OR: [{ oportunidadeId: null }, { oportunidadeId: { in: ids.map((o) => o.id) } }],
    };
  }
}

export type { FilterOp };
