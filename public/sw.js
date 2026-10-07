// عامل خدمة PWA: إشعارات Push فقط — لا تخزين مسبق للموارد
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // حمولة غير JSON — نظهر إشعاراً افتراضياً
  }
  const title = data.title || "فلووو";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      data: { url: data.url || "/inbox" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    (async () => {
      // ركّز نافذة مفتوحة للتطبيق إن وُجدت، وإلا افتح واحدة جديدة
      const list = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })()
  );
});
