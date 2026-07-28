import { Button, TextInput } from "@astryxdesign/core";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  AuthFormFields,
  AuthPageShell,
} from "~/components/auth/auth-page-shell";
import { signIn } from "~/lib/auth-client";
import {
  AUTH_SUCCESS_PATH,
  fieldErrorMessage,
  formatAuthError,
  getAuthPageConfig,
  SIGN_IN_FORM_DEFAULTS,
  textInputStatus,
  validateAuthEmail,
  validateSignInPassword,
} from "~/lib/auth-form";

export const Route = createFileRoute("/sign-in/")({
  component: SignInPage,
  head: () => ({ meta: [{ title: "Sign in - FitTrack" }] }),
  loader: async () => getAuthPageConfig(),
});

function SignInPage() {
  const navigate = useNavigate();
  const { github } = Route.useLoaderData();
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: SIGN_IN_FORM_DEFAULTS,
    onSubmit: async ({ value }) => {
      setAuthError(null);
      const result = await signIn.email({
        email: value.email.trim(),
        password: value.password,
      });
      if (result.error) {
        setAuthError(formatAuthError(result.error));
        return;
      }
      await navigate({ to: AUTH_SUCCESS_PATH });
    },
  });

  const handleGithubSignIn = async () => {
    setAuthError(null);
    const result = await signIn.social({
      callbackURL: AUTH_SUCCESS_PATH,
      provider: "github",
    });
    if (result.error) {
      setAuthError(formatAuthError(result.error));
    }
  };

  return (
    <AuthPageShell
      alternateHref="/sign-up"
      alternateLabel="Sign up"
      alternatePrompt="Don't have an account?"
      authError={authError}
      heading="Welcome back"
      socialAction={github ? handleGithubSignIn : undefined}
      socialLabel={github ? "Sign in with GitHub" : undefined}
      subheading="Sign in to your account"
    >
      <AuthFormFields>
        <form.Field
          name="email"
          validators={{ onChange: ({ value }) => validateAuthEmail(value) }}
        >
          {(field) => (
            <TextInput
              label="Email"
              onChange={field.handleChange}
              size="lg"
              status={textInputStatus(
                fieldErrorMessage(field.state.meta.errors)
              )}
              type="email"
              value={field.state.value}
            />
          )}
        </form.Field>
        <form.Field
          name="password"
          validators={{
            onChange: ({ value }) => validateSignInPassword(value),
          }}
        >
          {(field) => (
            <TextInput
              label="Password"
              onChange={field.handleChange}
              size="lg"
              status={textInputStatus(
                fieldErrorMessage(field.state.meta.errors)
              )}
              type="password"
              value={field.state.value}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              clickAction={() => form.handleSubmit()}
              isLoading={isSubmitting}
              label="Sign in"
              size="lg"
              variant="primary"
            />
          )}
        </form.Subscribe>
      </AuthFormFields>
    </AuthPageShell>
  );
}
