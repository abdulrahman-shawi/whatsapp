import { prisma } from "../lib/prisma";

async function main() {
  const msgs = await prisma.message.findMany({
    where: { OR: [{ mediaId: { not: null } }, { body: { contains: "صورة" } }] },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      body: true,
      direction: true,
      mediaId: true,
      mediaType: true,
      mediaMime: true,
      createdAt: true,
    },
  });
  console.log(JSON.stringify(msgs, null, 1));
}

main()
  .catch((e) => {
    console.error("ERR", e.message);
  })
  .finally(() => prisma.$disconnect());
