# منصة واتساب متعددة المساحات

تطبيق Next.js لإدارة محادثات واتساب والوكلاء الذكيين وسير العمل. يدعم Meta WhatsApp Cloud API وUltraMsg، مع عزل كل مساحة عمل وبيانات اعتمادها.

## التشغيل محلياً

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

ثم افتح `http://localhost:3000`.

## الإعدادات الإلزامية قبل الإنتاج

- `DATABASE_URL`: اتصال PostgreSQL.
- `NEXTAUTH_SECRET` و`NEXTAUTH_URL`: جلسات المصادقة ورابط التطبيق.
- `INTEGRATION_ENCRYPTION_KEY`: مفتاح AES-256 من 32 بايت بصيغة Base64. أنشئه بالأمر:

  ```bash
  openssl rand -base64 32
  ```

  احتفظ بنسخة احتياطية آمنة. فقدان المفتاح يجعل الأسرار المشفرة غير قابلة للقراءة، وتغييره دون ترحيل خاص يعطل قراءتها.

- `CRON_SECRET`: يحمي مسارات المعالجة المجدولة.
- عند استخدام Meta: `WHATSAPP_TOKEN` و`WHATSAPP_PHONE_NUMBER_ID` و`WHATSAPP_VERIFY_TOKEN` و`META_APP_SECRET`.

يمكن حفظ أسرار التكامل من لوحة الإعدادات لكل مساحة عمل. تُشفّر القيم الجديدة بـ AES-256-GCM ويرتبط كل سر بمساحة العمل ومفتاح التكامل المقصودين. لا تُرجع واجهة الإعدادات الأسرار الصريحة بعد حفظها.

## ترحيل الأسرار القديمة

القيم النصية القديمة تبقى قابلة للقراءة مؤقتاً. بعد ضبط `INTEGRATION_ENCRYPTION_KEY` وأخذ نسخة احتياطية من قاعدة البيانات، شغّل:

```bash
npx prisma migrate deploy
npm run db:encrypt-secrets
```

الأمر قابل لإعادة التشغيل بأمان؛ يتخطى القيم المشفرة مسبقاً ويشفّر أسرار مساحات العمل وأسرار المنصة القديمة.

## Meta Webhook وGraph API

مسار Webhook هو:

```text
/api/webhooks/whatsapp
```

التحقق من `X-Hub-Signature-256` إلزامي ويُرفض الطلب إذا لم يكن `META_APP_SECRET` مضبوطاً أو كان التوقيع غير صالح. يُخزّن الحدث في PostgreSQL قبل إعادة رد النجاح إلى Meta، ثم تعالجه مهمة مجدولة.

إصدار Graph API موحد للإرسال والوسائط والتفريغ الصوتي عبر:

```env
META_GRAPH_VERSION="v21.0"
```

تُحفظ معرفات الرسائل الصادرة وحالاتها: `PENDING` و`ACCEPTED` و`SENT` و`DELIVERED` و`READ` و`FAILED`. أحداث الحالة الأقدم لا تستطيع إرجاع رسالة إلى حالة سابقة.

## عامل Webhook وCron

أحداث الرسائل والحالات تدخل جدول `WebhookEvent`. القيد الفريد `(provider, externalId)` يمنع التكرار، ويستخدم الاستلام `FOR UPDATE SKIP LOCKED` لمنع عاملين من معالجة الحدث نفسه. تُعاد المحاولة تلقائياً حتى خمس محاولات، وتُسترد الأحداث العالقة في `PROCESSING`.

في Vercel يوجد في `vercel.json` جدول كل دقيقة للمسار:

```text
/api/cron/webhooks
```

يجب ضبط `CRON_SECRET` في بيئة النشر. عند التشغيل خارج Vercel، نفّذ طلباً مجدولاً مماثلاً مع الترويسة:

```text
Authorization: Bearer <CRON_SECRET>
```

## الاختبارات والتحقق

```bash
npm test
npx tsc --noEmit
npm run build
```

تشمل الاختبارات التشفير وسياق المساحة، توقيع Meta، منع تكرار الرسائل، عزل الوكلاء والحظر، الطابور الدائم، وترتيب حالات التسليم.
