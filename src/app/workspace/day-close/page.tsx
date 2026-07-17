import { WorkspacePage } from "../workspace-page";

export const dynamic = "force-dynamic";

export default function WorkspaceDayClosePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspacePage searchParams={searchParams} module="day-close" />;
}
