import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class SignupDto extends LoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;
}

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nome!: string;

  @IsString()
  role!: "super_admin" | "admin" | "usuario";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  responsavel_crm?: string | null;
}

export class UpdateRoleDto {
  @IsString()
  user_id!: string;

  @IsString()
  role!: "super_admin" | "admin" | "usuario";
}
