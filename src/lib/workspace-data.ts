import { db } from "./db";
import type { WorkspaceData } from "./operations-types";

function indiaDayBounds(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(`${value.year}-${value.month}-${value.day}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function indiaMonthBounds(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(value.year);
  const month = Number(value.month);
  return {
    start: new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`),
    end: new Date(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01T00:00:00+05:30`),
  };
}

export async function getWorkspaceData({
  tenantId,
  selectedBranchId,
  selectedBranchIds,
  authorizedBranches,
  userName,
  role,
  tenantName,
  tenantSlug,
  currentStaffId,
}: {
  tenantId: string;
  selectedBranchId: string | null;
  selectedBranchIds?: string[] | null;
  authorizedBranches: Array<{ id: string; name: string; city: string; publicationStatus: string }>;
  userName: string;
  role: string;
  tenantName: string;
  tenantSlug: string;
  currentStaffId?: string | null;
}): Promise<WorkspaceData> {
  const day = indiaDayBounds();
  const month = indiaMonthBounds();
  const branchIds = selectedBranchIds?.length
    ? selectedBranchIds
    : selectedBranchId
      ? [selectedBranchId]
      : authorizedBranches.map((branch) => branch.id);
  const selectedBranch = branchIds.length === 1 ? authorizedBranches.find((branch) => branch.id === branchIds[0]) : null;
  const allBranchIds = authorizedBranches.map((branch) => branch.id);
  const isAllBranchScope = branchIds.length === allBranchIds.length && allBranchIds.every((id) => branchIds.includes(id));
  const scope = selectedBranch ? "branch" : isAllBranchScope ? "all" : "multi";
  const branchFilter = { in: branchIds };

  const [branchProfiles, branchScopeInfo, appointments, monthAppointments, customers, services, serviceCategories, team, resources, blockedTimes, stock, stockMovements, purchaseEntries, vendors, registerSessions, expenses, invoices, customerCount, monthExpenses, memberships, packages, giftCards, rewardRules, campaigns, reviews, auditLogs, subscriptionRecord, tenantUsage, taxClasses] = await Promise.all([
    db.branch.findMany({
      where: { id: { in: branchIds } },
      include: { operatingHours: { orderBy: { dayOfWeek: "asc" } } },
      orderBy: { name: "asc" },
    }),
    // Every branch the user may see, not just the ones currently in scope - the branch picker has
    // to offer them all, grouped by the business that operates them.
    db.branch.findMany({
      where: { id: { in: allBranchIds } },
      select: {
        id: true,
        state: true,
        ownershipModel: true,
        operatorEntityId: true,
        operatorEntity: { select: { id: true, name: true } },
        gstRegistration: { select: { gstin: true, state: true, isActive: true } },
      },
    }),
    db.appointment.findMany({
      where: {
        branchId: branchFilter,
        staffId: role === "STYLIST" && currentStaffId ? currentStaffId : undefined,
        startsAt: { gte: day.start, lt: day.end },
      },
      include: {
        branch: true,
        customer: true,
        service: true,
        staff: { include: { user: true } },
        resource: true,
        invoice: { include: { payments: true } },
        serviceLines: { include: { service: true, staff: { include: { user: true } } }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.appointment.findMany({
      where: { branchId: branchFilter, startsAt: { gte: month.start, lt: month.end } },
      include: { service: true },
      orderBy: { startsAt: "asc" },
    }),
    db.customer.findMany({
      where: { tenantId, isArchived: false },
      include: {
        appointments: { where: { branchId: branchFilter } },
        invoices: { where: { branchId: branchFilter, status: "PAID" } },
        loyaltyLedger: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.service.findMany({
      where: { tenantId },
      include: { categoryRecord: true, branches: { where: { branchId: branchFilter } } },
      orderBy: [{ categoryRecord: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.serviceCategory.findMany({ where: { tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.staff.findMany({
      where: {
        user: { isActive: true, tenantId },
        OR: [{ branchId: branchFilter }, { branchAssignments: { some: { branchId: branchFilter } } }],
      },
      include: {
        user: true,
        branchAssignments: true,
        appointments: { where: { branchId: branchFilter, startsAt: { gte: day.start, lt: day.end } }, include: { invoice: true } },
        leaves: { where: { status: "APPROVED", startsAt: { lt: day.end }, endsAt: { gt: day.start } } },
        commissions: { where: { earnedAt: { gte: month.start, lt: month.end } } },
        shifts: { where: { branchId: branchFilter, startsAt: { lt: day.end }, endsAt: { gt: day.start } }, orderBy: { startsAt: "asc" } },
        attendance: { where: { branchId: branchFilter, clockIn: { lt: day.end }, OR: [{ clockOut: null }, { clockOut: { gt: day.start } }] }, orderBy: { clockIn: "asc" } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    db.resource.findMany({
      where: { branchId: branchFilter },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    db.blockedTime.findMany({
      where: { branchId: branchFilter, startsAt: { lt: day.end }, endsAt: { gt: day.start } },
      include: { branch: true, staff: { include: { user: true } }, resource: true },
      orderBy: { startsAt: "asc" },
    }),
    db.branchStock.findMany({
      where: { branchId: branchFilter },
      // Brand is needed on the POS tile ("L'Oreal - 200ml") and for coupon restrictions.
      include: { inventoryItem: { include: { brand: { select: { name: true } } } } },
      orderBy: { inventoryItem: { name: "asc" } },
    }),
    db.stockMovement.findMany({
      where: { branchId: branchFilter },
      include: { inventoryItem: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.purchaseEntry.findMany({
      where: { branchId: branchFilter },
      include: { vendor: true, lines: true },
      orderBy: { purchasedAt: "desc" },
      take: 50,
    }),
    db.vendor.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    db.registerSession.findMany({ where: { branchId: branchFilter }, orderBy: { openedAt: "desc" }, take: 30 }),
    db.expense.findMany({ where: { branchId: branchFilter }, orderBy: { spentAt: "desc" }, take: 100 }),
    db.invoice.findMany({
      where: { branchId: branchFilter, createdAt: { gte: month.start, lt: month.end } },
      include: { customer: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db.customer.count({ where: { tenantId } }),
    db.expense.aggregate({
      where: { branchId: branchFilter, spentAt: { gte: month.start, lt: month.end } },
      _sum: { amount: true },
    }),
    db.membership.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    db.package.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    db.giftCard.findMany({
      where: { tenantId, branchId: selectedBranchId ?? undefined },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.rewardRule.findMany({ where: { tenantId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], take: 20 }),
    db.campaign.findMany({
      where: { tenantId },
      include: { messages: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.review.findMany({
      where: { branchId: branchFilter },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.auditLog.findMany({
      where: { tenantId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    }),
    Promise.all([
      db.branch.count({ where: { tenantId, publicationStatus: { not: "ARCHIVED" } } }),
      db.user.count({ where: { tenantId, role: { in: ["OWNER", "MANAGER", "RECEPTIONIST", "STYLIST", "ACCOUNTANT"] }, isActive: true } }),
      db.service.count({ where: { tenantId, isActive: true } }),
      db.appointment.count({ where: { branch: { tenantId }, createdAt: { gte: month.start, lt: month.end } } }),
      db.verificationDocument.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    ]),
    // The tax rates a service or product can be linked to, defined once in the Tax master.
    db.taxClass.findMany({ where: { tenantId, isActive: true }, orderBy: [{ kind: "asc" }, { rate: "asc" }, { name: "asc" }] }),
  ]);

  const netInvoiceTotal = (invoice: (typeof invoices)[number]) => Number(invoice.total) * (invoice.type === "REFUND" ? -1 : 1);

  /**
   * Which invoices count toward revenue.
   *
   * A refund reverses a sale exactly once. It used to be counted twice: the original sale flipped
   * to REFUNDED and was dropped from revenue entirely, *and* the credit note was subtracted - so a
   * fully refunded 2,000 sale showed as MINUS 2,000 instead of zero, and a month with a few test
   * refunds went negative.
   *
   * So a SALE counts whenever it was actually billed, including after it has been refunded, and the
   * credit note carries the reversal. VOID and DRAFT never happened and never count.
   */
  const countsTowardRevenue = (invoice: (typeof invoices)[number]) => {
    if (invoice.status === "VOID" || invoice.status === "DRAFT") return false;
    return invoice.type === "REFUND" ? invoice.status === "PAID" : true;
  };

  /**
   * Whose money is this?
   *
   * A FOFO franchisee bills under its own GSTIN and its own legal entity. Its sales are its
   * revenue, not the company's - so summing every invoice in scope and calling it "revenue" would
   * hand the owner a number they might act on that is simply not theirs.
   *
   * Invoices raised before legal entities existed carry no entity and are the company's by
   * definition, since there was no one else at the time.
   */
  const legalEntities = await db.legalEntity.findMany({
    where: { tenantId },
    select: { id: true, name: true, type: true, isPrimary: true },
  });
  const primaryEntity = legalEntities.find((entity) => entity.isPrimary) ?? null;
  const isCompanyInvoice = (invoice: (typeof invoices)[number]) =>
    !invoice.legalEntityId || invoice.legalEntityId === primaryEntity?.id;

  const todayInvoices = invoices.filter((invoice) => invoice.createdAt >= day.start && invoice.createdAt < day.end && countsTowardRevenue(invoice));
  const todayRevenue = todayInvoices.reduce((sum, invoice) => sum + netInvoiceTotal(invoice), 0);

  const monthRevenueInvoices = invoices.filter(countsTowardRevenue);
  const companyMonthRevenue = monthRevenueInvoices
    .filter(isCompanyInvoice)
    .reduce((sum, invoice) => sum + netInvoiceTotal(invoice), 0);
  const franchiseMonthRevenue = monthRevenueInvoices
    .filter((invoice) => !isCompanyInvoice(invoice))
    .reduce((sum, invoice) => sum + netInvoiceTotal(invoice), 0);
  const companyTodayRevenue = todayInvoices
    .filter(isCompanyInvoice)
    .reduce((sum, invoice) => sum + netInvoiceTotal(invoice), 0);
  const revenueByDay = new Map<string, number>();
  for (const invoice of invoices.filter(countsTowardRevenue)) {
    const label = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(invoice.createdAt);
    revenueByDay.set(label, (revenueByDay.get(label) ?? 0) + netInvoiceTotal(invoice));
  }
  const countBy = (values: string[]) => [...new Set(values)].map((label) => ({ label, value: values.filter((value) => value === label).length }));
  const serviceCount = new Map<string, number>();
  for (const appointment of monthAppointments) {
    serviceCount.set(appointment.service.name, (serviceCount.get(appointment.service.name) ?? 0) + 1);
  }
  const stockByItem = new Map<string, (typeof stock)[number] & { totalQuantity: number }>();
  for (const item of stock) {
    const existing = stockByItem.get(item.inventoryItemId);
    if (existing) existing.totalQuantity += Number(item.quantity);
    else stockByItem.set(item.inventoryItemId, { ...item, totalQuantity: Number(item.quantity) });
  }
  const attendanceState = (member: (typeof team)[number]) => {
    const approved = member.attendance.filter((entry) => entry.status === "APPROVED");
    const pending = member.attendance.filter((entry) => entry.status === "PENDING");
    const shift = member.shifts[0] ?? null;
    const firstClockIn = approved[0]?.clockIn ?? null;
    const openEntry = approved.find((entry) => !entry.clockOut) ?? null;
    const workedMinutes = approved.reduce((sum, entry) => sum + (entry.clockOut ? Math.max(0, Math.round((entry.clockOut.getTime() - entry.clockIn.getTime()) / 60_000)) : 0), 0);
    const expectedMinutes = shift ? Math.max(0, Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000)) : 0;
    const lateMinutes = shift && firstClockIn ? Math.max(0, Math.round((firstClockIn.getTime() - shift.startsAt.getTime()) / 60_000)) : 0;
    const state = member.leaves.length ? "ON_LEAVE" : openEntry ? "CLOCKED_IN" : approved.length ? "PRESENT" : shift ? "ABSENT" : "OFF";
    return {
      state,
      firstClockIn: firstClockIn?.toISOString() ?? null,
      lastClockOut: approved.filter((entry) => entry.clockOut).at(-1)?.clockOut?.toISOString() ?? null,
      openAttendanceId: openEntry?.id ?? null,
      workedMinutes,
      expectedMinutes,
      lateMinutes,
      pendingCorrections: pending.length,
    };
  };
  const attendanceStates = team.map(attendanceState);

  return {
    identity: {
      userName,
      role,
      tenantName,
      tenantSlug,
      // Lets a person's own screen know which row on the roster is theirs - so a stylist can clock
      // themselves in without a manager, and without being handed the whole team's controls.
      currentStaffId: currentStaffId ?? null,
      branchId: selectedBranch?.id ?? null,
      selectedBranchIds: branchIds,
      branchName: selectedBranch?.name ?? (scope === "multi" ? `${branchIds.length} branches` : "All branches"),
      branchCity: selectedBranch?.city ?? (scope === "multi" ? "Selected branches" : "India"),
      scope,
      subscription: subscriptionRecord ? {
        planName: subscriptionRecord.plan.name,
        planCode: subscriptionRecord.plan.code,
        limits: {
          branches: subscriptionRecord.plan.maxBranches,
          staff: subscriptionRecord.plan.maxStaff,
          services: subscriptionRecord.plan.maxServices,
          monthlyAppointments: subscriptionRecord.plan.maxMonthlyAppointments,
          storageMb: subscriptionRecord.plan.maxStorageMb,
        },
        usage: {
          branches: tenantUsage[0],
          staff: tenantUsage[1],
          services: tenantUsage[2],
          monthlyAppointments: tenantUsage[3],
          storageMb: Math.ceil(Number(tenantUsage[4]._sum.sizeBytes ?? 0) / 1024 / 1024),
        },
      } : null,
      // Derived, never configured. Each flag unlocks UI that would otherwise be noise.
      capabilities: {
        hasMultipleBranches: authorizedBranches.length > 1,
        hasFranchises: legalEntities.some((entity) => entity.type === "FRANCHISEE"),
        hasMultipleStates: new Set(branchScopeInfo.map((branch) => branch.state).filter(Boolean)).size > 1,
        hasMultipleEntities: legalEntities.length > 1,
        sellsProducts: stockByItem.size > 0,
        hasStaffCommission: team.some((member) => Number(member.commissionRate) > 0),
      },
      branches: authorizedBranches.map((branch) => {
        const profile = branchProfiles.find((item) => item.id === branch.id);
        const scopeInfo = branchScopeInfo.find((item) => item.id === branch.id);
        const registration = scopeInfo?.gstRegistration ?? null;
        // A branch can bill GST only if its registration is active and in its own state. This is
        // the same rule checkout enforces; surfacing it here means the picker can warn before a
        // receptionist is stopped mid-sale.
        const gstReady = Boolean(
          registration?.isActive
          && registration.gstin
          && !registration.gstin.startsWith("UNREGISTERED")
          && registration.state.trim().toLowerCase() === (scopeInfo?.state ?? "").trim().toLowerCase(),
        );

        return {
          ...branch,
          state: scopeInfo?.state ?? "",
          ownershipModel: scopeInfo?.ownershipModel ?? "COCO",
          operatorName: scopeInfo?.operatorEntity?.name ?? null,
          operatorEntityId: scopeInfo?.operatorEntityId ?? null,
          gstin: gstReady ? registration?.gstin ?? null : null,
          gstState: registration?.state ?? null,
          gstReady,
          timezone: profile?.timezone ?? "Asia/Kolkata",
          operatingHours: profile?.operatingHours.map((hours) => ({
            dayOfWeek: hours.dayOfWeek,
            opensAt: hours.opensAt,
            closesAt: hours.closesAt,
            isClosed: hours.isClosed,
          })) ?? [],
        };
      }),
    },
    metrics: {
      todayRevenue,
      todayAppointments: appointments.length,
      completedAppointments: appointments.filter((appointment) => appointment.status === "COMPLETED").length,
      customerCount,
      averageTicket: todayInvoices.filter((invoice) => invoice.type === "SALE").length ? todayRevenue / todayInvoices.filter((invoice) => invoice.type === "SALE").length : 0,
      lowStockCount: [...stockByItem.values()].filter((item) => item.totalQuantity <= Number(item.inventoryItem.reorderLevel)).length,
      monthRevenue: companyMonthRevenue + franchiseMonthRevenue,
      // Split out, because the two are not interchangeable. Franchise revenue passed through this
      // salon's tills but belongs to the franchisee.
      companyMonthRevenue,
      franchiseMonthRevenue,
      companyTodayRevenue,
      monthTax: invoices.reduce((sum, invoice) => countsTowardRevenue(invoice) ? sum + Number(invoice.tax) * (invoice.type === "REFUND" ? -1 : 1) : sum, 0),
      monthExpenses: Number(monthExpenses._sum.amount ?? 0),
      monthAppointments: monthAppointments.length,
      monthNewCustomers: customers.filter((customer) => customer.createdAt >= month.start && customer.createdAt < month.end).length,
      outstandingAmount: 0,
      staffPresent: attendanceStates.filter((item) => ["PRESENT", "CLOCKED_IN"].includes(item.state)).length,
      staffAbsent: attendanceStates.filter((item) => item.state === "ABSENT").length,
      staffLate: attendanceStates.filter((item) => item.lateMinutes > 0).length,
      pendingAttendanceCorrections: attendanceStates.reduce((sum, item) => sum + item.pendingCorrections, 0),
    },
    trends: {
      revenue: [...revenueByDay.entries()].map(([label, value]) => ({ label, value })).slice(-14),
      appointmentStatus: countBy(monthAppointments.map((appointment) => appointment.status)),
      bookingSource: countBy(monthAppointments.map((appointment) => appointment.source)),
      topServices: [...serviceCount.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    },
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      bookingReference: appointment.id,
      branchId: appointment.branchId,
      branchName: appointment.branch.name,
      customerId: appointment.customerId,
      customer: appointment.customer.name,
      phone: appointment.customer.phone,
      customerNotes: appointment.customer.notes,
      customerAllergies: appointment.customer.allergies,
      serviceId: appointment.serviceId,
      service: appointment.service.name,
      staffId: appointment.staffId,
      staff: appointment.staff?.user.name ?? "Unassigned",
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      status: appointment.status,
      source: appointment.source,
      notes: appointment.notes,
      cancellationReason: appointment.cancellationReason,
      resourceId: appointment.resourceId,
      resourceName: appointment.resource?.name ?? null,
      price: Number(appointment.service.price),
      invoice: appointment.invoice ? {
        id: appointment.invoice.id,
        number: appointment.invoice.number,
        status: appointment.invoice.status,
        total: Number(appointment.invoice.total),
        paid: appointment.invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
        outstanding: Math.max(0, Number(appointment.invoice.total) - appointment.invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)),
      } : null,
      serviceLines: appointment.serviceLines.map((line) => ({
        id: line.id,
        serviceId: line.serviceId,
        service: line.service.name,
        staffId: line.staffId,
        staff: line.staff?.user.name ?? "Unassigned",
        startsAt: line.startsAt?.toISOString() ?? appointment.startsAt.toISOString(),
        endsAt: line.endsAt?.toISOString() ?? appointment.endsAt.toISOString(),
        durationMinutes: line.durationMinutes,
        price: Number(line.price),
        taxRate: Number(line.taxRate),
        priceTaxMode: line.priceTaxMode,
      })),
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      visits: customer.appointments.filter((appointment) => appointment.status === "COMPLETED").length,
      spend: customer.invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
      loyalty: customer.loyaltyLedger.reduce((sum, entry) => sum + entry.points, 0),
      birthday: customer.birthday?.toISOString() ?? null,
      notes: customer.notes,
      allergies: customer.allergies,
      tags: customer.tags,
      whatsappConsent: customer.whatsappConsent,
      smsConsent: customer.smsConsent,
      emailConsent: customer.emailConsent,
    })),
    services: services.map((service) => {
      const override = selectedBranchId ? service.branches.find((item) => item.branchId === selectedBranchId) : null;
      return {
        id: service.id,
        name: service.name,
        category: service.categoryRecord?.name ?? service.category,
        categoryId: service.categoryId,
        durationMinutes: override?.durationMinutes ?? service.durationMinutes,
        price: Number(override?.price ?? service.price),
        taxRate: Number(override?.taxRate ?? service.taxRate),
        priceTaxMode: override?.priceTaxMode ?? service.priceTaxMode,
        isActive: override ? override.isActive : service.isActive,
        masterPrice: Number(service.price),
        masterPriceTaxMode: service.priceTaxMode,
        masterDurationMinutes: service.durationMinutes,
        onlineBooking: service.onlineBooking,
        bufferBefore: service.bufferBefore,
        bufferAfter: service.bufferAfter,
        sortOrder: service.sortOrder,
      };
    }),
    taxClasses: taxClasses.map((taxClass) => ({
      id: taxClass.id,
      name: taxClass.name,
      code: taxClass.code,
      kind: taxClass.kind,
      rate: Number(taxClass.rate),
    })),
    serviceCategories: serviceCategories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
      icon: category.icon,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    })),
    staff: team.map((member) => ({
      id: member.id,
      branchIds: [...new Set([member.branchId, ...member.branchAssignments.map((assignment) => assignment.branchId)])],
      name: member.user.name,
      email: member.user.email,
      userRole: member.user.role,
      role: member.jobTitle,
      commissionRate: Number(member.commissionRate),
      appointments: member.appointments.length,
      revenue: member.appointments.reduce((sum, appointment) => sum + Number(appointment.invoice?.total ?? 0), 0),
      onLeave: member.leaves.length > 0,
      shifts: member.shifts.map((shift) => ({ id: shift.id, branchId: shift.branchId, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString(), type: shift.type })),
      attendanceToday: attendanceState(member),
      commissionEarned: member.commissions.reduce((sum, commission) => sum + Number(commission.amount), 0),
    })),
    resources: resources.map((resource) => ({
      id: resource.id,
      branchId: resource.branchId,
      name: resource.name,
      type: resource.type,
    })),
    blockedTimes: blockedTimes.map((block) => ({
      id: block.id,
      branchId: block.branchId,
      branchName: block.branch.name,
      staffId: block.staffId,
      staffName: block.staff?.user.name ?? null,
      resourceId: block.resourceId,
      resourceName: block.resource?.name ?? null,
      title: block.title,
      reason: block.reason,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
      isAllDay: block.isAllDay,
    })),
    inventory: [...stockByItem.values()].map((item) => ({
      id: item.inventoryItem.id,
      name: item.inventoryItem.name,
      sku: item.inventoryItem.sku,
      category: item.inventoryItem.category,
      categoryId: item.inventoryItem.categoryId,
      brandName: item.inventoryItem.brand?.name ?? null,
      unit: item.inventoryItem.unit,
      quantity: item.totalQuantity,
      reorderLevel: Number(item.inventoryItem.reorderLevel),
      retailPrice: Number(item.inventoryItem.retailPrice),
      costPrice: Number(item.inventoryItem.costPrice),
      taxRate: Number(item.inventoryItem.taxRate),
      priceTaxMode: item.inventoryItem.priceTaxMode,
      stockValue: item.totalQuantity * Number(item.inventoryItem.costPrice),
      isActive: item.inventoryItem.isActive,
      vendorId: item.inventoryItem.vendorId,
    })),
    vendors: vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      phone: vendor.phone,
      email: vendor.email,
      gstin: vendor.gstin,
      isActive: vendor.isActive,
    })),
    stockMovements: stockMovements.map((movement) => ({
      id: movement.id,
      product: movement.inventoryItem.name,
      type: movement.type,
      quantity: Number(movement.quantity),
      reference: movement.reference,
      createdAt: movement.createdAt.toISOString(),
    })),
    purchaseEntries: purchaseEntries.map((purchase) => ({
      id: purchase.id,
      vendor: purchase.vendor?.name ?? null,
      invoiceNumber: purchase.invoiceNumber,
      total: Number(purchase.total),
      purchasedAt: purchase.purchasedAt.toISOString(),
      lines: purchase.lines.length,
    })),
    registerSessions: registerSessions.map((session) => ({
      id: session.id,
      status: session.status,
      openingBalance: Number(session.openingBalance),
      closingBalance: session.closingBalance === null ? null : Number(session.closingBalance),
      expectedBalance: session.expectedBalance === null ? null : Number(session.expectedBalance),
      variance: session.variance === null ? null : Number(session.variance),
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      category: expense.category,
      amount: Number(expense.amount),
      note: expense.note,
      spentAt: expense.spentAt.toISOString(),
    })),
    recentInvoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      customer: invoice.customer.name,
      total: Number(invoice.total),
      tax: Number(invoice.tax),
      paid: invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      type: invoice.type,
      status: invoice.status,
      taxMode: invoice.taxMode,
      createdAt: invoice.createdAt.toISOString(),
      payments: invoice.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount), reference: payment.reference })),
    })),
    memberships: memberships.map((item) => ({ id: item.id, name: item.name, price: Number(item.price), durationDays: item.durationDays, discountPercent: Number(item.discountPercent), rewardMultiplier: Number(item.rewardMultiplier), isActive: item.isActive })),
    packages: packages.map((item) => ({ id: item.id, name: item.name, price: Number(item.price), validityDays: item.validityDays, isActive: item.isActive })),
    giftCards: giftCards.map((item) => ({ id: item.id, code: item.code, balance: Number(item.balance), status: item.status, customer: item.customer?.name ?? null, expiresAt: item.expiresAt?.toISOString() ?? null })),
    rewardRules: rewardRules.map((item) => ({ id: item.id, name: item.name, pointsPerAmount: Number(item.pointsPerAmount), amountPerPoint: Number(item.amountPerPoint), earnOnTax: item.earnOnTax, minRedeemPoints: item.minRedeemPoints, maxRedeemPercent: Number(item.maxRedeemPercent), expiryDays: item.expiryDays, isActive: item.isActive })),
    campaigns: campaigns.map((item) => ({
      id: item.id,
      name: item.name,
      channel: item.channel,
      status: item.status,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      sent: item.messages.filter((message) => ["SENT", "DELIVERED"].includes(message.status)).length,
      failed: item.messages.filter((message) => message.status === "FAILED").length,
    })),
    reviews: reviews.map((item) => ({ id: item.id, customer: item.customer.name, rating: item.rating, comment: item.comment, salonReply: item.salonReply, status: item.status, createdAt: item.createdAt.toISOString() })),
    auditLogs: auditLogs.map((item) => ({ id: item.id, action: item.action, entity: item.entity, createdAt: item.createdAt.toISOString(), user: item.user?.name ?? null })),
  };
}