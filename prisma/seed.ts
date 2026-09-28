// بيانات تجريبية: مستخدم demo@example.com / demo1234 مع وكيل ومحادثات جاهزة
// التشغيل: npx tsx prisma/seed.ts (أو npm run db:seed)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// توقيت نسبي: قبل N دقيقة من الآن
function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

async function main() {
  // المستخدم التجريبي ومساحة العمل
  let user = await prisma.user.findUnique({
    where: { email: "demo@example.com" },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "مستخدم تجريبي",
        email: "demo@example.com",
        passwordHash: await bcrypt.hash("demo1234", 10),
      },
    });
    console.log("تم إنشاء المستخدم التجريبي");
  }

  let workspaceId: string;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  if (membership) {
    workspaceId = membership.workspaceId;
  } else {
    const workspace = await prisma.workspace.create({
      data: {
        name: "المتجر التجريبي",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
  }

  // الوكيل التجريبي مع مصادر معرفة
  let agent = await prisma.agent.findFirst({ where: { workspaceId } });
  if (!agent) {
    agent = await prisma.agent.create({
      data: {
        workspaceId,
        name: "مساعد المتجر",
        systemPrompt:
          "أنت مساعد خدمة عملاء لمتجر إلكتروني عربي. أجب بالعربية بأسلوب ودود ومختصر، وساعد العملاء في الاستفسار عن الطلبات والشحن والاسترجاع.",
        welcomeMessage: "أهلاً بك في متجرنا! كيف أقدر أساعدك اليوم؟",
        handoffKeywords: ["موظف", "بشري", "شكوى"],
        knowledgeSources: {
          create: [
            {
              type: "TEXT",
              title: "سياسة الشحن",
              content:
                "الشحن داخل المدينة يستغرق من يوم إلى يومين عمل، وباقي المناطق من 3 إلى 5 أيام عمل. الشحن مجاني للطلبات فوق 200 ريال.",
            },
            {
              type: "TEXT",
              title: "سياسة الاسترجاع",
              content:
                "يمكن استرجاع المنتجات خلال 14 يوماً من الاستلام بحالتها الأصلية، ويُعاد المبلغ خلال 5 أيام عمل.",
            },
          ],
        },
      },
    });
    console.log("تم إنشاء الوكيل التجريبي");
  }

  // لا نكرر البيانات إذا وُجدت جهات اتصال مسبقاً
  const contactsCount = await prisma.contact.count({ where: { workspaceId } });
  if (contactsCount > 0) {
    console.log("البيانات التجريبية موجودة مسبقاً — تم التخطي");
    return;
  }

  // المحادثة الأولى: واتساب بحالة آلي
  const c1 = await prisma.contact.create({
    data: {
      workspaceId,
      waPhone: "+966501234567",
      name: "أحمد محمد",
      tags: ["عميل جديد"],
      conversations: {
        create: {
          workspaceId,
          agentId: agent.id,
          platform: "WHATSAPP",
          status: "AI",
          lastMessageAt: minutesAgo(5),
          messages: {
            create: [
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "السلام عليكم، وصلني الطلب بس المقاس غلط",
                isRead: true,
                createdAt: minutesAgo(12),
              },
              {
                direction: "OUTBOUND",
                senderType: "AI",
                body: "وعليكم السلام! نعتذر منك. يمكنك طلب استبدال المقاس خلال 14 يوماً من الاستلام. هل تريد أن أجهّز لك طلب استبدال؟",
                createdAt: minutesAgo(11),
              },
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "نعم لو سمحت، أبغى مقاس أكبر",
                isRead: true,
                createdAt: minutesAgo(5),
              },
            ],
          },
        },
      },
    },
  });

  // المحادثة الثانية: واتساب بحالة يدوي مع رسائل غير مقروءة
  await prisma.contact.create({
    data: {
      workspaceId,
      waPhone: "+966559876543",
      name: "سارة العتيبي",
      tags: ["عميل مميز"],
      notes: "تفضّل التواصل مساءً",
      conversations: {
        create: {
          workspaceId,
          agentId: agent.id,
          platform: "WHATSAPP",
          status: "MANUAL",
          lastMessageAt: minutesAgo(2),
          messages: {
            create: [
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "مساء الخير، أبغى أستفسر عن عباية الكتان المتوفرة عندكم",
                isRead: true,
                createdAt: minutesAgo(30),
              },
              {
                direction: "OUTBOUND",
                senderType: "HUMAN",
                body: "مساء النور! متوفرة بثلاثة ألوان: أسود وبيج وزيتي. أي لون يعجبك؟",
                createdAt: minutesAgo(25),
              },
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "الزيتي حلو، هل فيه خصم حالياً؟",
                isRead: false,
                createdAt: minutesAgo(3),
              },
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "وكم سعرها بعد الخصم؟",
                isRead: false,
                createdAt: minutesAgo(2),
              },
            ],
          },
        },
      },
    },
  });

  // المحادثة الثالثة: من ويدجت الموقع
  await prisma.contact.create({
    data: {
      workspaceId,
      waPhone: "+966500000000",
      name: "زائر الموقع",
      tags: ["من الموقع"],
      conversations: {
        create: {
          workspaceId,
          agentId: agent.id,
          platform: "WIDGET",
          status: "AI",
          lastMessageAt: minutesAgo(60),
          messages: {
            create: [
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "هل يوجد شحن لمدينة جدة؟",
                isRead: true,
                createdAt: minutesAgo(65),
              },
              {
                direction: "OUTBOUND",
                senderType: "AI",
                body: "نعم بالتأكيد! الشحن لجدة يستغرق من يوم إلى يومين عمل، ومجاني للطلبات فوق 200 ريال.",
                createdAt: minutesAgo(64),
              },
              {
                direction: "INBOUND",
                senderType: "CUSTOMER",
                body: "ممتاز، شكراً لك",
                isRead: true,
                createdAt: minutesAgo(60),
              },
            ],
          },
        },
      },
    },
  });

  console.log(`تم إنشاء البيانات التجريبية بنجاح (جهة اتصال أولى: ${c1.id})`);
  console.log("تسجيل الدخول: demo@example.com / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
