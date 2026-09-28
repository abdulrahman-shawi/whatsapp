/*!
 * ويدجت المحادثة — سكربت مستقل يعمل على أي موقع دون أي مكتبات
 * الاستخدام: <script src="https://<domain>/widget.js" data-agent-id="<id>" async></script>
 */
(function () {
  "use strict";

  // قراءة معرّف الوكيل من وسم السكربت نفسه، واشتقاق عنوان API من رابطه
  var scriptTag =
    document.currentScript || document.querySelector("script[data-agent-id]");
  if (!scriptTag) return;
  var AGENT_ID = scriptTag.getAttribute("data-agent-id");
  var API_BASE = new URL(scriptTag.src).origin;
  if (!AGENT_ID) return;

  // معرّف الزائر: يُولَّد مرة ويُحفظ في localStorage
  var VISITOR_KEY = "wa_widget_visitor";
  var visitorId = null;
  try {
    visitorId = localStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId =
        (crypto.randomUUID && crypto.randomUUID()) ||
        "v" + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(VISITOR_KEY, visitorId);
    }
  } catch (e) {
    visitorId = "v" + Math.random().toString(36).slice(2) + Date.now();
  }

  // أنماط الويدجت — تُحقن مباشرة دون أي CSS خارجي
  var css =
    "#wa-widget-bubble{position:fixed;bottom:20px;left:20px;width:56px;height:56px;border-radius:50%;background:hsl(262,83%,58%);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:99999;transition:transform .15s}" +
    "#wa-widget-bubble:hover{transform:scale(1.08)}" +
    "#wa-widget-window{position:fixed;bottom:88px;left:20px;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 110px);background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;direction:rtl;z-index:99999;font-family:'Segoe UI',Tahoma,Arial,sans-serif}" +
    "#wa-widget-window.open{display:flex}" +
    ".wa-widget-header{background:hsl(262,83%,58%);color:#fff;padding:14px 16px;font-size:15px;font-weight:700}" +
    ".wa-widget-msgs{flex:1;overflow-y:auto;padding:12px;background:#f7f7f8;display:flex;flex-direction:column;gap:8px}" +
    ".wa-msg{max-width:78%;padding:8px 12px;border-radius:10px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word}" +
    ".wa-msg-visitor{align-self:flex-end;background:#d9fdd3}" +
    ".wa-msg-agent{align-self:flex-start;background:#fff;border:1px solid #e8e8ec}" +
    ".wa-msg-system{align-self:center;background:transparent;color:#8a8a93;font-size:11.5px;text-align:center}" +
    ".wa-widget-input{display:flex;gap:8px;padding:10px;border-top:1px solid #eee}" +
    ".wa-widget-input input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13.5px;font-family:inherit;outline:none}" +
    ".wa-widget-input input:focus{border-color:hsl(262,83%,58%)}" +
    ".wa-widget-input button{background:hsl(262,83%,58%);color:#fff;border:none;border-radius:8px;padding:0 14px;cursor:pointer;font-size:15px}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // زر الفقاعة العائم (أسفل اليسار ليناسب المواقع بأي اتجاه)
  var bubble = document.createElement("button");
  bubble.id = "wa-widget-bubble";
  bubble.setAttribute("aria-label", "تحدث معنا");
  bubble.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

  // نافذة المحادثة
  var win = document.createElement("div");
  win.id = "wa-widget-window";
  win.innerHTML =
    '<div class="wa-widget-header">تحدث معنا</div>' +
    '<div class="wa-widget-msgs"></div>' +
    '<div class="wa-widget-input"><input type="text" placeholder="اكتب رسالتك…"/><button type="button">➤</button></div>';

  document.body.appendChild(bubble);
  document.body.appendChild(win);

  var msgsEl = win.querySelector(".wa-widget-msgs");
  var inputEl = win.querySelector("input");
  var sendBtn = win.querySelector(".wa-widget-input button");

  var conversationId = null; // يُستلم من أول رد
  var handedOffShown = false; // رسالة التحويل تظهر مرة واحدة
  var lastTs = null; // آخر توقيت رد مستلم — للاستطلاع التزايدي
  var seenIds = {}; // منع تكرار الرسائل
  var pollTimer = null;

  function addMsg(text, kind) {
    var el = document.createElement("div");
    el.className = "wa-msg wa-msg-" + kind;
    el.textContent = text;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function handleStatus(status) {
    if (status === "HANDED_OFF" && !handedOffShown) {
      handedOffShown = true;
      addMsg("تم تحويلك إلى فريق الدعم، سيرد عليك موظف قريباً", "system");
    }
  }

  // إرسال رسالة الزائر واستقبال رد الوكيل
  function send() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    addMsg(text, "visitor");

    fetch(API_BASE + "/api/widget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: AGENT_ID,
        visitorId: visitorId,
        text: text,
        conversationId: conversationId || undefined,
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.conversationId) conversationId = data.conversationId;
        if (data.reply) {
          addMsg(data.reply, "agent");
          // تسجيل الرد حتى لا يتكرر عند الاستطلاع
          if (data.replyMessage) {
            seenIds[data.replyMessage.id] = true;
            lastTs = data.replyMessage.createdAt;
          }
        }
        handleStatus(data.status);
      })
      .catch(function () {
        addMsg("تعذّر الإرسال — تحقق من اتصالك وحاول مجدداً", "system");
      });
  }

  // استطلاع ردود جديدة كل ٤ ثوانٍ طالما النافذة مفتوحة
  // (يلتقط أيضاً ردود الموظفين البشرية من صندوق الوارد)
  function poll() {
    if (!conversationId) return;
    var url =
      API_BASE +
      "/api/widget?conversationId=" +
      encodeURIComponent(conversationId) +
      (lastTs ? "&since=" + encodeURIComponent(lastTs) : "");
    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        (data.messages || []).forEach(function (m) {
          if (seenIds[m.id]) return;
          seenIds[m.id] = true;
          lastTs = m.createdAt;
          addMsg(m.body, "agent");
        });
        handleStatus(data.status);
      })
      .catch(function () {
        /* تجاهل أخطاء الشبكة في الاستطلاع */
      });
  }

  bubble.addEventListener("click", function () {
    var opening = !win.classList.contains("open");
    win.classList.toggle("open");
    // تشغيل/إيقاف الاستطلاع مع فتح النافذة وإغلاقها
    if (opening && !pollTimer) {
      poll();
      pollTimer = setInterval(poll, 4000);
    } else if (!opening && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send();
  });
})();
