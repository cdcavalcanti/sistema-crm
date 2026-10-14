import { Controller, Get } from "@nestjs/common";
import { Public } from "../../core/auth/public.decorator";
import { PrismaService } from "../../core/database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: "vortex-crm" };
  }
}
