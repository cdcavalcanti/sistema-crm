import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AppRole } from "@prisma/client";
import { boolEnv } from "../../../core/config/env";
import { hashPassword, verifyPassword } from "../../../core/crypto/password";
import { PrismaService } from "../../../core/database/prisma.service";
import { isAdmin, isSuperAdmin, type Actor } from "../../../core/auth/auth.types";
import type { InviteUserDto, LoginDto, SignupDto, UpdateRoleDto } from "../presentation/dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true, profile: true },
    });
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("E-mail ou senha incorretos.");
    }
    return this.sessionOf(user);
  }

  async signup(dto: SignupDto) {
    if (!boolEnv("ALLOW_SIGNUP", false)) {
      throw new ForbiddenException("Cadastro público desativado. Peça convite ao admin.");
    }
    return this.createUser({
      email: dto.email,
      password: dto.password,
      nome: dto.nome || dto.email,
      role: "usuario",
      responsavel_crm: "Comercial",
    });
  }

  async me(actor: Actor) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: { roles: true, profile: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.sessionOf(user);
  }

  async invite(actor: Actor, dto: InviteUserDto) {
    if (!isAdmin(actor)) throw new ForbiddenException("forbidden");
    if (dto.role === "super_admin" && !isSuperAdmin(actor)) {
      throw new ForbiddenException("forbidden_role");
    }
    return this.createUser(dto);
  }

  async updateRole(actor: Actor, dto: UpdateRoleDto) {
    if (!isAdmin(actor)) throw new ForbiddenException("forbidden");
    if (dto.role === "super_admin" && !isSuperAdmin(actor)) {
      throw new ForbiddenException("forbidden_role");
    }
    await this.prisma.userRole.deleteMany({ where: { userId: dto.user_id } });
    await this.prisma.userRole.create({ data: { userId: dto.user_id, role: dto.role as AppRole } });
    return { ok: true };
  }

  async bootstrapAdmin(): Promise<void> {
    const count = await this.prisma.user.count();
    if (count > 0) return;
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;
    await this.createUser({
      email,
      password,
      nome: process.env.BOOTSTRAP_ADMIN_NOME || "Admin",
      role: "super_admin",
      responsavel_crm: "Comercial",
    });
  }

  private async createUser(dto: InviteUserDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException("E-mail já cadastrado.");
    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        nome: dto.nome,
        profile: {
          create: {
            nome: dto.nome,
            email,
            responsavelCrm: dto.responsavel_crm ?? "Comercial",
          },
        },
        roles: { create: { role: dto.role as AppRole } },
      },
      include: { roles: true, profile: true },
    });
    return this.sessionOf(user);
  }

  private sessionOf(user: {
    id: string;
    email: string;
    nome: string | null;
    profile: { nome: string | null; responsavelCrm: string | null } | null;
    roles: { role: AppRole }[];
  }) {
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwt.sign(payload);
    const nome = user.nome ?? user.profile?.nome ?? null;
    return {
      access_token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        app_metadata: {},
        user_metadata: { nome },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      },
      profile: {
        responsavel_crm: user.profile?.responsavelCrm ?? null,
      },
      roles: user.roles.map((r) => r.role),
    };
  }
}
