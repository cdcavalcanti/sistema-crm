import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../database/prisma.service";
import { requiredEnv } from "../config/env";
import type { Actor } from "./auth.types";

type JwtPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requiredEnv("JWT_SECRET", "dev-only-change-me"),
    });
  }

  async validate(payload: JwtPayload): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: true, profile: true },
    });
    if (!user || !user.confirmed) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      nome: user.nome ?? user.profile?.nome ?? null,
      roles: user.roles.map((r) => r.role),
      responsavelCrm: user.profile?.responsavelCrm ?? null,
    };
  }
}
