import "dotenv/config";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * The plans Operyx sells. See docs/SAAS-PLAN.md for the reasoning.
 *
 * Prices are in paise and exclude 18% GST, which is how every competitor quotes. Annual is a flat
 * 20% off and waives the setup fee.
 *
 * Deliberately no cheap tier: Operyx is priced on GST compliance and franchise support, which are
 * worth nothing to a single-chair salon and a great deal to a group with an accountant. A discount
 * you offer is worth more than a low price you advertise.
 *
 * A limit of 0 means unlimited.
 *
 * Salon and Group carry a real appointment ceiling, set deliberately high: 3,000/month is about
 * 100 bookings a day, which no single-branch salon reaches. The ceiling exists so growth can turn
 * into add-on revenue, not so anyone hits it mid-shift - a salon blocked at the counter is a
 * complaint, and the design only works if Operyx sells past the ceiling two weeks early.
 * Franchise stays unlimited: at that size the conversation is about branches, not bookings.
 */
const plans = [
  {
    code: "salon",
    name: "Salon",
    description: "One salon, billed properly. GST invoices, attendance and payroll included.",
    monthlyPricePaise: 199_900,   // ₹1,999
    annualPricePaise: 1_918_800,  // ₹19,188 = ₹1,599/mo
    setupFeePaise: 199_900,       // ₹1,999, waived on annual
    trialDays: 14,
    maxBranches: 1, maxStaff: 15, maxServices: 0, maxMonthlyAppointments: 3_000, maxStorageMb: 2048,
    features: ["operations", "marketplace", "inventory", "attendance", "payroll"],
    isPublic: true, sortOrder: 1,
  },
  {
    code: "group",
    name: "Group",
    description: "Several branches under one business, with reporting across all of them.",
    monthlyPricePaise: 499_900,   // ₹4,999
    annualPricePaise: 4_798_800,  // ₹47,988 = ₹3,999/mo
    setupFeePaise: 199_900,
    trialDays: 14,
    maxBranches: 5, maxStaff: 50, maxServices: 0, maxMonthlyAppointments: 15_000, maxStorageMb: 10_240,
    features: ["operations", "marketplace", "inventory", "attendance", "payroll", "advanced_reports", "multi_branch", "priority_support"],
    isPublic: true, sortOrder: 2,
  },
  {
    code: "franchise",
    name: "Franchise",
    description: "Franchise networks: COCO, FOCO and FOFO branches billing under their own GSTINs.",
    monthlyPricePaise: 1_199_900,  // ₹11,999
    annualPricePaise: 11_518_800,  // ₹1,15,188 = ₹9,599/mo
    setupFeePaise: 0,              // onboarding is a conversation at this size
    trialDays: 0,                  // sold, not self-served
    maxBranches: 0, maxStaff: 0, maxServices: 0, maxMonthlyAppointments: 0, maxStorageMb: 51_200,
    features: ["operations", "marketplace", "inventory", "attendance", "payroll", "advanced_reports", "multi_branch", "franchise", "multi_entity", "account_manager"],
    isPublic: true, sortOrder: 3,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Their own database, their own deployment. Sold per deal - always set an agreed price on the subscription.",
    // Deliberately zero: this plan is never sold at list. The agreed price on each subscription is
    // the real number, and MRR already prefers agreed over list, so ₹0 here can never flatter it.
    monthlyPricePaise: 0,
    annualPricePaise: 0,
    setupFeePaise: 0,
    trialDays: 0,
    maxBranches: 0, maxStaff: 0, maxServices: 0, maxMonthlyAppointments: 0, maxStorageMb: 0,
    features: ["operations", "marketplace", "inventory", "attendance", "payroll", "advanced_reports", "multi_branch", "franchise", "multi_entity", "account_manager", "dedicated_database"],
    requiresDedicatedDb: true,
    isPublic: false, // a conversation, not a pricing-page tier
    sortOrder: 4,
  },
];
const seededPlans = {};
for (const plan of plans) {
  seededPlans[plan.code] = await db.subscriptionPlan.upsert({
    where: { code: plan.code },
    update: plan,
    create: plan,
  });
}

/**
 * Add-on packs. A plan sets the base; these extend it without a tier change.
 *
 * `limitField` names the plan limit each one raises. WhatsApp credits have none - they are metered,
 * because every message costs Operyx real money to send.
 */
const addOns = [
  { code: "extra_appointments", name: "Extra appointments", description: "500 more bookings a month.", limitField: "maxMonthlyAppointments", unitAmount: 500, unitPricePaise: 50_000, isMetered: false, sortOrder: 1 },
  { code: "extra_branch", name: "Extra branch", description: "One more location on the same plan.", limitField: "maxBranches", unitAmount: 1, unitPricePaise: 80_000, isMetered: false, sortOrder: 2 },
  { code: "extra_staff", name: "Extra staff seats", description: "Five more team members.", limitField: "maxStaff", unitAmount: 5, unitPricePaise: 40_000, isMetered: false, sortOrder: 3 },
  { code: "whatsapp_credits", name: "WhatsApp credits", description: "1,000 messages. Metered - unused credits do not roll over.", limitField: null, unitAmount: 1000, unitPricePaise: 60_000, isMetered: true, sortOrder: 4 },
];
for (const addOn of addOns) {
  await db.addOn.upsert({ where: { code: addOn.code }, update: addOn, create: addOn });
}

const tenant = await db.tenant.upsert({
  where: { slug: "velvet-glow" },
  update: {
    name: "Velvet & Glow",
    legalName: "Velvet Glow Beauty Private Limited",
    gstin: "29AABCV1234F1Z5",
    panNumber: "AABCV1234F",
    status: "ACTIVE",
    onboardingStep: 4,
    policies: { cancellationHours: 4 },
  },
  create: {
    name: "Velvet & Glow",
    slug: "velvet-glow",
    legalName: "Velvet Glow Beauty Private Limited",
    gstin: "29AABCV1234F1Z5",
    panNumber: "AABCV1234F",
    status: "ACTIVE",
    subscription: "group",
    onboardingStep: 4,
    policies: { cancellationHours: 4 },
  },
});

const branch = await db.branch.upsert({
  where: { tenantId_slug: { tenantId: tenant.id, slug: "indiranagar" } },
  update: { isPublished: true, publicationStatus: "APPROVED", profileDescription: "Contemporary hair, skin, nail, and beauty services in the heart of Indiranagar.", policies: { cancellationHours: 4 }, rating: 4.9, reviewCount: 284 },
  create: {
    tenantId: tenant.id,
    name: "Velvet & Glow - Indiranagar",
    slug: "indiranagar",
    phone: "+918041239087",
    email: "hello@velvetandglow.in",
    address: "100 Feet Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560038",
    latitude: 12.9784,
    longitude: 77.6408,
    timezone: "Asia/Kolkata",
    isPublished: true,
    publicationStatus: "APPROVED",
    profileDescription: "Contemporary hair, skin, nail, and beauty services in the heart of Indiranagar.",
    policies: { cancellationHours: 4 },
    approvedAt: new Date("2026-06-01T06:30:00.000Z"),
    rating: 4.9,
    reviewCount: 284,
  },
});

const secondBranch = await db.branch.upsert({
  where: { tenantId_slug: { tenantId: tenant.id, slug: "koramangala" } },
  update: {
    name: "Lumiere Studio - Koramangala",
    phone: "+918041239188",
    email: "hello@lumierestudio.in",
    address: "80 Feet Road, Koramangala",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560034",
    timezone: "Asia/Kolkata",
    isPublished: true,
    publicationStatus: "APPROVED",
    profileDescription: "Premium colour, bridal, and daily salon services for Koramangala clients.",
    policies: { cancellationHours: 6 },
    approvedAt: new Date("2026-07-01T06:30:00.000Z"),
    rating: 4.8,
    reviewCount: 96,
  },
  create: {
    tenantId: tenant.id,
    name: "Lumiere Studio - Koramangala",
    slug: "koramangala",
    phone: "+918041239188",
    email: "hello@lumierestudio.in",
    address: "80 Feet Road, Koramangala",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560034",
    latitude: 12.9352,
    longitude: 77.6245,
    timezone: "Asia/Kolkata",
    isPublished: true,
    publicationStatus: "APPROVED",
    profileDescription: "Premium colour, bridal, and daily salon services for Koramangala clients.",
    policies: { cancellationHours: 6 },
    approvedAt: new Date("2026-07-01T06:30:00.000Z"),
    rating: 4.8,
    reviewCount: 96,
  },
});

for (let day = 0; day < 7; day += 1) {
  await db.operatingHour.upsert({
    where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek: day } },
    update: {},
    create: {
      branchId: branch.id,
      dayOfWeek: day,
      opensAt: day === 0 ? "10:00" : "09:00",
      closesAt: "20:00",
      isClosed: false,
    },
  });
  await db.operatingHour.upsert({
    where: { branchId_dayOfWeek: { branchId: secondBranch.id, dayOfWeek: day } },
    update: { opensAt: day === 0 ? "10:30" : "10:00", closesAt: "21:00", isClosed: false },
    create: {
      branchId: secondBranch.id,
      dayOfWeek: day,
      opensAt: day === 0 ? "10:30" : "10:00",
      closesAt: "21:00",
      isClosed: false,
    },
  });
}

const serviceData = [
  ["Signature Haircut", "Hair", 60, 1200],
  ["Vitamin C Glow Facial", "Skin", 75, 2200],
  ["Balayage Colour", "Colour", 180, 6500],
  ["Gel Manicure", "Nails", 60, 1500],
  ["Deep Repair Hair Spa", "Hair", 75, 1800],
];

const templateNames = [...new Set(serviceData.map(([, category]) => category))];
const categoryTemplates = {};
for (let index = 0; index < templateNames.length; index += 1) {
  const name = templateNames[index];
  categoryTemplates[name] = await db.serviceCategoryTemplate.upsert({
    where: { name },
    update: { isActive: true, sortOrder: index },
    create: { name, sortOrder: index, description: `${name} services starter category` },
  });
}

const salonCategories = {};
for (const name of templateNames) {
  salonCategories[name] = await db.serviceCategory.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name } },
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      copiedFromTemplateId: categoryTemplates[name].id,
      name,
      sortOrder: categoryTemplates[name].sortOrder,
    },
  });
}

const seededServices = [];
for (const [name, category, durationMinutes, price] of serviceData) {
  let service = await db.service.findFirst({ where: { tenantId: tenant.id, name } });
  if (!service) {
    service = await db.service.create({
      data: { tenantId: tenant.id, name, category, categoryId: salonCategories[category].id, durationMinutes, price, taxRate: 18 },
    });
  } else if (!service.categoryId) {
    service = await db.service.update({ where: { id: service.id }, data: { categoryId: salonCategories[category].id } });
  }
  seededServices.push(service);
  await db.branchService.upsert({
    where: { branchId_serviceId: { branchId: branch.id, serviceId: service.id } },
    update: { isActive: true },
    create: { branchId: branch.id, serviceId: service.id, isActive: true },
  });
  await db.branchService.upsert({
    where: { branchId_serviceId: { branchId: secondBranch.id, serviceId: service.id } },
    update: { isActive: true, price: Number(price) + 250 },
    create: { branchId: secondBranch.id, serviceId: service.id, isActive: true, price: Number(price) + 250 },
  });
}

/**
 * Seed passwords come from the environment, never from this file.
 *
 * A password committed to the repo is a published password: anyone who can read the source knows
 * how to sign in as PLATFORM_ADMIN. That is survivable for a throwaway demo database and not
 * survivable for one holding real customers and real money - so in production the seed refuses to
 * invent credentials, and demands they be supplied explicitly.
 */
function seedPassword(variable) {
  const value = process.env[variable];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${variable} must be set to seed a production database. Refusing to use a default password.`);
  }
  return "Aero@1406";
}

const ownerPassword = await bcrypt.hash(seedPassword("SEED_OWNER_PASSWORD"), 12);
const adminPassword = await bcrypt.hash(seedPassword("SEED_ADMIN_PASSWORD"), 12);
const existingAdmin = await db.user.findFirst({
  where: {
    OR: [
      { email: "admin@operyx.demo" },
      { role: "PLATFORM_ADMIN", name: "Platform Administrator" },
    ],
  },
});
if (existingAdmin) {
  await db.user.update({ where: { id: existingAdmin.id }, data: { email: "admin@operyx.demo", passwordHash: adminPassword, role: "PLATFORM_ADMIN", tenantId: null } });
} else {
  await db.user.create({
    data: {
      email: "admin@operyx.demo",
      phone: "+919900000001",
      passwordHash: adminPassword,
      name: "Platform Administrator",
      role: "PLATFORM_ADMIN",
    },
  });
}
const admin = await db.user.findUnique({ where: { email: "admin@operyx.demo" } });

const existingOwner = await db.user.findFirst({
  where: {
    tenantId: tenant.id,
    OR: [
      { email: "owner@operyx.demo" },
      { phone: "+919900001406" },
      { name: "Sanya Iyer" },
    ],
  },
});
const owner = existingOwner ? await db.user.update({
  where: { id: existingOwner.id },
  data: { email: "owner@operyx.demo", tenantId: tenant.id, passwordHash: ownerPassword, role: "OWNER" },
}) : await db.user.create({
  data: {
    tenantId: tenant.id,
    email: "owner@operyx.demo",
    phone: "+919900001406",
    passwordHash: ownerPassword,
    name: "Sanya Iyer",
    role: "OWNER",
  },
});

await db.tenantSubscription.upsert({
  where: { tenantId: tenant.id },
  update: { planId: seededPlans.group.id, assignedBy: admin?.id },
  create: { tenantId: tenant.id, planId: seededPlans.group.id, assignedBy: admin?.id },
});

const pendingTenant = await db.tenant.upsert({
  where: { slug: "blush-and-bloom" },
  update: {},
  create: {
    name: "Blush & Bloom",
    slug: "blush-and-bloom",
    legalName: "Blush and Bloom Salon LLP",
    gstin: "29AAGFB2244P1Z8",
    status: "PENDING_REVIEW",
    subscription: "salon",
  },
});

await db.branch.upsert({
  where: { tenantId_slug: { tenantId: pendingTenant.id, slug: "whitefield" } },
  update: { isPublished: false, publicationStatus: "PENDING_REVIEW", submittedAt: new Date("2026-06-10T06:30:00.000Z") },
  create: {
    tenantId: pendingTenant.id,
    name: "Blush & Bloom - Whitefield",
    slug: "whitefield",
    phone: "+918045551212",
    email: "hello@blushandbloom.in",
    address: "ITPL Main Road, Whitefield",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560066",
    timezone: "Asia/Kolkata",
    isPublished: false,
    publicationStatus: "PENDING_REVIEW",
    submittedAt: new Date("2026-06-10T06:30:00.000Z"),
  },
});

await db.tenantSubscription.upsert({
  where: { tenantId: pendingTenant.id },
  update: { planId: seededPlans.salon.id, assignedBy: admin?.id },
  create: { tenantId: pendingTenant.id, planId: seededPlans.salon.id, assignedBy: admin?.id },
});

if (admin) {
  const seedRoot = path.join(process.cwd(), ".data", "uploads", "tenants", tenant.id, branch.id);
  await mkdir(seedRoot, { recursive: true });
  for (const type of ["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF", "SALON_MEDIA"]) {
    const fileName = `${type.toLowerCase()}.pdf`;
    const storageKey = `tenants/${tenant.id}/${branch.id}/${fileName}`;
    await writeFile(path.join(seedRoot, fileName), Buffer.from(`Operyx seed verification file: ${type}`));
    await db.verificationDocument.upsert({
      where: { storageKey },
      update: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), isPublic: type === "SALON_MEDIA" },
      create: {
        tenantId: tenant.id,
        branchId: branch.id,
        type,
        status: "APPROVED",
        fileName,
        storageKey,
        contentType: "application/pdf",
        sizeBytes: 40,
        isPublic: type === "SALON_MEDIA",
        uploadedById: owner.id,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
  }
}

const staffData = [
  ["meera@operyx.demo", "Meera Iyer", "Senior stylist", 12],
  ["kavya@operyx.demo", "Kavya Singh", "Skin therapist", 10],
  ["tara@operyx.demo", "Tara Jain", "Nail artist", 10],
  ["arjun@operyx.demo", "Arjun Nair", "Hair specialist", 10],
];

const seededStaff = [];
for (const [email, name, jobTitle, commissionRate] of staffData) {
  const existingUser = await db.user.findFirst({ where: { tenantId: tenant.id, OR: [{ email }, { name }] } });
  const user = existingUser
    ? await db.user.update({ where: { id: existingUser.id }, data: { email, tenantId: tenant.id, passwordHash: ownerPassword } })
    : await db.user.create({ data: { tenantId: tenant.id, email, name, role: "STYLIST", passwordHash: ownerPassword } });
  const staff = await db.staff.upsert({
    where: { userId: user.id },
    update: { branchId: branch.id, jobTitle, commissionRate },
    create: { userId: user.id, branchId: branch.id, jobTitle, commissionRate },
  });
  seededStaff.push(staff);
  await db.staffBranchAssignment.upsert({
    where: { staffId_branchId: { staffId: staff.id, branchId: branch.id } },
    update: { isPrimary: true },
    create: { staffId: staff.id, branchId: branch.id, isPrimary: true },
  });
  await db.staffBranchAssignment.upsert({
    where: { staffId_branchId: { staffId: staff.id, branchId: secondBranch.id } },
    update: { isPrimary: false },
    create: { staffId: staff.id, branchId: secondBranch.id, isPrimary: false },
  });
  for (const service of seededServices) {
    await db.staffService.upsert({
      where: { staffId_serviceId: { staffId: staff.id, serviceId: service.id } },
      update: {},
      create: { staffId: staff.id, serviceId: service.id },
    });
  }
  const shiftStart = new Date("2026-06-12T03:30:00.000Z");
  const shiftEnd = new Date("2026-06-12T14:30:00.000Z");
  const existingShift = await db.shift.findFirst({ where: { staffId: staff.id, startsAt: shiftStart, endsAt: shiftEnd } });
  if (!existingShift) await db.shift.create({ data: { staffId: staff.id, branchId: branch.id, startsAt: shiftStart, endsAt: shiftEnd } });
  const secondShiftStart = new Date("2026-06-13T04:30:00.000Z");
  const secondShiftEnd = new Date("2026-06-13T15:30:00.000Z");
  const existingSecondShift = await db.shift.findFirst({ where: { staffId: staff.id, branchId: secondBranch.id, startsAt: secondShiftStart, endsAt: secondShiftEnd } });
  if (!existingSecondShift) await db.shift.create({ data: { staffId: staff.id, branchId: secondBranch.id, startsAt: secondShiftStart, endsAt: secondShiftEnd } });
}

const customerData = [
  ["Ananya Rao", "+919876543210", "ananya@example.com"],
  ["Riya Kapoor", "+919988722110", "riya@example.com"],
  ["Nisha Shah", "+919765411223", "nisha@example.com"],
  ["Pooja Menon", "+919880045678", "pooja@example.com"],
  ["Sana Khan", "+919740012345", "sana@example.com"],
];

const seededCustomers = [];
for (const [name, phone, email] of customerData) {
  seededCustomers.push(await db.customer.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    update: { name, email },
    create: {
      tenantId: tenant.id,
      name,
      phone,
      email,
      whatsappConsent: true,
      smsConsent: true,
      emailConsent: true,
    },
  }));
}

const indiaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const appointmentTimes = [
  [new Date(`${indiaToday}T09:30:00+05:30`).toISOString(), 0, 0, "COMPLETED"],
  [new Date(`${indiaToday}T10:45:00+05:30`).toISOString(), 1, 1, "IN_SERVICE"],
  [new Date(`${indiaToday}T12:00:00+05:30`).toISOString(), 2, 3, "CONFIRMED"],
  [new Date(`${indiaToday}T13:30:00+05:30`).toISOString(), 3, 2, "CONFIRMED"],
  [new Date(`${indiaToday}T16:00:00+05:30`).toISOString(), 4, 4, "CONFIRMED"],
];

for (let index = 0; index < appointmentTimes.length; index += 1) {
  const [startsAt, customerIndex, serviceIndex, status] = appointmentTimes[index];
  const start = new Date(startsAt);
  const service = seededServices[serviceIndex];
  const appointment = await db.appointment.upsert({
    where: { idempotencyKey: `seed-appointment-${index + 1}` },
    update: {
      customerId: seededCustomers[customerIndex].id,
      serviceId: service.id,
      staffId: seededStaff[index % seededStaff.length].id,
      startsAt: start,
      endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
      status,
    },
    create: {
      branchId: branch.id,
      customerId: seededCustomers[customerIndex].id,
      serviceId: service.id,
      staffId: seededStaff[index % seededStaff.length].id,
      startsAt: start,
      endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
      status,
      source: "MARKETPLACE",
      idempotencyKey: `seed-appointment-${index + 1}`,
      statusHistory: { create: { status } },
      serviceLines: {
        create: {
          serviceId: service.id,
          staffId: seededStaff[index % seededStaff.length].id,
          startsAt: start,
          endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
          durationMinutes: service.durationMinutes,
          price: service.price,
          taxRate: service.taxRate,
        },
      },
    },
  });
  const existingLine = await db.appointmentServiceLine.findFirst({ where: { appointmentId: appointment.id } });
  if (!existingLine) {
    await db.appointmentServiceLine.create({
      data: {
        appointmentId: appointment.id,
        serviceId: service.id,
        staffId: seededStaff[index % seededStaff.length].id,
        startsAt: start,
        endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
        durationMinutes: service.durationMinutes,
        price: service.price,
        taxRate: service.taxRate,
      },
    });
  } else {
    await db.appointmentServiceLine.update({
      where: { id: existingLine.id },
      data: {
        serviceId: service.id,
        staffId: seededStaff[index % seededStaff.length].id,
        startsAt: start,
        endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
        durationMinutes: service.durationMinutes,
        price: service.price,
        taxRate: service.taxRate,
      },
    });
  }
}

const secondBranchAppointmentTimes = [
  [new Date(`${indiaToday}T11:00:00+05:30`).toISOString(), 0, 1, "CONFIRMED"],
  [new Date(`${indiaToday}T14:30:00+05:30`).toISOString(), 3, 2, "CHECKED_IN"],
  [new Date(`${indiaToday}T17:00:00+05:30`).toISOString(), 4, 0, "CONFIRMED"],
];

for (let index = 0; index < secondBranchAppointmentTimes.length; index += 1) {
  const [startsAt, customerIndex, serviceIndex, status] = secondBranchAppointmentTimes[index];
  const start = new Date(startsAt);
  const service = seededServices[serviceIndex];
  const staff = seededStaff[(index + 1) % seededStaff.length];
  const appointment = await db.appointment.upsert({
    where: { idempotencyKey: `seed-koramangala-appointment-${index + 1}` },
    update: {
      branchId: secondBranch.id,
      customerId: seededCustomers[customerIndex].id,
      serviceId: service.id,
      staffId: staff.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
      status,
      source: index === 1 ? "PHONE" : "STAFF_CREATED",
    },
    create: {
      branchId: secondBranch.id,
      customerId: seededCustomers[customerIndex].id,
      serviceId: service.id,
      staffId: staff.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
      status,
      source: index === 1 ? "PHONE" : "STAFF_CREATED",
      idempotencyKey: `seed-koramangala-appointment-${index + 1}`,
      statusHistory: { create: { status } },
      serviceLines: {
        create: {
          serviceId: service.id,
          staffId: staff.id,
          startsAt: start,
          endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
          durationMinutes: service.durationMinutes,
          price: service.price,
          taxRate: service.taxRate,
        },
      },
    },
  });
  const existingLine = await db.appointmentServiceLine.findFirst({ where: { appointmentId: appointment.id } });
  if (!existingLine) {
    await db.appointmentServiceLine.create({
      data: {
        appointmentId: appointment.id,
        serviceId: service.id,
        staffId: staff.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
        durationMinutes: service.durationMinutes,
        price: service.price,
        taxRate: service.taxRate,
      },
    });
  } else {
    await db.appointmentServiceLine.update({
      where: { id: existingLine.id },
      data: {
        serviceId: service.id,
        staffId: staff.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
        durationMinutes: service.durationMinutes,
        price: service.price,
        taxRate: service.taxRate,
      },
    });
  }
}

const inventoryData = [
  ["L'Oréal Absolut Repair Shampoo", "LR-SH-500", "Hair care", 8, 10, 900, 1250],
  ["Olaplex No. 3", "OL-N3-100", "Treatment", 18, 8, 1800, 2800],
  ["OPI GelColor - Bubble Bath", "OP-GC-BB", "Nails", 5, 6, 1150, 1750],
  ["Dermalogica Daily Microfoliant", "DM-DM-74", "Skin care", 12, 5, 2400, 3850],
];

for (const [name, sku, category, quantity, reorderLevel, costPrice, retailPrice] of inventoryData) {
  const item = await db.inventoryItem.upsert({
    where: { tenantId_sku: { tenantId: tenant.id, sku } },
    update: { name, category, reorderLevel, costPrice, retailPrice },
    create: { tenantId: tenant.id, name, sku, category, unit: "piece", reorderLevel, costPrice, retailPrice },
  });
  await db.branchStock.upsert({
    where: { branchId_inventoryItemId: { branchId: branch.id, inventoryItemId: item.id } },
    update: { quantity },
    create: { branchId: branch.id, inventoryItemId: item.id, quantity },
  });
  await db.branchStock.upsert({
    where: { branchId_inventoryItemId: { branchId: secondBranch.id, inventoryItemId: item.id } },
    update: { quantity: Math.max(3, Number(quantity) - 2) },
    create: { branchId: secondBranch.id, inventoryItemId: item.id, quantity: Math.max(3, Number(quantity) - 2) },
  });
}

const seededExpense = await db.expense.findFirst({ where: { branchId: branch.id, category: "Utilities", note: "Pilot seed expense" } });
if (!seededExpense) {
  await db.expense.create({
    data: { branchId: branch.id, category: "Utilities", amount: 3500, note: "Pilot seed expense", spentAt: new Date("2026-06-10T06:30:00.000Z") },
  });
}

const seededMembership = await db.membership.findFirst({ where: { tenantId: tenant.id, name: "Operyx Glow Club" } });
if (!seededMembership) {
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      name: "Operyx Glow Club",
      price: 4999,
      durationDays: 365,
      benefits: { description: "10% off services and one complimentary consultation" },
    },
  });
}

const seededPackage = await db.package.findFirst({ where: { tenantId: tenant.id, name: "Hair Ritual Pack" } });
if (!seededPackage) {
  await db.package.create({
    data: {
      tenantId: tenant.id,
      name: "Hair Ritual Pack",
      price: 7200,
      validityDays: 180,
      services: [{ serviceId: seededServices[0].id, quantity: 4 }],
    },
  });
}

await db.giftCard.upsert({
  where: { code: "RUV-DEMO-5000" },
  update: {},
  create: {
    tenantId: tenant.id,
    branchId: branch.id,
    customerId: seededCustomers[0].id,
    code: "RUV-DEMO-5000",
    initialValue: 5000,
    balance: 5000,
    expiresAt: new Date("2027-03-31T18:29:59.000Z"),
  },
});

const seededCampaign = await db.campaign.findFirst({ where: { tenantId: tenant.id, name: "Monsoon Hair Care" } });
if (!seededCampaign) {
  await db.campaign.create({
    data: {
      tenantId: tenant.id,
      name: "Monsoon Hair Care",
      channel: "WHATSAPP",
      audience: { segment: "ALL", branchId: branch.id },
      template: "Hello {{name}}, book your monsoon hair ritual at Velvet & Glow.",
      status: "DRAFT",
    },
  });
}

const reviewAppointment = await db.appointment.findFirst({
  where: { branchId: branch.id, status: "COMPLETED", review: null },
  orderBy: { startsAt: "desc" },
});
if (reviewAppointment) {
  await db.review.create({
    data: {
      branchId: branch.id,
      customerId: reviewAppointment.customerId,
      appointmentId: reviewAppointment.id,
      rating: 5,
      comment: "Lovely service and a very smooth appointment experience.",
    },
  });
}

await db.auditLog.create({
  data: {
    userId: owner.id,
    tenantId: tenant.id,
    action: "DATABASE_SEEDED",
    entity: "Tenant",
    entityId: tenant.id,
    metadata: { source: "prisma/seed.mjs" },
  },
});

console.log(JSON.stringify({
  tenant: tenant.name,
  branches: [branch.name, secondBranch.name],
  services: seededServices.length,
  staff: seededStaff.length,
  customers: seededCustomers.length,
  appointments: appointmentTimes.length + secondBranchAppointmentTimes.length,
}, null, 2));

await db.$disconnect();
