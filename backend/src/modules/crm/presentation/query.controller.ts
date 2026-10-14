import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../../../core/auth/current-user.decorator";
import type { Actor } from "../../../core/auth/auth.types";
import { QueryService } from "../application/query.service";
import { QueryDto } from "./dto/query.dto";

@Controller()
export class QueryController {
  constructor(private readonly queries: QueryService) {}

  @Post("query")
  query(@CurrentUser() actor: Actor, @Body() body: QueryDto) {
    return this.queries.run(actor, body);
  }

  @Post("rpc/:name")
  rpc(@CurrentUser() actor: Actor, @Param("name") name: string, @Body() body: Record<string, unknown>) {
    return this.queries.rpc(actor, name, body ?? {});
  }

  @Get("me/carteira")
  carteira(@CurrentUser() actor: Actor) {
    return { responsavel_crm: actor.responsavelCrm, roles: actor.roles };
  }
}
