import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { IngestModule } from "../ingest/ingest.module";
import { FunctionsController } from "./functions.controller";

@Module({
  imports: [IdentityModule, IngestModule],
  controllers: [FunctionsController],
})
export class FunctionsModule {}
