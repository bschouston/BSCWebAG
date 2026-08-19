export function isAccountDisabled(user: Record<string, unknown> | undefined | null): boolean {
  return user?.isActive === false;
}

export const ACCOUNT_DISABLED_MESSAGE = "This account is disabled.";
export const ACCOUNT_DISABLED_CODE = "ACCOUNT_DISABLED";
