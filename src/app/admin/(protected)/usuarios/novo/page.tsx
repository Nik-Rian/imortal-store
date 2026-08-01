"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createAdminUser } from "@/actions/user.actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  ArrowLeftIcon,
  UserPlusIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

const newUserSchema = z.object({
  name: z.string().trim().min(1, "O nome completo é obrigatório."),
  email: z
    .string()
    .min(1, "O e-mail é obrigatório.")
    .email("Informe um endereço de e-mail válido."),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
});

type NewUserValues = z.infer<typeof newUserSchema>;

export default function NewAdminUserPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewUserValues>({
    resolver: zodResolver(newUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: NewUserValues) => {
    setServerError(null);
    const formData = new FormData();
    formData.set("name", data.name);
    formData.set("email", data.email);
    formData.set("password", data.password);

    try {
      await createAdminUser(formData);
    } catch (err) {
      console.error("Erro ao criar usuário:", err);
      setServerError(
        err instanceof Error ? err.message : "Não foi possível criar o usuário."
      );
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">Novo Administrador</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre um novo usuário de acesso ao painel.
          </p>
        </div>
        <Button render={<Link href="/admin/usuarios" />} variant="outline" size="sm">
          <ArrowLeftIcon className="mr-1.5 size-4" />
          Voltar
        </Button>
      </div>

      <Card className="border-border/80 bg-surface shadow-panel">
        <CardHeader>
          <CardTitle className="font-display text-lg font-bold">Credenciais de Acesso</CardTitle>
          <CardDescription className="text-xs">
            Preencha os dados abaixo para criar a conta administrativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {serverError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/15 p-3 text-xs text-destructive">
                <WarningCircleIcon className="size-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">Nome Completo</FieldLabel>
                <Input
                  id="name"
                  placeholder="ex: Carlos Eduardo"
                  disabled={isSubmitting}
                  {...register("name")}
                />
                {errors.name?.message && (
                  <FieldError>{errors.name.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">E-mail de Acesso</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="carlos@imortalstore.com"
                  disabled={isSubmitting}
                  {...register("email")}
                />
                {errors.email?.message && (
                  <FieldError>{errors.email.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Senha Temporária</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  {...register("password")}
                />
                <FieldDescription>Mínimo de 8 caracteres.</FieldDescription>
                {errors.password?.message && (
                  <FieldError>{errors.password.message}</FieldError>
                )}
              </Field>
            </FieldGroup>

            <div className="pt-2">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <CircleNotchIcon className="mr-2 size-4 animate-spin" />
                    Criando Usuário...
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="mr-2 size-4" />
                    Criar Usuário Administrador
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}



