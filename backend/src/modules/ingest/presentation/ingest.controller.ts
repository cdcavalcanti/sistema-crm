import { Body, Controller, Get, Headers, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../../../core/auth/public.decorator";
import { AdsService } from "../application/ads.service";
import { LeadsService, type LeadInput } from "../application/leads.service";

@Controller("ingest")
export class IngestController {
  constructor(
    private readonly leads: LeadsService,
    private readonly ads: AdsService,
  ) {}

  @Public()
  @Post("leads")
  async leadsPost(@Body() body: LeadInput, @Req() req: Request, @Headers("x-ingest-secret") headerSecret?: string, @Query("secret") qSecret?: string) {
    this.assertSecret(process.env.INGEST_LEADS_SECRET, headerSecret ?? qSecret);
    return this.leads.criar(body, req.ip);
  }

  @Public()
  @Post("lp")
  async lp(@Body() body: LeadInput, @Req() req: Request, @Headers("x-ingest-secret") headerSecret?: string, @Query("secret") qSecret?: string) {
    this.assertSecret(process.env.INGEST_LEADS_SECRET, headerSecret ?? qSecret);
    return this.leads.criar({ ...body, origem: body.origem || "lp" }, req.ip);
  }

  @Public()
  @Post("indicadores-ads")
  async adsPost(
    @Body() body: Record<string, unknown>,
    @Headers("x-indicadores-secret") headerSecret?: string,
    @Query("secret") qSecret?: string,
  ) {
    this.assertSecret(process.env.INDICADORES_ADS_SECRET || process.env.INGEST_LEADS_SECRET, headerSecret ?? qSecret);
    return this.ads.ingest(body);
  }

  @Public()
  @Get("indicadores-ads")
  async adsGet(@Headers("x-indicadores-secret") headerSecret?: string, @Query("secret") qSecret?: string) {
    this.assertSecret(process.env.INDICADORES_ADS_SECRET || process.env.INGEST_LEADS_SECRET, headerSecret ?? qSecret);
    return this.ads.snapshot();
  }

  private assertSecret(expected: string | undefined, got: string | undefined) {
    if (expected && got !== expected) {
      throw new UnauthorizedException("unauthorized");
    }
  }
}
