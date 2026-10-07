import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds, sendWhatsAppMessage } from "@/lib/whatsapp";

// تذكير الحجوزات التلقائي: رسالة واتساب للعميل ساعة قبل موعده
// تُستدعى من كرون كل ٥ دقائق — الحجز الواحد يُذكَّر مرة واحدة (remindedAt)
export async function sendBookingReminders(): Promise<number> {
  const now = new Date();
  const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const due = await prisma.booking.findMany({
    where: {
      remindedAt: null,
      scheduledAt: { gt: now, lte: hourFromNow },
    },
    take: 50,
    include: { contact: { select: { waPhone: true, name: true } } },
  });
  if (due.length === 0) return 0;

  let sent = 0;
  for (const booking of due) {
    try {
      const creds = await resolveWhatsAppCreds(booking.workspaceId);
      if (!creds) throw new Error("لا يوجد مزود واتساب مُعدّ");
      const time = new Intl.DateTimeFormat("ar", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(booking.scheduledAt);
      const body = `تذكير بموعدك "${booking.title}" اليوم الساعة ${time}. نراك قريباً!`;
      const ok = await sendWhatsAppMessage(booking.contact.waPhone, body, creds);
      if (!ok) throw new Error("رفض المزود الإرسال");
      await prisma.booking.update({
        where: { id: booking.id },
        data: { remindedAt: new Date() },
      });
      sent++;
    } catch (e) {
      // نتركه لدورة لاحقة — لن يُعاد المحاولة إلا بعد مرور الظروف (remindedAt لا يُحدَّد عند الفشل)
      console.error(`[bookings] فشل تذكير الحجز ${booking.id}:`, e);
    }
  }
  return sent;
}
