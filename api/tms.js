// /api/tms.js
// Serverless proxy for ALL TMS interactions for Bill-To POD Compare

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { action, payload } = req.body || {};

  try {
    switch (action) {
      case "login":
        return res.json(await tmsLogin());
      case "trace":
        return res.json(await tmsTrace(payload));
      default:
        return res.status(400).json({ error: "Unknown TMS action" });
    }
  } catch (err) {
    console.error("TMS API ERROR:", err);
    return res.status(500).json({ error: "Internal TMS error" });
  }
}

/* ------------------------------------------
   CONSTANTS IDENTICAL TO UI BEHAVIOR
------------------------------------------- */
const TMS_BASE = "https://tms.freightapp.com";
const LOGIN_URL = `${TMS_BASE}/write/check_login.php`;
const GROUP_URL = `${TMS_BASE}/write_new/write_change_user_group.php`;
const TRACE_URL = `${TMS_BASE}/write_new/get_tms_trace.php`;

const TMS_USER = process.env.TMS_USER || "cmosqueda";
const TMS_PASS = process.env.TMS_PASS || "UWF2NjUyODk="; // Base64 password
const TMS_GROUP_ID = "28";

/* ------------------------------------------
   LOGIN — identical to browser HAR
------------------------------------------- */
async function tmsLogin() {
  const form = new URLSearchParams();
  form.set("username", TMS_USER);
  form.set("password", TMS_PASS);
  form.set("UserID", "null");
  form.set("UserToken", "null");
  form.set("pageName", "/index.html");

  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": "https://tms.freightapp.com",
      "Referer": "https://tms.freightapp.com/index.html"
    },
    body: form
  });

  if (!resp.ok) throw new Error("TMS login failed");

  const json = await resp.json();
  const userId = json?.UserID;
  const token = json?.UserToken;

  if (!userId || !token) throw new Error("TMS login missing fields");

  // MUST CHANGE GROUP after login
  await tmsChangeGroup(userId, token);

  return { UserID: userId, UserToken: token };
}

/* ------------------------------------------
   CHANGE GROUP (required EVERY time)
------------------------------------------- */
async function tmsChangeGroup(userId, token) {
  const form = new URLSearchParams();
  form.set("group_id", TMS_GROUP_ID);
  form.set("UserID", userId);
  form.set("UserToken", token);
  form.set("pageName", "dashboard");

  await fetch(GROUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    },
    body: form
  });
}

/* ------------------------------------------
   MAIN TRACE CALL (Bill-To OR PRO)
------------------------------------------- */
async function tmsTrace(formPayload) {
  const form = new URLSearchParams();

  // Copy ALL provided fields into form (full fidelity)
  for (const key in formPayload) {
    form.set(key, String(formPayload[key] ?? ""));
  }

  form.set("UserID", formPayload.UserID);
  form.set("UserToken", formPayload.UserToken);

  const resp = await fetch(TRACE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": "https://tms.freightapp.com",
      "Referer": "https://tms.freightapp.com/dev.html"
    },
    body: form
  });

  if (!resp.ok) throw new Error("TMS trace HTTP " + resp.status);

  const json = await resp.json();

  return {
    data:
      json?.rows ||
      json?.result ||
      json?.data ||
      (Array.isArray(json) ? json : [])
  };
}
