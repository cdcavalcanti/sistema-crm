import { Allow, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class FilterOpDto {
  @IsString()
  type!: string;

  @IsString()
  col!: string;

  @Allow()
  val?: unknown;

  @IsOptional()
  @IsBoolean()
  not?: boolean;
}

export class OrderDto {
  @IsString()
  col!: string;

  @IsOptional()
  @IsBoolean()
  asc?: boolean;
}

export class QueryDto {
  @IsString()
  table!: string;

  @IsIn(["select", "insert", "update", "delete", "upsert"])
  op!: "select" | "insert" | "update" | "delete" | "upsert";

  @IsOptional()
  @IsString()
  select?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterOpDto)
  filters?: FilterOpDto[];

  @IsOptional()
  @IsString()
  or?: string;

  @Allow()
  payload?: unknown;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderDto)
  order?: OrderDto[];

  @Allow()
  limit?: number;

  @Allow()
  range?: [number, number];

  @IsOptional()
  @IsBoolean()
  single?: boolean;

  @IsOptional()
  @IsBoolean()
  maybeSingle?: boolean;

  @IsOptional()
  @IsBoolean()
  count?: boolean;

  @IsOptional()
  @IsBoolean()
  head?: boolean;
}
