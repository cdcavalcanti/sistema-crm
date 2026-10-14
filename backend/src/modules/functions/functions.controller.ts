import { Body, Controller, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../../core/auth/public.decorator";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import type { Actor } from "../../core/auth/auth.types";
import { AuthService } from "../identity/application/auth.service";
import { AdsService } from "../ingest/application/ads.service";
import { LeadsService } from "../ingest/application/leads.service";
import { InviteUserDto, UpdateRoleDto } from "../identity/presentation/dto/login.dto";

@Controller("functions")
export class FunctionsController {
  constructor(
    private readonly auth: AuthService,
    private readonly leads: LeadsService,
    private readonly ads: AdsService,
  ) {}

  @Post("create-user")
  createUser(@CurrentUser() actor: Actor, @Body() body: InviteUserDto) {
    return this.auth.invite(actor, body);
  }

  @Post("update-user-role")
  updateRole(@CurrentUser() actor: Actor, @Body() body: UpdateRoleDto) {
    return this.auth.updateRole(actor, body);
  }

  @Public()
  @Post("leads")
  leadsFn(@Body() body: Parameters<LeadsService["criar"]>[0], @Req() req: Request) {
    return this.leads.criar(body, req.ip);
  }

  @Public()
  @Post("lp-intake")
  lp(@Body() body: Parameters<LeadsService["criar"]>[0], @Req() req: Request) {
    return this.leads.criar({ ...body, origem: body.origem || "lp" }, req.ip);
  }

  @Public()
  @Post("indicadores-ads")
  indicadoresAds(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const secret = (req.query.secret as string) || req.headers["x-indicadores-secret"];
    const expected = process.env.INDICADORES_ADS_SECRET;
    if (expected && secret !== expected) throw new UnauthorizedException("unauthorized");
    return this.ads.ingest(body);
  }

  @Public()
  @Post("whatsapp-status")
  waStatus() {
    return { conectado: false };
  }

  @Post(":name")
  fallback(@Param("name") name: string) {
    return { ok: false, error: `function_not_ported:${name}` };
  }
}
