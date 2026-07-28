/** Fitness profile fields stored on Better Auth's user row (PRD 08 Part 3). */
export const AUTH_USER_ADDITIONAL_FIELDS = {
  activityLevel: {
    defaultValue: "moderate",
    required: false,
    type: "string",
  },
  birthDate: {
    required: false,
    type: "string",
  },
  goalType: {
    defaultValue: "build_muscle",
    required: false,
    type: "string",
  },
  heightCm: {
    required: false,
    type: "number",
  },
  sex: {
    defaultValue: "male",
    required: false,
    type: "string",
  },
} as const;

/** True when both GitHub OAuth env vars are set (issue #43). */
export function isGithubAuthConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return Object.keys(resolveGithubSocialProvider(env)).length > 0;
}

/**
 * GitHub OAuth is enabled only when both client credentials are configured.
 * @example resolveGithubSocialProvider({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' })
 */
export function resolveGithubSocialProvider(
  env: NodeJS.ProcessEnv = process.env
): Record<string, { clientId: string; clientSecret: string }> {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {};
  }
  return {
    github: {
      clientId,
      clientSecret,
    },
  };
}
