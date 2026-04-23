// POST /api/submit → handle volunteer form submission

export async function onRequestPost(context) {
  const { env, request } = context;
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  try {
    const body = await request.json();
    const { campaignId, name, email, lang, groupName, agree1, agree2, title, doc1Name, doc2Name, uploadCount, uploadFileNames } = body;

    if (!campaignId || !name || !email) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: cors });
    }

    // Duplicate check
    const dedupKey = "response:" + campaignId + ":" + email.toLowerCase().trim();
    const existing = await env.CONSENT_KV.get(dedupKey);
    if (existing) {
      return new Response(JSON.stringify({ error: "duplicate" }), { status: 409, headers: cors });
    }

    // Store response
    const timestamp = new Date().toISOString();
    const record = {
      campaignId,
      groupName: groupName || "",
      name: name.trim(),
      email: email.trim().toLowerCase(),
      lang: lang || "tw",
      agree1: agree1 || false,
      agree2: agree2 || "n/a",
      uploadCount: uploadCount || 0,
      uploadFileNames: uploadFileNames || [],
      timestamp,
    };

    await env.CONSENT_KV.put(dedupKey, JSON.stringify(record));

    // Append to response list
    const listKey = "responses:" + campaignId;
    const listData = await env.CONSENT_KV.get(listKey);
    const list = listData ? JSON.parse(listData) : [];
    list.push(dedupKey);
    await env.CONSENT_KV.put(listKey, JSON.stringify(list));

    // Send confirmation email via Resend
    const resendKey = env.RESEND_API_KEY;
    if (resendKey) {
      const isCn = lang === "cn";
      const siteUrl = new URL(request.url).origin;

      const emailHtml = buildEmailHtml({
        name, email, groupName, title, doc1Name, doc2Name,
        agree1, agree2, uploadCount, uploadFileNames, timestamp, siteUrl, isCn
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + resendKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "舞象基金會統籌組 <onboarding@resend.dev>",
          reply_to: "DoNotReply.dancingwiththelephant@gmail.com",
          to: [email.trim()],
          subject: "舞象基金會 — " + (isCn ? "同意书确认通知" : "同意書確認通知"),
          html: emailHtml
        })
      });

      // Notify admin
      const adminEmail = env.ADMIN_EMAIL || "zenjoy99@gmail.com";
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + resendKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "舞象基金會系統 <onboarding@resend.dev>",
          to: [adminEmail],
          subject: "[新提交] " + name + " — " + (title || groupName),
          html: buildAdminNotifyHtml({ name, email, groupName, title, lang, uploadCount, timestamp, siteUrl })
        })
      });
    }

    return new Response(JSON.stringify({ ok: true, record }), { headers: cors });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  });
}

function buildEmailHtml({ name, email, groupName, title, doc1Name, doc2Name, agree1, agree2, uploadCount, timestamp, siteUrl, isCn }) {
  const ts = new Date(timestamp).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  const confirmTitle = isCn ? "同意书确认通知" : "同意書確認通知";
  const greeting = name + " 您好，";
  const thankMsg = isCn
    ? "感谢您完成舞象基金会「" + title + "」之电子确认。以下为您的提交记录："
    : "感謝您完成舞象基金會「" + title + "」之電子確認。以下為您的提交紀錄：";
  const labels = isCn
    ? { grp: "志工类别", time: "提交时间", mail: "电子邮件", agreed: "已同意", d1: "同意文件一", d2: "同意文件二", up: "已上传签署文件", unit: "份", note: "此为系统自动发送，请勿直接回复此信。如有疑问请联系统筹组。" }
    : { grp: "志工類別", time: "提交時間", mail: "電子郵件", agreed: "已同意", d1: "同意文件一", d2: "同意文件二", up: "已上傳簽署文件", unit: "份", note: "此為系統自動發送，請勿直接回覆此信。如有疑問請聯繫統籌組。" };

  var records = "<tr><td style='color:#5A4A30;padding:6px 0'>" + labels.grp + "</td><td style='padding:6px 0'>" + groupName + "</td></tr>" +
    "<tr><td style='color:#5A4A30;padding:6px 0'>" + labels.time + "</td><td style='padding:6px 0'>" + ts + "</td></tr>" +
    "<tr><td style='color:#5A4A30;padding:6px 0'>" + labels.mail + "</td><td style='padding:6px 0'>" + email + "</td></tr>" +
    "<tr><td style='color:#5A4A30;padding:6px 0'>" + labels.d1 + "（" + doc1Name + "）</td><td style='padding:6px 0'>✅ " + labels.agreed + "</td></tr>";
  if (doc2Name) {
    records += "<tr><td style='color:#5A4A30;padding:6px 0'>" + labels.d2 + "（" + doc2Name + "）</td><td style='padding:6px 0'>✅ " + labels.agreed + "</td></tr>";
  }
  records += "<tr><td style='color:#5A4A30;padding:6px 0'>" + labels.up + "</td><td style='padding:6px 0'>✅ " + uploadCount + " " + labels.unit + "</td></tr>";

  return "<!DOCTYPE html><html><body style='margin:0;padding:0;background:#F5E6D0;font-family:sans-serif'>" +
    "<table width='100%' cellpadding='0' cellspacing='0' style='background:#F5E6D0;padding:20px 0'><tr><td align='center'>" +
    "<table width='600' cellpadding='0' cellspacing='0' style='background:#FBF7F0;border-radius:10px;overflow:hidden'>" +
    "<tr><td style='background:#F5E6D0;padding:16px 24px'>" +
    "<table><tr><td style='padding-right:14px'><img src='" + siteUrl + "/elephant.png' width='48' height='48' style='border-radius:50%' alt='Logo'></td>" +
    "<td><div style='font-size:20px;font-weight:500;color:#2B2B2B;letter-spacing:2px'>舞象基金會</div><div style='font-size:12px;color:#7A6A50;margin-top:2px'>Dancing With The Elephant</div></td></tr></table></td></tr>" +
    "<tr><td style='background:#D4A657;height:3px;font-size:0'>&nbsp;</td></tr>" +
    "<tr><td style='padding:28px'>" +
    "<div style='font-size:18px;font-weight:500;color:#C8512A;margin-bottom:16px'>" + confirmTitle + "</div>" +
    "<p style='font-size:14px;line-height:1.8;margin:0 0 12px'><strong>" + greeting + "</strong></p>" +
    "<p style='font-size:14px;line-height:1.8;margin:0 0 16px'>" + thankMsg + "</p>" +
    "<table style='width:100%;background:#FDF9F1;border:1px solid #F0E2C4;border-radius:8px;padding:14px;font-size:13px;line-height:1.8;border-collapse:separate;border-spacing:8px'>" + records + "</table>" +
    "<p style='font-size:12px;color:#8A7A60;margin:18px 0 0;line-height:1.6'>" + labels.note + "</p>" +
    "</td></tr>" +
    "<tr><td style='background:#5A4A30;padding:10px 0;text-align:center'><span style='font-size:10px;color:rgba(255,255,255,.7)'>dancingwiththelephant@gmail.com</span></td></tr>" +
    "</table></td></tr></table></body></html>";
}

function buildAdminNotifyHtml({ name, email, groupName, title, lang, uploadCount, timestamp, siteUrl }) {
  const ts = new Date(timestamp).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  return "<!DOCTYPE html><html><body style='margin:0;padding:20px;font-family:sans-serif;color:#2B2B2B'>" +
    "<div style='max-width:500px;margin:0 auto;background:#FBF7F0;border-radius:8px;overflow:hidden;border:1px solid #E8D4B0'>" +
    "<div style='background:#F5E6D0;padding:12px 18px;font-size:15px;font-weight:500'>📋 新同意書提交通知</div>" +
    "<div style='height:3px;background:#D4A657'></div>" +
    "<div style='padding:18px'><table style='font-size:14px;line-height:2'>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>同意書</td><td><strong>" + title + "</strong></td></tr>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>志工類別</td><td>" + groupName + "</td></tr>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>姓名</td><td><strong>" + name + "</strong></td></tr>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>信箱</td><td>" + email + "</td></tr>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>語言</td><td>" + (lang === "cn" ? "zh-CN (简体)" : "zh-TW (繁體)") + "</td></tr>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>上傳檔案</td><td>" + uploadCount + " 份</td></tr>" +
    "<tr><td style='color:#5A4A30;padding-right:16px'>時間</td><td>" + ts + "</td></tr>" +
    "</table></div></div></body></html>";
}
