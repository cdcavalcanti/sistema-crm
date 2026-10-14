import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./core/auth/jwt-auth.guard";
import { RolesGuard } from "./core/auth/roles.guard";
import { PrismaModule } from "./core/database/prisma.module";
import { CrmModule } from "./modules/crm/crm.module";
import { FunctionsModule } from "./modules/functions/functions.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { IngestModule } from "./modules/ingest/ingest.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    CrmModule,
    IngestModule,
    FunctionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
