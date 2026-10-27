import { prisma } from "../lib/prisma";
import {
  INTEGRATION_KEYS,
  integrationSecretContext,
  isIntegrationKey,
  isSecretIntegrationKey,
} from "../lib/settings";
import {
  PLATFORM_CONFIG_KEYS,
  isSecretPlatformKey,
  platformSecretContext,
} from "../lib/platform-config";
import { encryptSecret, isEncryptedSecret } from "../lib/secret-crypto";

async function main() {
  // نفشل قبل أي كتابة إذا كان المفتاح مفقوداً أو غير صالح.
  encryptSecret("key-check", "migration:key-check");

  let integrations = 0;
  const settings = await prisma.setting.findMany({
    where: { key: { in: [...INTEGRATION_KEYS.map((item) => item.key)] } },
  });
  for (const row of settings) {
    if (
      !isIntegrationKey(row.key) ||
      !isSecretIntegrationKey(row.key) ||
      !row.value ||
      isEncryptedSecret(row.value)
    ) continue;

    await prisma.setting.update({
      where: {
        workspaceId_key: { workspaceId: row.workspaceId, key: row.key },
      },
      data: {
        value: encryptSecret(
          row.value,
          integrationSecretContext(row.workspaceId, row.key)
        ),
      },
    });
    integrations++;
  }

  let platformSettings = 0;
  for (const key of PLATFORM_CONFIG_KEYS) {
    if (!isSecretPlatformKey(key)) continue;
    const row = await prisma.platformSetting.findUnique({ where: { key } });
    if (!row?.value || isEncryptedSecret(row.value)) continue;
    await prisma.platformSetting.update({
      where: { key },
      data: { value: encryptSecret(row.value, platformSecretContext(key)) },
    });
    platformSettings++;
  }

  console.log(
    `تم تشفير ${integrations} إعداد تكامل و${platformSettings} إعداد منصة.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "فشل ترحيل التشفير");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
