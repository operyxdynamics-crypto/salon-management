import { Prisma, type AppointmentSource, type AppointmentStatus } from "@prisma/client";
import { db } from "./db";
import { OperationsError } from "./operations-auth";
import { assertAppointmentCapacity } from "./plan-limits";

const blockingStatuses = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_SERVICE"] as const;

export async function resolveBranchService(branchId: string, serviceId: string) {
  const service = await db.service.findFirst({
    where: { id: serviceId, tenant: { branches: { some: { id: branchId } } }, isActive: true },
    include: { branches: { where: { branchId } } },
  });
  const override = service?.branches[0];
  if (!service || override?.isActive === false) return null;
  return {
    ...service,
    price: override?.price ?? service.price,
    durationMinutes: override?.durationMinutes ?? service.durationMinutes,
    taxRate: override?.taxRate ?? service.taxRate,
    priceTaxMode: override?.priceTaxMode ?? service.priceTaxMode,
  };
}

export async function eligibleStaffIds(branchId: string, serviceId: string) {
  const staff = await db.staff.findMany({
    where: {
      user: { isActive: true },
      services: { some: { serviceId } },
      OR: [{ branchId }, { branchAssignments: { some: { branchId } } }],
    },
    select: { id: true },
    orderBy: { user: { name: "asc" } },
  });
  return staff.map((item) => item.id);
}

async function staffIsAvailable(
  tx: Prisma.TransactionClient | typeof db,
  branchId: string,
  staffId: string,
  startsAt: Date,
  endsAt: Date,
  excludeAppointmentId?: string,
) {
  const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(startsAt);
  const dayStart = new Date(`${indiaDate}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const [conflict, blocked, leave, shiftCount, matchingShift] = await Promise.all([
    tx.appointment.findFirst({
      where: {
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        status: { in: [...blockingStatuses] },
        OR: [
          { staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          { serviceLines: { some: { staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } } },
        ],
      },
    }),
    tx.blockedTime.findFirst({
      where: {
        branchId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { staffId },
          { staffId: null, resourceId: null },
        ],
      },
    }),
    tx.staffLeave.findFirst({ where: { staffId, status: "APPROVED", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }),
    tx.shift.count({ where: { staffId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } }),
    tx.shift.findFirst({ where: { staffId, startsAt: { lte: startsAt }, endsAt: { gte: endsAt } } }),
  ]);
  return !conflict && !blocked && !leave && (shiftCount === 0 || Boolean(matchingShift));
}

export async function resourceIsAvailable(
  tx: Prisma.TransactionClient | typeof db,
  branchId: string,
  resourceId: string | null | undefined,
  startsAt: Date,
  endsAt: Date,
  excludeAppointmentId?: string,
) {
  if (!resourceId) return true;
  const [resource, conflict, blocked] = await Promise.all([
    tx.resource.findFirst({ where: { id: resourceId, branchId }, select: { id: true } }),
    tx.appointment.findFirst({
      where: {
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        branchId,
        resourceId,
        status: { in: [...blockingStatuses] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    }),
    tx.blockedTime.findFirst({
      where: {
        branchId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { resourceId },
          { staffId: null, resourceId: null },
        ],
      },
    }),
  ]);
  return Boolean(resource) && !conflict && !blocked;
}

export async function findAvailableStaff(
  tx: Prisma.TransactionClient | typeof db,
  branchId: string,
  serviceId: string,
  startsAt: Date,
  endsAt: Date,
  requestedStaffId?: string | null,
  excludeAppointmentId?: string,
) {
  const staffIds = requestedStaffId ? [requestedStaffId] : await eligibleStaffIds(branchId, serviceId);
  for (const staffId of staffIds) {
    const belongs = await tx.staff.findFirst({
      where: {
        id: staffId,
        user: { isActive: true },
        services: { some: { serviceId } },
        OR: [{ branchId }, { branchAssignments: { some: { branchId } } }],
      },
      select: { id: true },
    });
    if (belongs && await staffIsAvailable(tx, branchId, staffId, startsAt, endsAt, excludeAppointmentId)) return staffId;
  }
  return null;
}

export async function createAppointment({
  tenantId,
  branchId,
  customerId,
  serviceId,
  startsAt,
  source,
  status = "CONFIRMED",
  idempotencyKey,
  staffId,
  notes,
  actorId,
  serviceLines,
  resourceId,
  seriesId,
}: {
  tenantId: string;
  branchId: string;
  customerId: string;
  serviceId: string;
  startsAt: Date;
  source: AppointmentSource;
  status?: Extract<AppointmentStatus, "CONFIRMED" | "WAITLISTED">;
  idempotencyKey: string;
  staffId?: string | null;
  notes?: string;
  actorId?: string;
  serviceLines?: Array<{ serviceId: string; staffId?: string | null }>;
  resourceId?: string | null;
  seriesId?: string | null;
}) {
  const duplicate = await db.appointment.findUnique({ where: { idempotencyKey } });
  if (duplicate) return duplicate;
  await assertAppointmentCapacity(tenantId, startsAt);
  const waitlisted = status === "WAITLISTED";
  const requestedLines = serviceLines?.length ? serviceLines : [{ serviceId, staffId }];
  const resolvedLines: Array<{
    service: NonNullable<Awaited<ReturnType<typeof resolveBranchService>>>;
    requestedStaffId?: string | null;
  }> = [];
  for (const line of requestedLines) {
    const service = await resolveBranchService(branchId, line.serviceId);
    if (!service || service.tenantId !== tenantId) throw new OperationsError("NOT_FOUND", "Service is not available at this branch", 404);
    resolvedLines.push({ service, requestedStaffId: line.staffId });
  }
  const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(startsAt);
  const dayOfWeek = new Date(`${indiaDate}T12:00:00+05:30`).getUTCDay();
  const branchHours = await db.operatingHour.findUnique({ where: { branchId_dayOfWeek: { branchId, dayOfWeek } } });
  const scheduledEnd = new Date(startsAt.getTime() + resolvedLines.reduce((sum, line) => sum + line.service.durationMinutes, 0) * 60_000);
  if (!branchHours || branchHours.isClosed) throw new OperationsError("POLICY", "The branch is closed on this day", 409);
  const opensAt = new Date(`${indiaDate}T${branchHours.opensAt}:00+05:30`);
  const closesAt = new Date(`${indiaDate}T${branchHours.closesAt}:00+05:30`);
  if (startsAt < opensAt || scheduledEnd > closesAt) throw new OperationsError("POLICY", "Appointment falls outside branch operating hours", 409);
  const customer = await db.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) throw new OperationsError("NOT_FOUND", "Customer was not found", 404);
  if (resourceId) {
    const resource = await db.resource.findFirst({ where: { id: resourceId, branchId } });
    if (!resource) throw new OperationsError("NOT_FOUND", "Resource is not available at this branch", 404);
  }

  try {
    return await db.$transaction(async (tx) => {
      const scheduledLines = [];
      let cursor = startsAt;
      for (const { service, requestedStaffId } of resolvedLines) {
        const lineStartsAt = cursor;
        const lineEndsAt = new Date(lineStartsAt.getTime() + service.durationMinutes * 60_000);
        let assignedStaffId = requestedStaffId ?? null;
        if (!waitlisted) {
          const occupiedStartsAt = new Date(lineStartsAt.getTime() - service.bufferBefore * 60_000);
          const occupiedEndsAt = new Date(lineEndsAt.getTime() + service.bufferAfter * 60_000);
          const candidates = requestedStaffId ? [requestedStaffId] : await eligibleStaffIds(branchId, service.id);
          if (!candidates.length) throw new OperationsError("CONFLICT", `No qualified professional is configured for ${service.name}`, 409);
          await tx.$queryRaw`SELECT "id" FROM "Staff" WHERE "id" IN (${Prisma.join(candidates)}) FOR UPDATE`;
          assignedStaffId = await findAvailableStaff(tx, branchId, service.id, occupiedStartsAt, occupiedEndsAt, requestedStaffId);
          if (!assignedStaffId) throw new OperationsError("CONFLICT", `${service.name} is no longer available at this time`, 409);
        }
        scheduledLines.push({ service, staffId: assignedStaffId, startsAt: lineStartsAt, endsAt: lineEndsAt });
        cursor = lineEndsAt;
      }
      const primary = scheduledLines[0];
      const endsAt = scheduledLines.at(-1)!.endsAt;
      if (!waitlisted && resourceId) {
        await tx.$queryRaw`SELECT "id" FROM "Resource" WHERE "id" = ${resourceId} AND "branchId" = ${branchId} FOR UPDATE`;
        if (!await resourceIsAvailable(tx, branchId, resourceId, startsAt, endsAt)) {
          throw new OperationsError("CONFLICT", "Selected resource is unavailable at this time", 409);
        }
      }
      const created = await tx.appointment.create({
        data: {
          branchId,
          customerId,
          serviceId: primary.service.id,
          staffId: primary.staffId,
          startsAt,
          endsAt,
          source,
          notes,
          resourceId: resourceId || null,
          seriesId: seriesId || null,
          idempotencyKey,
          status,
          serviceLines: {
            create: scheduledLines.map((line, sortOrder) => ({
              serviceId: line.service.id,
              staffId: line.staffId,
              startsAt: line.startsAt,
              endsAt: line.endsAt,
              durationMinutes: line.service.durationMinutes,
              price: line.service.price,
              taxRate: line.service.taxRate,
              priceTaxMode: line.service.priceTaxMode,
              sortOrder,
            })),
          },
        },
      });
      await tx.appointmentStatusHistory.create({ data: { appointmentId: created.id, status } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          tenantId,
          action: waitlisted ? "APPOINTMENT_WAITLISTED" : "APPOINTMENT_CREATED",
          entity: "Appointment",
          entityId: created.id,
          metadata: { source, branchId, serviceCount: scheduledLines.length, status },
        },
      });
      return created;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof OperationsError) throw error;
    const racedDuplicate = await db.appointment.findUnique({ where: { idempotencyKey } });
    if (racedDuplicate) return racedDuplicate;
    throw error;
  }
}

export async function availabilityForDate(
  branchId: string,
  serviceId: string,
  date: string,
  staffId?: string,
  requestedLines?: Array<{ serviceId: string; staffId?: string | null }>,
  resourceId?: string | null,
) {
  // Customer-facing access is gated at the page level (/book/[slug] filters for published branches),
  // so this internal helper only requires the tenant itself to be ACTIVE. That lets staff schedule
  // appointments for branches that aren't publicly listed yet.
  const branch = await db.branch.findFirst({
    where: { id: branchId, tenant: { status: "ACTIVE" } },
    include: { operatingHours: true },
  });
  const lineRequests = requestedLines?.length ? requestedLines : [{ serviceId, staffId }];
  const services = [];
  for (const line of lineRequests) {
    const service = await resolveBranchService(branchId, line.serviceId);
    if (!service) throw new OperationsError("NOT_FOUND", "Branch or service is not available", 404);
    services.push({ service, staffId: line.staffId });
  }
  if (!branch || !services.length) throw new OperationsError("NOT_FOUND", "Branch or service is not available", 404);
  const noon = new Date(`${date}T12:00:00+05:30`);
  if (Number.isNaN(noon.getTime())) throw new OperationsError("VALIDATION", "Invalid date", 400);
  const dayOfWeek = noon.getUTCDay();
  const hours = branch.operatingHours.find((item) => item.dayOfWeek === dayOfWeek);
  if (!hours || hours.isClosed) return { date, slots: [], timezone: branch.timezone };

  const slots: string[] = [];
  const open = new Date(`${date}T${hours.opensAt}:00+05:30`);
  const close = new Date(`${date}T${hours.closesAt}:00+05:30`);
  const totalDuration = services.reduce((sum, line) => sum + line.service.durationMinutes, 0);
  for (let cursor = new Date(open); cursor.getTime() + totalDuration * 60_000 <= close.getTime(); cursor = new Date(cursor.getTime() + 30 * 60_000)) {
    if (cursor.getTime() < Date.now()) continue;
    let lineCursor = cursor;
    let available = true;
    for (const line of services) {
      const lineEndsAt = new Date(lineCursor.getTime() + line.service.durationMinutes * 60_000);
      const occupiedStartsAt = new Date(lineCursor.getTime() - line.service.bufferBefore * 60_000);
      const occupiedEndsAt = new Date(lineEndsAt.getTime() + line.service.bufferAfter * 60_000);
      if (!await findAvailableStaff(db, branchId, line.service.id, occupiedStartsAt, occupiedEndsAt, line.staffId)) {
        available = false;
        break;
      }
      lineCursor = lineEndsAt;
    }
    if (available && resourceId && !await resourceIsAvailable(db, branchId, resourceId, cursor, new Date(cursor.getTime() + totalDuration * 60_000))) {
      available = false;
    }
    if (available) slots.push(cursor.toISOString());
  }
  return {
    date,
    slots,
    timezone: branch.timezone,
    durationMinutes: totalDuration,
    price: services.reduce((sum, line) => sum + Number(line.service.price), 0),
  };
}
