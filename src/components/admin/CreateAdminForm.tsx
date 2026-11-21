"use client";

import { useActionState } from "react";
import { createAdminUser } from "@/actions/user.actions";

interface CreateAdminFormState {
  error: string | null;
  name: string;
  email: string;
}

const initialState: CreateAdminFormState = { error: null, name: "", email: "" };

// Name and e-mail are echoed back because React resets uncontrolled fields
// after a form action completes, which would otherwise erase them on failure.
// The password is intentionally never kept in state.
async function submitAdminUser(
  _previousState: CreateAdminFormState,
  formData: FormData,
): Promise<CreateAdminFormState> {
  const result = await createAdminUser(formData);
  return {
    // On success the action redirects and the result may be undefined.
    error: result?.error ?? null,
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
}

export function CreateAdminForm() {
  const [state, formAction, isPending] = useActionState(
    submitAdminUser,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2"
        >
          {state.error}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium text-zinc-700">
          Nome
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={state.name}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={state.email}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          Senha temporária
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors disabled:opacity-50"
      >
        {isPending ? "Criando..." : "Criar Usuário"}
      </button>
    </form>
  );
}
