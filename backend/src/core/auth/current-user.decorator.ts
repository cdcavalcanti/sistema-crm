import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Actor } from "./auth.types";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<{ user: Actor }>();
  return req.user;
});
