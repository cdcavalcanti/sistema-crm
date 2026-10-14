import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser } from "../../../core/auth/current-user.decorator";
import { Public } from "../../../core/auth/public.decorator";
import type { Actor } from "../../../core/auth/auth.types";
import { AuthService } from "../application/auth.service";
import { InviteUserDto, LoginDto, SignupDto, UpdateRoleDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Get("me")
  me(@CurrentUser() actor: Actor) {
    return this.auth.me(actor);
  }

  @Post("invite")
  invite(@CurrentUser() actor: Actor, @Body() dto: InviteUserDto) {
    return this.auth.invite(actor, dto);
  }

  @Post("role")
  role(@CurrentUser() actor: Actor, @Body() dto: UpdateRoleDto) {
    return this.auth.updateRole(actor, dto);
  }
}
