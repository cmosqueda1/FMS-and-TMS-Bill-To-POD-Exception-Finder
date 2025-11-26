// /api/tms.js
// TMS integration with:
// - Login to check_login.php (UserID + UserToken)
// - Cookie + token caching
// - traceByBillTo (get_tms_trace.php)
// - lookupPros (multi-PRO search via input_filter_pro, get_tms_trace.php)

const TMS_BASE = "https://tms.freightapp.com";

const LOGIN_URL = `${TMS_BASE}/write/check_login.php`;
const TRACE_URL = `${TMS_BASE}/write_new/get_tms_trace.php`;

let TMS_COOKIE = "";
let TMS_USER_ID = "";
let TMS_USER_TOKEN = "";
let TMS_TS = 0;

const TMS_TTL_MS = 25 * 60 * 1000; // 25 minutes

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, payload } = req.body || {};

  try {
    switch (action) {

      case "login": {
        const info = await tmsLogin(true);
        return res.json(info);
      }

      case "traceByBillTo": {
        const { billToName, page_num, page_size } = payload || {};
        if (!billToName) {
          return res.status(400).json({ error: "Missing billToName" });
        }
        const data = await traceByBillTo(
          billToName,
          page_num || 1,
          page_size || 10000
        );
        return res.json(data);
      }

      case "lookupPros": {
        const { pros } = payload || {};
        if (!Array.isArray(pros) || pros.length === 0) {
          return res.json({ rows: [] });
        }
        const data = await lookupPros(pros);
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

/* ============================================================
   LOGIN
============================================================ */

async function tmsLogin(force = false) {
  const now = Date.now();

  if (!force &&
      TMS_USER_ID &&
      TMS_USER_TOKEN &&
      TMS_COOKIE &&
      now - TMS_TS < TMS_TTL_MS) {
    return { UserID: TMS_USER_ID, UserToken: TMS_USER_TOKEN };
  }

  const username = process.env.TMS_USER;
  const password = process.env.TMS_PASS;

  if (!username || !password) {
    throw new Error("Missing TMS_USER / TMS_PASS env variables");
  }

  const bodyParams = new URLSearchParams();
  bodyParams.set("username", username);
  bodyParams.set("password", password);
  bodyParams.set("UserID", "null");
  bodyParams.set("UserToken", "null");
  bodyParams.set("pageName", "/index.html");

  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": TMS_BASE,
      "Referer": `${TMS_BASE}/index.html`,
    },
    body: bodyParams.toString()
  });

  if (!resp.ok) {
    throw new Error(`TMS login failed HTTP ${resp.status}`);
  }

  const setCookie = resp.headers.get("set-cookie") || "";
  if (setCookie) {
    // basic: store entire string, TMS just needs PHPSESSID etc.
    TMS_COOKIE = setCookie;
  }

  const json = await resp.json().catch(() => ({}));

  // Sometimes UserID/UserToken are top-level, sometimes in data.*
  const userId = json.UserID || json.user_id || json?.data?.UserID || json?.data?.user_id;
  const userToken = json.UserToken || json.user_token || json?.data?.UserToken || json?.data?.user_token;

  if (!userId || !userToken) {
    throw new Error("TMS login did not return UserID/UserToken");
  }

  TMS_USER_ID = String(userId);
  TMS_USER_TOKEN = String(userToken);
  TMS_TS = now;

  return { UserID: TMS_USER_ID, UserToken: TMS_USER_TOKEN };
}

/* ============================================================
   Shared headers and fetch helper
============================================================ */

async function tmsHeaders() {
  await tmsLogin(false);
  return {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": TMS_BASE,
    "Referer": `${TMS_BASE}/dev.html`,
    "Cookie": TMS_COOKIE || ""
  };
}

async function tmsFetch(url, bodyParams, retry = 0) {
  const headers = await tmsHeaders();

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: bodyParams.toString()
  });

  // Try basic retry on 401 or 440-ish custom
  if ((resp.status === 401 || resp.status === 440) && retry < 2) {
    await tmsLogin(true);
    return tmsFetch(url, bodyParams, retry + 1);
  }

  return resp;
}

/* ============================================================
   Base body builder for get_tms_trace.php
============================================================ */

function buildBaseTraceBody() {
  const p = new URLSearchParams();

  p.set("input_filter_tracking_num", "");
  p.set("input_billing_reference", "");
  p.set("input_filter_pro", "");           // may override
  p.set("input_filter_trip", "");
  p.set("input_filter_order", "");
  p.set("input_filter_pu", "");
  p.set("input_filter_pickup_from", "");
  p.set("input_filter_pickup_to", "");
  p.set("input_filter_delivery_from", "");
  p.set("input_filter_delivery_to", "");
  p.set("input_filter_shipper", "");
  p.set("input_filter_shipper_code", "");
  p.set("input_filter_shipper_street", "");
  p.set("input_filter_shipper_city", "");
  p.set("input_filter_shipper_state", "0");
  p.set("input_filter_shipper_phone", "");
  p.set("input_filter_shipper_zip", "");
  p.set("input_filter_consignee", "");
  p.set("input_filter_consignee_code", "");
  p.set("input_filter_consignee_street", "");
  p.set("input_filter_consignee_city", "");
  p.set("input_filter_consignee_state", "0");
  p.set("input_filter_consignee_phone", "");
  p.set("input_filter_consignee_zip", "");
  p.set("input_filter_billto", "");        // may override for bill-to
  p.set("input_filter_billto_code", "");
  p.set("input_filter_billto_street", "");
  p.set("input_filter_billto_city", "");
  p.set("input_filter_billto_state", "0");
  p.set("input_filter_billto_phone", "");
  p.set("input_filter_billto_zip", "");
  p.set("input_filter_manifest", "");
  p.set("input_filter_interline", "");
  p.set("input_filter_pieces", "");
  p.set("input_filter_trailer", "");
  p.set("input_filter_weight", "");
  p.set("input_filter_pallet", "");
  p.set("input_filter_ref", "");
  p.set("input_filter_load", "");
  p.set("input_filter_po", "");
  p.set("input_filter_pickup_apt", "");
  p.set("input_filter_pickup_actual_from", "");
  p.set("input_filter_pickup_actual_to", "");
  p.set("input_filter_delivery_apt", "");
  p.set("input_filter_delivery_actual_from", "");
  p.set("input_filter_delivery_actual_to", "");
  p.set("input_filter_cust_po", "");
  p.set("input_filter_cust_ref", "");
  p.set("input_filter_cust_pro", "");
  p.set("input_filter_cust_bol", "");
  p.set("input_filter_cust_dn", "");
  p.set("input_filter_cust_so", "");
  p.set("input_filter_tender_pro", "");
  p.set("input_carrier_name", "");
  p.set("input_carrier_pro", "");
  p.set("input_carrier_inv", "");
  p.set("input_hold", "0");
  p.set("input_filter_group", "0");
  p.set("input_wa1", "0");
  p.set("input_wa2", "0");
  p.set("input_has_pro", "0");
  p.set("input_filter_scac", "");
  p.set("input_exclude_delivered", "0");   // we filter stage in UI
  p.set("input_filter_created_by", "");
  p.set("input_include_cancel", "0");
  p.set("input_carrier_type", "1");
  p.set("input_approved", "-1");
  p.set("input_fk_revenue_id", "0");
  p.set("input_stage_id", "");
  p.set("input_status_id", "");
  p.set("input_filter_create_date_from", "");
  p.set("input_filter_create_date_to", "");
  p.set("input_filter_tracking_no", "");
  p.set("input_filter_contriner", "");
  p.set("input_filter_cust_rn", "");

  // pagination fields will be set per call
  // UserID, UserToken, pageName set per call

  return p;
}

/* ============================================================
   traceByBillTo
============================================================ */

async function traceByBillTo(billToName, pageNum, pageSize) {
  const { UserID, UserToken } = await tmsLogin(false);

  const p = buildBaseTraceBody();
  p.set("input_filter_billto", billToName);
  p.set("input_page_num", String(pageNum || 1));
  p.set("input_page_size", String(pageSize || 10000));
  p.set("input_total_rows", "0");
  p.set("UserID", String(UserID));
  p.set("UserToken", String(UserToken));
  p.set("pageName", "dashboardTmsTrace");

  const resp = await tmsFetch(TRACE_URL, p);

  if (!resp.ok) {
    throw new Error(`TMS traceByBillTo failed HTTP ${resp.status}`);
  }

  const json = await resp.json().catch(() => ({}));
  // Expecting rows[] or data.rows[]
  const rows = json.rows || json.data?.rows || [];
  return { rows };
}

/* ============================================================
   lookupPros (multi-PRO via input_filter_pro)
============================================================ */

async function lookupPros(prosRaw) {
  const { UserID, UserToken } = await tmsLogin(false);

  const pros = Array.from(
    new Set(
      (prosRaw || [])
        .map(p => String(p || "").trim())
        .filter(Boolean)
    )
  );

  if (!pros.length) {
    return { rows: [] };
  }

  // We can send all in one go as newline-separated string.
  const p = buildBaseTraceBody();
  p.set("input_filter_pro", pros.join("\n"));
  p.set("input_page_num", "1");
  p.set("input_page_size", "10000");
  p.set("input_total_rows", "0");
  p.set("UserID", String(UserID));
  p.set("UserToken", String(UserToken));
  p.set("pageName", "dashboardTmsTrace");

  const resp = await tmsFetch(TRACE_URL, p);

  if (!resp.ok) {
    throw new Error(`TMS lookupPros failed HTTP ${resp.status}`);
  }

  const json = await resp.json().catch(() => ({}));
  const rows = json.rows || json.data?.rows || [];
  return { rows };
}
