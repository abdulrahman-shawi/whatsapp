import { prisma } from "../lib/prisma";
async function main() {
  const agents = await prisma.agent.findMany();
  for (const a of agents) {
    const cleaned = a.handoffKeywords.filter((k) => k.trim() !== "رسالة");
    if (cleaned.length !== a.handoffKeywords.length) {
      await prisma.agent.update({
        where: { id: a.id },
        data: { handoffKeywords: cleaned },
      });
      console.log("حدّث الوكيل", a.id, "— الكلمات الآن:", cleaned);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
