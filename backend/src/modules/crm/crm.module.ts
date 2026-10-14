import { Module } from "@nestjs/common";
import { QueryService } from "./application/query.service";
import { RecordsRepository } from "./infrastructure/records.repository";
import { QueryController } from "./presentation/query.controller";

@Module({
  controllers: [QueryController],
  providers: [RecordsRepository, QueryService],
  exports: [QueryService, RecordsRepository],
})
export class CrmModule {}
