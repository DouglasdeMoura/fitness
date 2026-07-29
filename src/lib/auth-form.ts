import { createServerFn } from "@tanstack/react-start";

import { resolveGithubSocialProvider } from "./auth-config";

export { isGithubAuthConfigured } from "./auth-config";

/** Post-auth destination (PRD 08 Part 3 Batch 2 / issue #43). */
export const AUTH_SUCCESS_PATH = "/dashboard" as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignInFormValues {
  email: string;
  password: string;
}

export interface SignUpFormValues {
  email: string;
  name: string;
  password: string;
}

export const SIGN_IN_FORM_DEFAULTS: SignInFormValues = {
  email: "",
  password: "",
};

export const SIGN_UP_FORM_DEFAULTS: SignUpFormValues = {
  email: "",
  name: "",
  password: "",
};

/** Inline email validation for TanStack Form (issue #43). */
export function validateAuthEmail(email: string): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) {
    return "Email is required";
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Enter a valid email address";
  }
  return undefined;
}

/** Sign-in password: required only. */
export function validateSignInPassword(password: string): string | undefined {
  if (!password) {
    return "Password is required";
  }
  return undefined;
}

/**
 * Sign-up password strength (issue #43).
 * Better Auth defaults to min length 8; we also require mixed character classes.
 */
export function validateSignUpPassword(password: string): string | undefined {
  if (!password) {
    return "Password is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return "Include uppercase, lowercase, and a number";
  }
  return undefined;
}

export function validateAuthName(name: string): string | undefined {
  if (!name.trim()) {
    return "Name is required";
  }
  return undefined;
}

const AUTH_CREDENTIAL_FAILURE_MESSAGE =
  "Authentication failed. Check your details and try again." as const;

const AUTH_SERVER_FAILURE_MESSAGE =
  "Something went wrong on our end. Please try again in a moment." as const;

const AUTH_NETWORK_FAILURE_MESSAGE =
  "Could not reach the server. Check your connection and try again." as const;

/** Maps Better Auth client errors to user-facing Banner copy. */
export function formatAuthError(error: {
  code?: string;
  message?: string;
  status?: number;
  statusText?: string;
}): string {
  if (error.message?.trim()) {
    return error.message;
  }
  if (error.code === "INVALID_EMAIL") {
    return "Enter a valid email address";
  }
  if (error.code === "INVALID_PASSWORD") {
    return "Password does not meet requirements";
  }
  if (typeof error.status === "number") {
    if (error.status >= 500) {
      return AUTH_SERVER_FAILURE_MESSAGE;
    }
    if (error.status >= 400) {
      return AUTH_CREDENTIAL_FAILURE_MESSAGE;
    }
  }
  return AUTH_NETWORK_FAILURE_MESSAGE;
}

export function fieldErrorMessage(
  errors: readonly unknown[]
): string | undefined {
  const [first] = errors;
  if (typeof first === "string" && first.length > 0) {
    return first;
  }
  return undefined;
}

export function textInputStatus(message: string | undefined) {
  if (!message) {
    return;
  }
  return { message, type: "error" as const };
}

export function readGithubProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): { github: true } | { github: false } {
  return Object.keys(resolveGithubSocialProvider(env)).length > 0
    ? { github: true }
    : { github: false };
}

export const getAuthPageConfig = createServerFn({ method: "GET" }).handler(() =>
  readGithubProviderConfig()
);
