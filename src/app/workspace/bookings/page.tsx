import { WorkspacePage } from "../workspace-page";

export const dynamic = "force-dynamic";

export default function WorkspaceBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspacePage searchParams={searchParams} module="bookings" />;
}
