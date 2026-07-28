import { Button, TextInput } from "@astryxdesign/core";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  AuthFormFields,
  AuthPageShell,
} from "~/components/auth/auth-page-shell";
import { signIn, signUp } from "~/lib/auth-client";
import {
  AUTH_SUCCESS_PATH,
  fieldErrorMessage,
  formatAuthError,
  getAuthPageConfig,
  SIGN_UP_FORM_DEFAULTS,
  textInputStatus,
  validateAuthEmail,
  validateAuthName,
  validateSignUpPassword,
} from "~/lib/auth-form";
import { redirectAuthenticatedToDashboard } from "~/lib/route-auth";

export const Route = createFileRoute("/sign-up/")({
  beforeLoad: redirectAuthenticatedToDashboard,
  component: SignUpPage,
  head: () => ({ meta: [{ title: "Sign up - FitTrack" }] }),
  loader: async () => getAuthPageConfig(),
});

function SignUpPage() {
  const navigate = useNavigate();
  const { github } = Route.useLoaderData();
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: SIGN_UP_FORM_DEFAULTS,
    onSubmit: async ({ value }) => {
      setAuthError(null);
      const result = await signUp.email({
        email: value.email.trim(),
        name: value.name.trim(),
        password: value.password,
      });
      if (result.error) {
        setAuthError(formatAuthError(result.error));
        return;
      }
      await navigate({ to: AUTH_SUCCESS_PATH });
    },
  });

  const handleGithubSignUp = async () => {
    setAuthError(null);
    const result = await signIn.social({
      callbackURL: AUTH_SUCCESS_PATH,
      provider: "github",
      requestSignUp: true,
    });
    if (result.error) {
      setAuthError(formatAuthError(result.error));
    }
  };

  return (
    <AuthPageShell
      alternateHref="/sign-in"
      alternateLabel="Sign in"
      alternatePrompt="Already have an account?"
      authError={authError}
      heading="Create your account"
      socialAction={github ? handleGithubSignUp : undefined}
      socialLabel={github ? "Sign up with GitHub" : undefined}
      subheading="Start your evidence-based fitness journey"
    >
      <AuthFormFields>
        <form.Field
          name="name"
          validators={{ onChange: ({ value }) => validateAuthName(value) }}
        >
          {(field) => (
            <TextInput
              label="Name"
              onChange={field.handleChange}
              size="lg"
              status={textInputStatus(
                fieldErrorMessage(field.state.meta.errors)
              )}
              value={field.state.value}
            />
          )}
        </form.Field>
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
            onChange: ({ value }) => validateSignUpPassword(value),
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
              label="Create account"
              size="lg"
              variant="primary"
            />
          )}
        </form.Subscribe>
      </AuthFormFields>
    </AuthPageShell>
  );
}
