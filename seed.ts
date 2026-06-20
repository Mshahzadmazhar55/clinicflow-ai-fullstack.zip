import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { subDays, subMonths, addDays, setHours, setMinutes } from "date-fns";

const db = new PrismaClient();
const IDR = (n: number) => n * 100; // helper: rupiah -> cents

async function main() {
  // wipe (dev only)
  await db.message.deleteMany(); await db.conversation.deleteMany();
  await db.invoice.deleteMany(); await db.appointment.deleteMany();
  await db.campaign.deleteMany(); await db.segment.deleteMany();
  await db.lead.deleteMany(); await db.patient.deleteMany();
  await db.service.deleteMany(); await db.practitioner.deleteMany();
  await db.auditLog.deleteMany(); await db.whatsAppConfig.deleteMany();
  await db.subscription.deleteMany(); await db.user.deleteMany(); await db.clinic.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);
  const now = new Date();

  const clinic = await db.clinic.create({
    data: {
      name: "Glow Aesthetic Clinic", slug: "glow-demo", city: "Jakarta", province: "DKI Jakarta",
      address: "Jl. Senopati No. 88, Kebayoran Baru", phone: "+62 812 0000 0000", whatsappNumber: "+6281200000000",
      subscription: { create: {
        tier: "GROWTH", status: "ACTIVE", seatsLimit: 15, patientsLimit: 5000, whatsappMsgLimit: 10000, aiCreditsLimit: 5000,
        whatsappMsgUsed: 6420, aiCreditsUsed: 3180, currentPeriodEnd: addDays(now, 12),
      }},
      whatsappConfig: { create: { phoneNumberId: "109xxxxxxxx", aiEnabled: true } },
    },
  });

  const mkUser = (name: string, email: string, role: string, status = "ACTIVE") =>
    db.user.create({ data: { clinicId: clinic.id, name, email, role, status, passwordHash, lastActiveAt: status === "ACTIVE" ? now : null } });
  const admin = await mkUser("Owner Admin", "admin@glow-demo.id", "ADMIN");
  await mkUser("Ops Manager", "manager@glow-demo.id", "MANAGER");
  await mkUser("Front Desk", "reception@glow-demo.id", "RECEPTIONIST");
  const docUser = await mkUser("Dr. Sari", "doctor@glow-demo.id", "DOCTOR");
  await mkUser("Nurse Bagus", "bagus@glow-demo.id", "STAFF", "INVITED");

  const drSari = await db.practitioner.create({ data: { clinicId: clinic.id, userId: docUser.id, displayName: "Dr. Sari", specialty: "Aesthetic Dermatologist", color: "#7c3aed" } });
  const drBayu = await db.practitioner.create({ data: { clinicId: clinic.id, displayName: "Dr. Bayu", specialty: "Dental Surgeon", color: "#2563eb" } });

  const svc = await Promise.all([
    db.service.create({ data: { clinicId: clinic.id, name: "Botox (per area)", category: "Injectables", durationMin: 30, priceCents: IDR(1_500_000) } }),
    db.service.create({ data: { clinicId: clinic.id, name: "HydraFacial", category: "Facial", durationMin: 60, priceCents: IDR(750_000) } }),
    db.service.create({ data: { clinicId: clinic.id, name: "Dental Scaling", category: "Dental", durationMin: 45, priceCents: IDR(400_000) } }),
    db.service.create({ data: { clinicId: clinic.id, name: "Dermal Filler", category: "Injectables", durationMin: 45, priceCents: IDR(2_800_000) } }),
  ]);

  const patientSeed = [
    ["Rina Wijaya", "+62 812-3456-7890", "ACTIVE", ["Botox", "VIP"], 12_400_000],
    ["Dewi Lestari", "+62 813-9988-1122", "ACTIVE", ["Facial"], 3_200_000],
    ["Andini Putri", "+62 821-7766-5544", "ACTIVE", ["Scaling"], 1_800_000],
    ["Sari Kusuma", "+62 856-1234-9087", "ACTIVE", ["HydraFacial", "VIP"], 9_800_000],
    ["Maya Anggraini", "+62 877-4455-6677", "INACTIVE", ["Filler"], 5_600_000],
    ["Putri Handayani", "+62 811-2200-3344", "NEW", ["Consultation"], 0],
    ["Nadia Rahmawati", "+62 838-9090-1212", "ACTIVE", ["Peeling"], 2_100_000],
    ["Citra Melati", "+62 822-3434-5656", "INACTIVE", ["Botox"], 4_500_000],
    ["Bunga Pertiwi", "+62 819-7878-1010", "ACTIVE", ["Facial", "VIP"], 7_300_000],
    ["Fitri Amalia", "+62 852-1122-3434", "ACTIVE", ["Scaling"], 1_200_000],
    ["Intan Permata", "+62 815-5656-7878", "ACTIVE", ["HydraFacial"], 3_900_000],
    ["Lia Safitri", "+62 878-9898-2323", "NEW", ["Consultation"], 500_000],
  ] as const;
  const patients = [];
  for (const [fullName, phone, status, tags, spent] of patientSeed) {
    patients.push(await db.patient.create({
      data: { clinicId: clinic.id, fullName, phone, status, tagsJson: JSON.stringify(tags), totalSpent: IDR(spent as number), lastVisitAt: subDays(now, Math.floor(Math.random() * 40)) },
    }));
  }

  // Appointments: a few today, some across the week
  const at = (day: number, h: number, m = 0) => setMinutes(setHours(addDays(now, day), h), m);
  const apptSeed = [
    [patients[2].id, svc[0].id, drSari.id, at(0, 9), 30, "CONFIRMED"],
    [patients[1].id, svc[1].id, drSari.id, at(0, 10, 30), 60, "CHECKED_IN"],
    [patients[9].id, svc[2].id, drBayu.id, at(0, 13), 45, "CONFIRMED"],
    [patients[3].id, svc[3].id, drSari.id, at(0, 15, 30), 45, "REQUESTED"],
    [patients[0].id, svc[0].id, drSari.id, at(2, 11), 30, "CONFIRMED"],
    [patients[8].id, svc[1].id, drSari.id, at(3, 14), 60, "CONFIRMED"],
  ] as const;
  for (const [patientId, serviceId, practitionerId, startAt, dur, status] of apptSeed) {
    await db.appointment.create({ data: { clinicId: clinic.id, patientId, serviceId, practitionerId, startAt, endAt: new Date(+startAt + dur * 60000), status } });
  }

  const leadSeed = [
    ["Budi Santoso", "INSTAGRAM", "HydraFacial", 750_000, "NEW"],
    ["Wulan Sari", "WHATSAPP", "Botox", 1_500_000, "NEW"],
    ["Agus Pratama", "GOOGLE", "Scaling", 400_000, "CONTACTED"],
    ["Sinta Dewi", "TIKTOK", "Filler", 2_800_000, "CONTACTED"],
    ["Rizki Maulana", "REFERRAL", "Botox", 1_500_000, "QUALIFIED"],
    ["Tari Utami", "WHATSAPP", "Peeling", 1_200_000, "CONSULT"],
    ["Hana Salsabila", "WEBSITE", "Facial", 3_200_000, "CONVERTED"],
  ] as const;
  for (const [name, source, interest, value, stage] of leadSeed) {
    await db.lead.create({ data: { clinicId: clinic.id, name, source, interest, valueCents: IDR(value as number), stage, ownerId: admin.id } });
  }

  // Conversations + messages
  const convoSeed = [
    ["Rina Wijaya", "+62 812-3456-7890", "AI", 0, [["PATIENT", "Halo, mau tanya harga botox?"], ["AI", "Halo Kak! 😊 Botox kami mulai dari Rp 1.500.000 per area. Mau saya bantu cek jadwal?"], ["PATIENT", "Bisa booking Sabtu?"], ["AI", "Ada slot Sabtu 10:00 dan 14:00 dengan dr. Sari ✅ Pilih yang mana?"]]],
    ["Budi Santoso", "+62 856-0000-0000", "NEEDS_HUMAN", 2, [["PATIENT", "Saya mau komplain hasil treatment kemarin"], ["AI", "Mohon maaf atas ketidaknyamanannya, Kak. Saya hubungkan ke tim kami ya."]]],
    ["Dewi Lestari", "+62 813-9988-1122", "CLOSED", 0, [["PATIENT", "Terima kasih kak!"], ["AI", "Sama-sama, Kak Dewi! Sampai jumpa 🌸"]]],
    ["Sari Kusuma", "+62 856-1234-9087", "AI", 1, [["PATIENT", "Harga HydraFacial berapa ya?"], ["AI", "HydraFacial Rp 750.000 Kak, durasi sekitar 60 menit. Mau booking?"]]],
  ] as const;
  for (const [contactName, phone, status, unread, msgs] of convoSeed) {
    const convo = await db.conversation.create({ data: { clinicId: clinic.id, contactName, phone, status, unread: unread as number, lastAt: now } });
    let t = subDays(now, 0);
    for (const [sender, body] of msgs as any[]) {
      await db.message.create({ data: { conversationId: convo.id, sender, body, createdAt: t } });
      t = new Date(+t + 60000);
    }
  }

  const segs = await Promise.all([
    db.segment.create({ data: { clinicId: clinic.id, name: "Returning · 90 days", count: 842 } }),
    db.segment.create({ data: { clinicId: clinic.id, name: "Inactive Botox patients", count: 310 } }),
    db.segment.create({ data: { clinicId: clinic.id, name: "VIP", count: 96 } }),
    db.segment.create({ data: { clinicId: clinic.id, name: "New leads (uncontacted)", count: 54 } }),
  ]);

  await db.campaign.createMany({ data: [
    { clinicId: clinic.id, name: "June Glow Promo", channel: "WHATSAPP", status: "SENT", segmentId: segs[0].id, recipients: 842, openRate: 71, body: "Promo Juni 20%!", sentAt: subDays(now, 19) },
    { clinicId: clinic.id, name: "Botox Reactivation", channel: "WHATSAPP", status: "SENDING", segmentId: segs[1].id, recipients: 310, body: "Kangen glowing?" },
    { clinicId: clinic.id, name: "VIP Birthday Treats", channel: "EMAIL", status: "SCHEDULED", segmentId: segs[2].id, recipients: 96, body: "Happy birthday!", scheduledAt: addDays(now, 5) },
    { clinicId: clinic.id, name: "Skincare Tips #12", channel: "EMAIL", status: "DRAFT", recipients: 0, body: "Tips kulit sehat" },
  ]});

  // Invoices across 6 months (drives revenue charts) + recent ones
  let invNo = 0;
  const mkInv = (patientId: string, amount: number, status: string, method: string | null, paidAgoDays: number) =>
    db.invoice.create({ data: {
      clinicId: clinic.id, number: `INV-${now.getFullYear()}-${String(++invNo).padStart(4, "0")}`,
      patientId, amountCents: IDR(amount), status, method, issuedAt: subDays(now, paidAgoDays),
      paidAt: status === "PAID" ? subDays(now, paidAgoDays) : null,
    }});
  // monthly paid history for the chart
  for (let m = 5; m >= 0; m--) {
    const count = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const p = patients[Math.floor(Math.random() * patients.length)];
      await db.invoice.create({ data: {
        clinicId: clinic.id, number: `INV-H-${String(++invNo).padStart(4, "0")}`, patientId: p.id,
        amountCents: IDR(400_000 + Math.floor(Math.random() * 2_600_000)), status: "PAID", method: "QRIS",
        issuedAt: subMonths(now, m), paidAt: subMonths(now, m),
      }});
    }
  }
  await mkInv(patients[3].id, 2_400_000, "PAID", "QRIS", 2);
  await mkInv(patients[0].id, 1_500_000, "PAID", "Card", 8);
  await mkInv(patients[4].id, 5_600_000, "OVERDUE", "Transfer", 21);
  await mkInv(patients[8].id, 750_000, "SENT", null, 6);
  await mkInv(patients[6].id, 2_100_000, "PAID", "GoPay", 15);

  console.log("✅ Seed complete.");
  console.log("   Login: admin@glow-demo.id / password123");
  console.log(`   Patients: ${patients.length} · Leads: ${leadSeed.length} · Clinic: ${clinic.slug}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
