/** 与 init 演示账号一致的 slug / 邮箱规则 */
export const DEMO_LOGIN_NAMES = ["alex", "bella", "chen"] as const;

export function toLoginSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "local-user";
}

export function demoEmailFromLoginName(loginName: string): string {
  return `${toLoginSlug(loginName)}@local`;
}
