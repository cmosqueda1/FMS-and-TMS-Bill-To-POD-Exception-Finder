// /api/tms.js
// TMS-only API: login, group change, Bill-To trace search

const TMS_BASE = "https://tms.freightapp.com";

const LOGIN_URL = `${TMS_BASE}/write/check_login.php`;
const GROUP_URL = `${TMS_BASE}/write_new/write_change_user_group.php`;
const TRACE_URL = `${TMS_BASE}/write_new/get_tms_trace.php`;

// Simple in-memory session cache (per lambda instance)
let TMS_SESSION = {
  cookie: null,
  userId: null,
  userToken: null,
  groupId: null,
  ts: 0,
};

const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, payload } = req.body || {};

  try {
    switch (action) {
      case "login": {
        const session = await tmsLoginAndGroup(true);
        return res.json({
          userId: session.userId,
          userToken: session.userToken,
          groupId: session.groupId,
        });
      }

      case "traceByBillTo": {
        const { billToName, page_num, page_size } = payload || {};
        if (!billToName || !String(billToName).trim()) {
          return res.status(400).json({ error: "Missing billToName" });
        }
        const data = await traceByBillToName(
          String(billToName).trim(),
          page_num || 1,
          page_size || 10000
        );
        return res.json(data);
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("🔥 TMS ERROR:", err);
    return res.status(500).json({ error: err.message || "TMS internal error" });
  }
}

/* ===========================================
   LOGIN + GROUP CHANGE + SESSION
=========================================== */

async function tmsLoginAndGroup(force = false) {
  const now = Date.now();

  if (
    !force &&
    TMS_SESSION.cookie &&
    TMS_SESSION.userId &&
    TMS_SESSION.userToken &&
    now - TMS_SESSION.ts < TOKEN_TTL_MS
  ) {
    return TMS_SESSION;
  }

  const username = process.env.TMS_USER;
  const password = process.env.TMS_PASS;
  const groupId = process.env.TMS_GROUP_ID || "28"; // from HAR, override via env if needed

  if (!username || !password) {
    throw new Error("Missing TMS_USER / TMS_PASS environment variables");
  }

  // --- LOGIN ---
  const loginBody = new URLSearchParams({
    username,
    password,
    UserID: "null",
    UserToken: "null",
    pageName: "/dev.html",
  });

  const loginResp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: TMS_BASE,
      Referer: `${TMS_BASE}/dev.html`,
    },
    body: loginBody.toString(),
  });

  if (!loginResp.ok) {
    throw new Error(`TMS login failed HTTP ${loginResp.status}`);
  }

  // Capture PHPSESSID, etc.
  const setCookie = loginResp.headers.get("set-cookie") || "";
  const loginJson = await loginResp.json().catch(() => ({}));

  const userId =
    loginJson.UserID ||
    loginJson.userId ||
    loginJson.data?.UserID ||
    loginJson.data?.user_id ||
    null;

  const userToken =
    loginJson.UserToken ||
    loginJson.userToken ||
    loginJson.data?.UserToken ||
    loginJson.data?.user_token ||
    null;

  if (!userId || !userToken) {
    throw new Error("No UserID / UserToken returned from TMS login");
  }

  // --- GROUP CHANGE ---
  const groupBody = new URLSearchParams({
    group_id: String(groupId),
    UserID: String(userId),
    UserToken: String(userToken),
    pageName: "dashboard",
  });

  const groupResp = await fetch(GROUP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: TMS_BASE,
      Referer: `${TMS_BASE}/dev.html`,
      Cookie: setCookie,
    },
    body: groupBody.toString(),
  });

  if (!groupResp.ok) {
    throw new Error(`TMS group change failed HTTP ${groupResp.status}`);
  }

  // We keep using the same cookie + tokens for trace calls
  TMS_SESSION = {
    cookie: setCookie,
    userId,
    userToken,
    groupId,
    ts: now,
  };

  return TMS_SESSION;
}

/* ===========================================
   TRACE BY BILL-TO NAME
   POST /write_new/get_tms_trace.php
=========================================== */

async function traceByBillToName(billToName, pageNum = 1, pageSize = 10000) {
  const session = await tmsLoginAndGroup(false);

  const payload = new URLSearchParams({
    input_filter_tracking_num: "",
    input_billing_reference: "",
    input_filter_pro: "",
    input_filter_trip: "",
    input_filter_order: "",
    input_filter_pu: "",
    input_filter_pickup_from: "",
    input_filter_pickup_to: "",
    input_filter_delivery_from: "",
    input_filter_delivery_to: "",
    input_filter_shipper: "",
    input_filter_shipper_code: "",
    input_filter_shipper_street: "",
    input_filter_shipper_city: "",
    input_filter_shipper_state: "0",
    input_filter_shipper_phone: "",
    input_filter_shipper_zip: "",
    input_filter_consignee: "",
    input_filter_consignee_code: "",
    input_filter_consignee_street: "",
    input_filter_consignee_city: "",
    input_filter_consignee_state: "0",
    input_filter_consignee_phone: "",
    input_filter_consignee_zip: "",
    input_filter_billto: billToName,              // <-- key linkage
    input_filter_billto_code: "",
    input_filter_billto_street: "",
    input_filter_billto_city: "",
    input_filter_billto_state: "0",
    input_filter_billto_phone: "",
    input_filter_billto_zip: "",
    input_filter_manifest: "",
    input_filter_interline: "",
    input_filter_pieces: "",
    input_filter_trailer: "",
    input_filter_weight: "",
    input_filter_pallet: "",
    input_filter_ref: "",
    input_filter_load: "",
    input_filter_po: "",
    input_filter_pickup_apt: "",
    input_filter_pickup_actual_from: "",
    input_filter_pickup_actual_to: "",
    input_filter_delivery_apt: "",
    input_filter_delivery_actual_from: "",
    input_filter_delivery_actual_to: "",
    input_filter_cust_po: "",
    input_filter_cust_ref: "",
    input_filter_cust_pro: "",
    input_filter_cust_bol: "",
    input_filter_cust_dn: "",
    input_filter_cust_so: "",
    input_filter_tender_pro: "",
    input_carrier_name: "",
    input_carrier_pro: "",
    input_carrier_inv: "",
    input_hold: "0",
    input_filter_group: "0",
    input_wa1: "0",
    input_wa2: "0",
    input_has_pro: "0",
    input_filter_scac: "",
    input_exclude_delivered: "1",               // <-- exclude delivered, like HAR
    input_filter_created_by: "",
    input_include_cancel: "0",
    input_carrier_type: "1",
    input_approved: "-1",
    input_fk_revenue_id: "0",
    input_stage_id: "",
    input_status_id: "",
    input_filter_create_date_from: "",
    input_filter_create_date_to: "",
    input_filter_tracking_no: "",
    input_filter_contriner: "",
    input_filter_cust_rn: "",
    input_page_num: String(pageNum),
    input_page_size: String(pageSize),
    input_total_rows: "0",
    UserID: String(session.userId),
    UserToken: String(session.userToken),
    pageName: "dashboardTmsTrace",
  });

  const resp = await fetch(TRACE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: TMS_BASE,
      Referer: `${TMS_BASE}/dev.html`,
      Cookie: session.cookie || "",
    },
    body: payload.toString(),
  });

  if (!resp.ok) {
    throw new Error(`TMS trace failed HTTP ${resp.status}`);
  }

  return resp.json();
}
