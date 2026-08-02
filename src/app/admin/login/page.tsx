"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import {
  ShieldCheckIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "O e-mail é obrigatório.")
    .email("Informe um endereço de e-mail válido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: LoginValues) {
    setAuthError(null);

    const { error: signInError } = await authClient.signIn.email({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      setAuthError("E-mail ou senha inválidos.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      {/* Glow ambient effect */}
      <div className="pointer-events-none absolute size-96 rounded-full bg-primary/10 blur-3xl" />

      <Card className="relative z-10 w-full max-w-sm border-border/80 bg-surface/90 shadow-panel backdrop-blur-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheckIcon className="size-6" />
          </div>
          <CardTitle className="font-display text-2xl font-bold tracking-wide">
            Login Administrativo
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Painel de gestão • imortal-store
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {authError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/15 p-3 text-xs text-destructive">
                <WarningCircleIcon className="size-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@imortalstore.com"
                  disabled={isSubmitting}
                  {...register("email")}
                />
                {errors.email?.message && (
                  <FieldError>{errors.email.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Senha</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  {...register("password")}
                />
                {errors.password?.message && (
                  <FieldError>{errors.password.message}</FieldError>
                )}
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full font-medium"
            >
              {isSubmitting ? (
                <>
                  <CircleNotchIcon className="mr-2 size-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar no Painel"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}



