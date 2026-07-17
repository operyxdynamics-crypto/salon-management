export type WorkspaceData = {
  identity: {
    userName: string;
    role: string;
    tenantName: string;
    tenantSlug: string;
    /**
     * The signed-in person's own staff profile, when they have one.
     *
     * An owner or accountant may have no staff record at all - they are a user of the business, not
     * a person on the roster - so this is null for them, and anything that clocks in has to cope
     * with that rather than assume everyone has a shift.
     */
    currentStaffId: string | null;
    branchId: string | null;
    selectedBranchIds: string[];
    branchName: string;
    branchCity: string;
    scope: "branch" | "all" | "multi";
    /**
     * What this business actually is, derived from its data - never configured.
     *
     * Complexity must be earned. A single-branch salon should never meet COCO/FOCO/FOFO, a list of
     * GST registrations, or a branch picker: not because a "simple mode" is switched on, but
     * because the app can see they have one branch and one entity and therefore says nothing about
     * franchises. Add a second branch and the picker appears by itself.
     */
    capabilities: {
      hasMultipleBranches: boolean;
      hasFranchises: boolean;
      hasMultipleStates: boolean;
      hasMultipleEntities: boolean;
      sellsProducts: boolean;
      hasStaffCommission: boolean;
    };
    subscription: null | {
      planName: string;
      planCode: string;
      limits: {
        branches: number;
        staff: number;
        services: number;
        monthlyAppointments: number;
        storageMb: number;
      };
      usage: {
        branches: number;
        staff: number;
        services: number;
        monthlyAppointments: number;
        storageMb: number;
      };
    };
    branches: Array<{
      id: string;
      name: string;
      city: string;
      state: string;
      publicationStatus: string;
      timezone: string;
      /// Who owns and who runs this branch. Drives the COCO/FOCO/FOFO scope presets.
      ownershipModel: "COCO" | "FOCO" | "FOFO";
      /// The business that operates the branch, and therefore issues its invoices.
      operatorName: string | null;
      operatorEntityId: string | null;
      /// The registration this branch bills under. Null means GST invoices are blocked here.
      gstin: string | null;
      gstState: string | null;
      /// False when the branch has no usable registration in its own state.
      gstReady: boolean;
      operatingHours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }>;
    }>;
  };
  metrics: {
    todayRevenue: number;
    todayAppointments: number;
    completedAppointments: number;
    customerCount: number;
    averageTicket: number;
    lowStockCount: number;
    monthRevenue: number;
    /// Revenue supplied by the company itself. FOFO franchise sales are excluded - they belong to
    /// the franchisee, and adding them to a company figure would be a wrong number, not a rounding.
    companyMonthRevenue: number;
    /// Revenue supplied by franchisees billing under their own GSTIN. Not the company's money.
    franchiseMonthRevenue: number;
    companyTodayRevenue: number;
    monthTax: number;
    monthExpenses: number;
    monthAppointments: number;
    monthNewCustomers: number;
    outstandingAmount: number;
    staffPresent: number;
    staffAbsent: number;
    staffLate: number;
    pendingAttendanceCorrections: number;
  };
  trends: {
    revenue: Array<{ label: string; value: number }>;
    appointmentStatus: Array<{ label: string; value: number }>;
    bookingSource: Array<{ label: string; value: number }>;
    topServices: Array<{ label: string; value: number }>;
  };
  appointments: Array<{
    id: string;
    bookingReference: string;
    branchId: string;
    branchName: string;
    customerId: string;
    customer: string;
    phone: string;
    customerNotes: string | null;
    customerAllergies: string | null;
    serviceId: string;
    service: string;
    staffId: string | null;
    staff: string;
    startsAt: string;
    endsAt: string;
    status: string;
    source: string;
    notes: string | null;
    cancellationReason: string | null;
    resourceId: string | null;
    resourceName: string | null;
    price: number;
    invoice: null | {
      id: string;
      number: string;
      status: string;
      total: number;
      paid: number;
      outstanding: number;
    };
    serviceLines: Array<{
      id: string;
      serviceId: string;
      service: string;
      staffId: string | null;
      staff: string;
      startsAt: string;
      endsAt: string;
      durationMinutes: number;
      price: number;
      taxRate: number;
      priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
    }>;
  }>;
  customers: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    visits: number;
    spend: number;
    loyalty: number;
    birthday: string | null;
    notes: string | null;
    allergies: string | null;
    tags: string[];
    whatsappConsent: boolean;
    smsConsent: boolean;
    emailConsent: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    category: string;
    categoryId: string | null;
    durationMinutes: number;
    price: number;
    taxRate: number;
    priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
    isActive: boolean;
    masterPrice: number;
    masterPriceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
    masterDurationMinutes: number;
    onlineBooking: boolean;
    bufferBefore: number;
    bufferAfter: number;
    sortOrder: number;
  }>;
  serviceCategories: Array<{
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
  // Tax rates defined once in the Tax master; services and products link to one of these.
  taxClasses: Array<{
    id: string;
    name: string;
    code: string;
    kind: "GOODS" | "SERVICE";
    rate: number;
  }>;
  staff: Array<{
    id: string;
    branchIds: string[];
    name: string;
    email: string | null;
    userRole: string;
    role: string;
    commissionRate: number;
    appointments: number;
    revenue: number;
    onLeave: boolean;
    shifts: Array<{ id: string; startsAt: string; endsAt: string; type: string; branchId: string }>;
    attendanceToday: {
      state: string;
      firstClockIn: string | null;
      lastClockOut: string | null;
      openAttendanceId: string | null;
      workedMinutes: number;
      expectedMinutes: number;
      lateMinutes: number;
      pendingCorrections: number;
    };
    commissionEarned: number;
  }>;
  resources: Array<{ id: string; branchId: string; name: string; type: string }>;
  blockedTimes: Array<{
    id: string;
    branchId: string;
    branchName: string;
    staffId: string | null;
    staffName: string | null;
    resourceId: string | null;
    resourceName: string | null;
    title: string;
    reason: string | null;
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
  }>;
  inventory: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    categoryId: string | null;
    brandName: string | null;
    unit: string;
    quantity: number;
    reorderLevel: number;
    retailPrice: number;
    costPrice: number;
    taxRate: number;
    priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
    stockValue: number;
    isActive: boolean;
    vendorId: string | null;
  }>;
  vendors: Array<{ id: string; name: string; phone: string | null; email: string | null; gstin: string | null; isActive: boolean }>;
  stockMovements: Array<{ id: string; product: string; type: string; quantity: number; reference: string | null; createdAt: string }>;
  purchaseEntries: Array<{ id: string; vendor: string | null; invoiceNumber: string | null; total: number; purchasedAt: string; lines: number }>;
  registerSessions: Array<{ id: string; status: string; openingBalance: number; openingNote?: string | null; closingBalance: number | null; closingNote?: string | null; expectedBalance: number | null; variance: number | null; openedAt: string; closedAt: string | null }>;
  expenses: Array<{
    id: string;
    category: string;
    amount: number;
    note: string | null;
    spentAt: string;
  }>;
  recentInvoices: Array<{
    id: string;
    number: string;
    customer: string;
    total: number;
    tax: number;
    paid: number;
    type: string;
    status: string;
    taxMode: string;
    createdAt: string;
    payments: Array<{ method: string; amount: number; reference: string | null }>;
  }>;
  memberships: Array<{ id: string; name: string; price: number; durationDays: number; discountPercent: number; rewardMultiplier: number; isActive: boolean }>;
  packages: Array<{ id: string; name: string; price: number; validityDays: number; isActive: boolean }>;
  giftCards: Array<{ id: string; code: string; balance: number; status: string; customer: string | null; expiresAt: string | null }>;
  rewardRules: Array<{ id: string; name: string; pointsPerAmount: number; amountPerPoint: number; earnOnTax: boolean; minRedeemPoints: number; maxRedeemPercent: number; expiryDays: number | null; isActive: boolean }>;
  campaigns: Array<{ id: string; name: string; channel: string; status: string; scheduledAt: string | null; sent: number; failed: number }>;
  reviews: Array<{ id: string; customer: string; rating: number; comment: string | null; salonReply: string | null; status: string; createdAt: string }>;
  auditLogs: Array<{ id: string; action: string; entity: string; createdAt: string; user: string | null }>;
};

export type AppointmentDetail = {
  id: string;
  branch: { id: string; name: string; timezone: string };
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    notes: string | null;
    allergies: string | null;
    tags: string[];
    visitCount: number;
    loyaltyBalance: number;
  };
  startsAt: string;
  endsAt: string;
  status: string;
  source: string;
  resource: null | { id: string; name: string; type: string };
  notes: string | null;
  cancellationReason: string | null;
  bookingReference: string;
  createdAt: string;
  serviceLines: Array<{
    id: string;
    serviceId: string;
    serviceName: string;
    staffId: string | null;
    staffName: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
    price: number;
    taxRate: number;
    priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
    bufferBefore: number;
    bufferAfter: number;
  }>;
  invoice: null | {
    id: string;
    number: string;
    status: string;
    subtotal: number;
    discount: number;
    tax: number;
    tip: number;
    total: number;
    paid: number;
    outstanding: number;
    payments: Array<{ id: string; method: string; amount: number; reference: string | null; createdAt: string }>;
  };
  review: null | { id: string; rating: number; comment: string | null; salonReply: string | null; status: string };
  history: Array<{ id: string; status: string; note: string | null; createdAt: string }>;
  permissions: { canWrite: boolean; canSell: boolean };
};

export type CustomerProfile = {
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    birthday: string | null;
    notes: string | null;
    preferences: unknown;
    allergies: string | null;
    tags: string[];
    isArchived: boolean;
    whatsappConsent: boolean;
    smsConsent: boolean;
    emailConsent: boolean;
    walletBalance: number;
    createdAt: string;
  };
  summary: { appointments: number; completedVisits: number; lifetimeSpend: number; outstanding: number; loyaltyBalance: number; walletBalance: number; rewardValue: number };
  appointments: Array<{
    id: string;
    branchId: string;
    branchName: string;
    startsAt: string;
    endsAt: string;
    status: string;
    source: string;
    services: string[];
    staff: string[];
    invoiceId: string | null;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    branchId: string;
    branchName: string;
    status: string;
    type: string;
    taxMode: string;
    total: number;
    paid: number;
    outstanding: number;
    createdAt: string;
    lines: Array<{ id: string; description: string; type: string; quantity: number; total: number }>;
    payments: Array<{ id: string; method: string; amount: number; reference: string | null }>;
  }>;
  loyalty: Array<{ id: string; points: number; reason: string; expiresAt: string | null; createdAt: string }>;
  benefitTransactions: Array<{
    id: string;
    kind: string;
    sourceType: string;
    sourceId: string | null;
    amount: number | null;
    points: number | null;
    note: string | null;
    createdAt: string;
  }>;
  memberships: Array<{ id: string; name: string; startsAt: string; endsAt: string; status: string }>;
  packages: Array<{ id: string; name: string; balance: unknown; expiresAt: string }>;
  giftCards: Array<{ id: string; code: string; branchName: string | null; balance: number; status: string; expiresAt: string | null }>;
  pagination: { page: number; pageSize: number; appointmentsTotal: number; invoicesTotal: number };
  permissions: { canWrite: boolean };
};

export type ServiceProfile = {
  service: {
    id: string;
    name: string;
    category: string;
    categoryId: string | null;
    description: string | null;
    durationMinutes: number;
    price: number;
    taxRate: number;
    priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
    isActive: boolean;
    onlineBooking: boolean;
    bufferBefore: number;
    bufferAfter: number;
    sortOrder: number;
  };
  branchOverrides: Array<{
    branchId: string;
    branchName: string;
    isActive: boolean;
    price: number;
    durationMinutes: number;
    taxRate: number;
    priceTaxMode: "EXCLUSIVE" | "INCLUSIVE";
  }>;
  qualifiedStaff: Array<{ id: string; name: string; role: string; branchNames: string[] }>;
  metrics: { bookings: number; completed: number; cancelled: number; noShows: number; averageSellingPrice: number; revenue: number };
  appointments: Array<{
    id: string;
    branchName: string;
    customerName: string;
    staffName: string;
    startsAt: string;
    status: string;
    price: number;
  }>;
  permissions: { canEdit: boolean };
};
