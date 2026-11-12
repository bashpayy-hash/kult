"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Field, FormError, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/types";

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Пароль" htmlFor="password">
        <input id="password" name="password" type="password" className="field" autoComplete="current-password" autoFocus required />
      </Field>
      <FormError error={state.error} />
      <div>
        <SubmitButton>Войти</SubmitButton>
      </div>
    </form>
  );
}
