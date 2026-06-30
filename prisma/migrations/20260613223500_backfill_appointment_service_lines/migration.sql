INSERT INTO "AppointmentServiceLine" (
  "id",
  "appointmentId",
  "serviceId",
  "staffId",
  "startsAt",
  "endsAt",
  "quantity",
  "durationMinutes",
  "price",
  "taxRate",
  "sortOrder"
)
SELECT
  'line_' || md5(appointment."id"),
  appointment."id",
  appointment."serviceId",
  appointment."staffId",
  appointment."startsAt",
  appointment."endsAt",
  1,
  GREATEST(1, ROUND(EXTRACT(EPOCH FROM (appointment."endsAt" - appointment."startsAt")) / 60)::INTEGER),
  service."price",
  service."taxRate",
  0
FROM "Appointment" AS appointment
JOIN "Service" AS service ON service."id" = appointment."serviceId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "AppointmentServiceLine" AS line
  WHERE line."appointmentId" = appointment."id"
);
