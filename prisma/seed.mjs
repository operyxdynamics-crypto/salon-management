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

const plans = [
  { code: "starter", name: "Starter", description: "For a single-location salon beginning on Ruvyra.", maxBranches: 1, maxStaff: 8, maxServices: 30, maxMonthlyAppointments: 500, maxStorageMb: 250, features: ["operations", "marketplace"] },
  { code: "growth", name: "Growth", description: "For established salons with larger teams and reporting.", maxBranches: 3, maxStaff: 30, maxServices: 100, maxMonthlyAppointments: 3000, maxStorageMb: 2048, features: ["operations", "marketplace", "advanced_reports", "inventory"] },
  { code: "scale", name: "Scale", description: "For multi-branch salon groups.", maxBranches: 15, maxStaff: 200, maxServices: 500, maxMonthlyAppointments: 20000, maxStorageMb: 10240, features: ["operations", "marketplace", "advanced_reports", "inventory", "priority_support"] },
];
const seededPlans = {};
for (const plan of plans) {
  seededPlans[plan.code] = await db.subscriptionPlan.upsert({
    where: { code: plan.code },
    update: plan,
    create: plan,
  });
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
    subscription: "growth",
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
}

const ownerPassword = await bcrypt.hash("Aero@1406", 12);
const adminPassword = await bcrypt.hash("Aero@1406", 12);
const existingAdmin = await db.user.findFirst({ where: { email: { in: ["admin@neel.demo", "admin@ruvyra.demo", "admin@velora.demo"] } } });
if (existingAdmin) {
  await db.user.update({ where: { id: existingAdmin.id }, data: { email: "admin@neel.demo", passwordHash: adminPassword, role: "PLATFORM_ADMIN", tenantId: null } });
} else {
  await db.user.create({
    data: {
      email: "admin@neel.demo",
      phone: "+919900000001",
      passwordHash: adminPassword,
      name: "Platform Administrator",
      role: "PLATFORM_ADMIN",
    },
  });
}
const admin = await db.user.findUnique({ where: { email: "admin@neel.demo" } });

const existingOwner = await db.user.findFirst({ where: { email: { in: ["owner@neel.demo", "owner@ruvyra.demo", "owner@velora.demo"] } } });
const owner = existingOwner ? await db.user.update({
  where: { id: existingOwner.id },
  data: { email: "owner@neel.demo", tenantId: tenant.id, passwordHash: ownerPassword, role: "OWNER" },
}) : await db.user.create({
  data: {
    tenantId: tenant.id,
    email: "owner@neel.demo",
    phone: "+919900001406",
    passwordHash: ownerPassword,
    name: "Sanya Iyer",
    role: "OWNER",
  },
});

await db.tenantSubscription.upsert({
  where: { tenantId: tenant.id },
  update: { planId: seededPlans.growth.id, assignedBy: admin?.id },
  create: { tenantId: tenant.id, planId: seededPlans.growth.id, assignedBy: admin?.id },
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
    subscription: "starter",
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
  update: { planId: seededPlans.starter.id, assignedBy: admin?.id },
  create: { tenantId: pendingTenant.id, planId: seededPlans.starter.id, assignedBy: admin?.id },
});

if (admin) {
  const seedRoot = path.join(process.cwd(), ".data", "uploads", "tenants", tenant.id, branch.id);
  await mkdir(seedRoot, { recursive: true });
  for (const type of ["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF", "SALON_MEDIA"]) {
    const fileName = `${type.toLowerCase()}.pdf`;
    const storageKey = `tenants/${tenant.id}/${branch.id}/${fileName}`;
    await writeFile(path.join(seedRoot, fileName), Buffer.from(`Ruvyra seed verification file: ${type}`));
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
  ["meera@neel.demo", "meera@ruvyra.demo", "Meera Iyer", "Senior stylist", 12],
  ["kavya@neel.demo", "kavya@ruvyra.demo", "Kavya Singh", "Skin therapist", 10],
  ["tara@neel.demo", "tara@ruvyra.demo", "Tara Jain", "Nail artist", 10],
  ["arjun@neel.demo", "arjun@ruvyra.demo", "Arjun Nair", "Hair specialist", 10],
];

const seededStaff = [];
for (const [email, legacyEmail, name, jobTitle, commissionRate] of staffData) {
  const existingUser = await db.user.findFirst({ where: { email: { in: [email, legacyEmail] } } });
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
}

const seededExpense = await db.expense.findFirst({ where: { branchId: branch.id, category: "Utilities", note: "Pilot seed expense" } });
if (!seededExpense) {
  await db.expense.create({
    data: { branchId: branch.id, category: "Utilities", amount: 3500, note: "Pilot seed expense", spentAt: new Date("2026-06-10T06:30:00.000Z") },
  });
}

const seededMembership = await db.membership.findFirst({ where: { tenantId: tenant.id, name: "Ruvyra Glow Club" } });
if (!seededMembership) {
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      name: "Ruvyra Glow Club",
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
  branch: branch.name,
  services: seededServices.length,
  staff: seededStaff.length,
  customers: seededCustomers.length,
  appointments: appointmentTimes.length,
}, null, 2));

await db.$disconnect();
