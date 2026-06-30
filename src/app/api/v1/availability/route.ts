import { z } from "zod";
import { availabilityForDate } from "@/lib/availability";
import { operationsErrorResponse, OperationsError } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().min(1).optional(),
  serviceLines: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid availability request", 400, parsed.error.flatten());
    let serviceLines: Array<{ serviceId: string; staffId?: string | null }> | undefined;
    if (parsed.data.serviceLines) {
      try {
        serviceLines = z.array(z.object({ serviceId: z.string(), staffId: z.string().nullable().optional() })).parse(JSON.parse(parsed.data.serviceLines));
      } catch {
        throw new OperationsError("VALIDATION", "Invalid service lines", 400);
      }
    }
    return Response.json({ data: await availabilityForDate(parsed.data.branchId, parsed.data.serviceId, parsed.data.date, parsed.data.staffId, serviceLines) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
