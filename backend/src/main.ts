import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./core/filters/http-exception.filter";
import { AuthService } from "./modules/identity/application/auth.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:8080").split(","),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const auth = app.get(AuthService);
  await auth.bootstrapAdmin();

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  Logger.log(`VORTEX API on http://localhost:${port}/api/v1`, "Bootstrap");
}

bootstrap();
