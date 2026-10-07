import type { SessionUser } from "@/server/auth/session";
import type { projectCore } from "@/server/services/project-detail";
import type { ProjectSummary } from "@/server/services/project-summary";

export type Core = NonNullable<Awaited<ReturnType<typeof projectCore>>>;
export interface TabProps {
  user: SessionUser;
  core: Core;
  summary: ProjectSummary;
}
