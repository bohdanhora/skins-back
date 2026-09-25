import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  @IsOptional()
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 4100;

  @IsString()
  @IsOptional()
  CORS_ORIGINS = 'http://localhost:3100';

  @IsString()
  @IsOptional()
  LOG_LEVEL = 'info';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  @IsOptional()
  PRICES_REFRESH_MINUTES = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  @IsOptional()
  CATALOG_REFRESH_HOURS = 24;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  @IsOptional()
  SALES_REFRESH_HOURS = 3;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  FLOAT_REFRESH_HOURS = 2;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  DMARKET_REQUESTS_PER_SECOND = 10;

  @IsString()
  @IsOptional()
  CACHE_DIR = '.cache';

  @IsString()
  @IsOptional()
  WHITE_MARKET_PARTNER_TOKEN?: string;

  @IsString()
  @IsOptional()
  DMARKET_PUBLIC_KEY?: string;

  @IsString()
  @IsOptional()
  DMARKET_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  CSFLOAT_API_KEY?: string;
}

export const validateEnvironment = (raw: Record<string, unknown>): EnvironmentVariables => {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed;
};
