import { db } from "@/lib/db";
import { operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

function dateRange(params: URLSearchParams) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const dateFrom = params.get("dateFrom") ?? today.slice(0, 8) + "01";
  const dateTo = params.get("dateTo") ?? today;
  const start = new Date(`${dateFrom}T00:00:00+05:30`);
  const end = new Date(new Date(`${dateTo}T00:00:00+05:30`).getTime() + 86_400_000);
  return { dateFrom, dateTo, start, end };
}

function minutesBetween(start: Date, end: Date | null) {
  return end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)) : 0;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId") ?? "all";
    const staffId = params.get("staffId") ?? undefined;
    const context = await requireOperationsContext("payroll:read", { branchId, allowAll: true });
    const branchIds = context.branch ? [context.branch.id] : context.branches.map((branch) => branch.id);
    const { dateFrom, dateTo, start, end } = dateRange(params);
    const staff = await db.staff.findMany({
      where: {
        id: staffId,
        user: { tenantId: context.tenant.id, isActive: true },
        OR: [{ branchId: { in: branchIds } }, { branchAssignments: { some: { branchId: { in: branchIds } } } }],
      },
      include: {
        user: true,
        attendance: { where: { branchId: { in: branchIds }, status: "APPROVED", clockIn: { lt: end }, OR: [{ clockOut: null }, { clockOut: { gt: start } }] } },
        shifts: { where: { branchId: { in: branchIds }, startsAt: { lt: end }, endsAt: { gt: start } } },
        commissions: { where: { earnedAt: { gte: start, lt: end } } },
        appointments: { where: { branchId: { in: branchIds }, startsAt: { gte: start, lt: end }, status: "COMPLETED" } },
        invoiceLines: {
          where: { invoice: { branchId: { in: branchIds }, createdAt: { gte: start, lt: end }, status: { in: ["PAID", "PARTIALLY_PAID", "REFUNDED"] } } },
          include: { invoice: { include: { lines: true } } },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    const rows = staff.map((member) => {
      const workedMinutes = member.attendance.reduce((sum, entry) => sum + minutesBetween(entry.clockIn, entry.clockOut), 0);
      const expectedMinutes = member.shifts.reduce((sum, shift) => sum + minutesBetween(shift.startsAt, shift.endsAt), 0);
      const serviceCommissions = member.commissions.filter((item) => item.source !== "PRODUCT").reduce((sum, item) => sum + Number(item.amount), 0);
      const productCommissions = member.commissions.filter((item) => item.source === "PRODUCT").reduce((sum, item) => sum + Number(item.amount), 0);
      const tips = member.invoiceLines.reduce((sum, line) => {
        const invoiceTip = Number(line.invoice.tip);
        if (invoiceTip <= 0) return sum;
        const serviceTotal = line.invoice.lines.filter((item) => item.staffId).reduce((lineSum, item) => lineSum + Number(item.total), 0);
        return sum + (serviceTotal > 0 ? invoiceTip * (Number(line.total) / serviceTotal) : 0);
      }, 0);
      const payableInput = serviceCommissions + productCommissions + tips;
      return {
        staffId: member.id,
        name: member.user.name,
        role: member.jobTitle,
        workedMinutes,
        expectedMinutes,
        varianceMinutes: workedMinutes - expectedMinutes,
        appointmentsServed: member.appointments.length,
        serviceRevenue: member.invoiceLines.filter((line) => line.type === "SERVICE").reduce((sum, line) => sum + Number(line.total), 0),
        productRevenue: member.invoiceLines.filter((line) => line.type === "PRODUCT").reduce((sum, line) => sum + Number(line.total), 0),
        serviceCommissions,
        productCommissions,
        tips,
        payableInput,
      };
    });

    return Response.json({
      data: {
        dateFrom,
        dateTo,
        branchIds,
        rows,
        summary: {
          workedMinutes: rows.reduce((sum, row) => sum + row.workedMinutes, 0),
          expectedMinutes: rows.reduce((sum, row) => sum + row.expectedMinutes, 0),
          appointmentsServed: rows.reduce((sum, row) => sum + row.appointmentsServed, 0),
          serviceCommissions: rows.reduce((sum, row) => sum + row.serviceCommissions, 0),
          productCommissions: rows.reduce((sum, row) => sum + row.productCommissions, 0),
          tips: rows.reduce((sum, row) => sum + row.tips, 0),
          payableInput: rows.reduce((sum, row) => sum + row.payableInput, 0),
        },
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
