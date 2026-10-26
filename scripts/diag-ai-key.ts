// فحص فعلي: هل يولّد الرد بمفتاح الإعدادات الحالي؟
// التشغيل: npx tsx scripts/diag-ai-key.ts
import { prisma } from "../lib/prisma";
import { generateReply, resolveAiConfig } from "../lib/openai";

async function main() {
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) return console.log("لا مساحة عمل");
  const config = await resolveAiConfig();
  console.log("النموذج:", config.model, "| الرابط:", config.baseUrl);
  const reply = await generateReply(
    [{ role: "user", content: "مرحباً، ما اسم متجركم؟" }],
    "أنت مساعد متجر. رد بجملة قصيرة.",
    [],
    config
  );
  if (reply) {
    console.log("✅ الرد:", reply.content);
    console.log("التوكنات:", reply.usage);
  } else {
    console.log("❌ تعذّر التوليد — المفتاح مرفوض أو انتهت صلاحيته أو انقطعت الشبكة");
  }
}

main().catch((e) => {
  console.error("استثناء:", e.message);
  process.exit(1);
});
