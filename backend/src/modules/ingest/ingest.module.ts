import { Module } from "@nestjs/common";
import { AdsService } from "./application/ads.service";
import { LeadsService } from "./application/leads.service";
import { IngestController } from "./presentation/ingest.controller";

@Module({
  controllers: [IngestController],
  providers: [LeadsService, AdsService],
  exports: [LeadsService, AdsService],
})
export class IngestModule {}
