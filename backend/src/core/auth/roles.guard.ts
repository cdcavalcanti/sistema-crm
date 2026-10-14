import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AppRole } from "@prisma/client";
import { ROLES_KEY } from "./roles.decorator";
import type { Actor } from "./auth.types";
import { isSuperAdmin } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: Actor }>().user;
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    return required.some((role) => user.roles.includes(role));
  }
}
