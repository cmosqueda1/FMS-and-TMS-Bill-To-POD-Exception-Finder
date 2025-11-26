// /api/fms.js
// Full FMS integration with:
// - Dual-token authentication
// - Token caching + auto-refresh
// - Bill-To search
// - Raw order search
// - Order search by Bill-To
// - Multi-PRO lookup (lookupPros)
// - POD file lookup
// - Auto-retry on 401, 429, and transient failures

const FMS_BASE = "https://fms.item.com";

const LOGIN_URL = `${FMS_BASE}/fms-platform-user/Auth/Login`;

const SEARCH_BILLTO_URL =
  `${FMS_BASE}/fms-platform-order/shipment-orders/search-business-client?Code=`;

const SEARCH_ORDERS_URL =
  `${FMS_BASE}/fms-platform-order/shipment-orders/query`;

const FILES_URL =
  `${FMS_BASE}/fms-platform-order/files/`;  // /files/DOXXXXXXX

const FMS_CLIENT = "FMS_WEB";
const COMPANY_ID = "SBFH";

// Cached tokens
let FMS_TOKEN = null;       // SMALL JWT
let FMS_AUTH_TOKEN = null;  // BIG RSA JWT
let FMS_TOKEN_TS = 0;

const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { action, payload } = req.body || {};

  try {
    switch (action) {

      case "login":
        return res.json(await fmsLogin(true));

      case "searchBillTo": {
        const { code } = payload || {};
        if (!code) return res.status(400).json({ error: "Missing Bill-To code" });
        return res.json(await searchBillTo(code));
      }

      case "searchOrdersRaw": {
        const { body } = payload || {};
        if (!body) return res.status(400).json({ error: "Missing body" });
        return res.json(await searchOrders(body));
      }

      case "searchOrdersByBillTo": {
        const { billToCode } = payload || {};
        if (!billToCode) return res.status(400).json({ error: "Missing billToCode" });
        return res.json(await searchOrdersByBillTo(billToCode));
      }

      case "files": {
        const { orderNo } = payload || {};
        if (!orderNo) return res.status(400).json({ error: "Missing orderNo" });
        return res.json(await getFiles(orderNo));
      }

      case "lookupPros": {
        const { pros } = payload || {};
        if (!Array.isArray(pros) || pros.length === 0) {
          return res.json({ data: { items: [] } });
        }
        const data = await lookupPros(pros);
        return res.json(data);
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }

  } catch (err) {
    console.error("🔥 FMS ERROR:", err);
    return res.status(500).json({ error: err.message || "FMS internal error" });
  }
}

/* ============================================================
   LOGIN (SMALL + BIG TOKEN)
============================================================ */

async function fmsLogin(force = false) {
  const now = Date.now();

  // use cached tokens if not expired
  if (!force &&
      FMS_TOKEN &&
      FMS_AUTH_TOKEN &&
      now - FMS_TOKEN_TS < TOKEN_TTL_MS) {

    return { authToken: FMS_AUTH_TOKEN, fmsToken: FMS_TOKEN };
  }

  const account = process.env.FMS_USER;
  const password = process.env.FMS_PASS;

  if (!account || !password)
    throw new Error("Missing FMS_USER / FMS_PASS env variables");

  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "fms-client": FMS_CLIENT
    },
    body: JSON.stringify({ account, password })
  });

  if (!resp.ok)
    throw new Error(`Login failed HTTP ${resp.status}`);

  const json = await resp.json().catch(() => ({}));
  const data = json.data || {};

  const fmsToken = data.token || null;
  const authToken = data.third_party_token || data.thirdPartyToken || null;

  if (!fmsToken || !authToken)
    throw new Error("Login did not return both token and third_party_token");

  FMS_TOKEN = fmsToken;
  FMS_AUTH_TOKEN = authToken;
  FMS_TOKEN_TS = now;

  return { authToken, fmsToken };
}

/* ============================================================
   Authentication Headers (auto-refresh token)
============================================================ */

async function authHeaders() {
  const { authToken, fmsToken } = await fmsLogin(false);
  return {
    "accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "authorization": authToken,   // BIG JWT
    "fms-token": fmsToken,        // SMALL JWT
    "company-id": COMPANY_ID,
    "fms-client": FMS_CLIENT
  };
}

/* ============================================================
   MASTER FETCH with Auto-Retry
   Handles: token expiration (401), rate-limit (429), network drop
============================================================ */

async function fmsFetch(url, options, retry = 0) {
  const resp = await fetch(url, options);

  // retry on 401 (token expired)
  if (resp.status === 401 && retry < 2) {
    await fmsLogin(true);
    return fmsFetch(url, { ...options, headers: await authHeaders() }, retry + 1);
  }

  // retry on 429 (rate-limited)
  if (resp.status === 429 && retry < 4) {
    const wait = 250 + Math.random() * 350;
    await new Promise(r => setTimeout(r, wait));
    return fmsFetch(url, options, retry + 1);
  }

  // retry on network reset
  if (!resp.ok && retry < 2) {
    await new Promise(r => setTimeout(r, 150));
    return fmsFetch(url, options, retry + 1);
  }

  return resp;
}

/* ============================================================
   Bill-To Search (GET)
============================================================ */

async function searchBillTo(code) {
  const headers = await authHeaders();
  const url = SEARCH_BILLTO_URL + encodeURIComponent(code);

  const resp = await fmsFetch(url, { method: "GET", headers });

  if (!resp.ok)
    throw new Error(`Bill-To search failed HTTP ${resp.status}`);

  return resp.json();
}

/* ============================================================
   Order Query (POST)
============================================================ */

async function searchOrders(body) {
  const headers = await authHeaders();

  const resp = await fmsFetch(SEARCH_ORDERS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!resp.ok)
    throw new Error(`Order search failed HTTP ${resp.status}`);

  return resp.json();
}

/* ============================================================
   Order Search by Bill-To Shortcut
============================================================ */

async function searchOrdersByBillTo(billToCode) {
  const body = {
    order_nos: [],
    tracking_nos: [],
    customer_references: [],
    bols: [],
    bill_to_accounts: [billToCode],
    master_order_ids: [],
    status: ["10","53","19","20","22","54","26","30","40","42","51","52"], 
    sub_status: [],
    shipment_types: [],
    service_levels: [],
    trips: [],
    shipper_terminals: [],
    origin_states: [],
    origin_zip_codes: [],
    request_pickup_date: [],
    pickup_appointment: [],
    current_locations: [],
    service_terminals: [],
    lhs: [],
    lh_etd_date: [],
    lh_eta_date: [],
    consignee_terminals: [],
    consignee_state: [],
    consignee_zip_codes: [],
    desired_delivery_date: [],
    delivery_appointment: [],
    delivery_date: [],
    pickup_complete_date: [],
    pu_nos: [],
    po_nos: [],
    exception: false,
    delayed: false,
    hold: false,
    business_client: "",
    record_status: "0",
    page_number: 1,
    page_size: 10000
  };

  return searchOrders(body);
}

/* ============================================================
   Multi-PRO Lookup (tracking_nos)
============================================================ */

async function lookupPros(prosRaw) {
  const pros = Array.from(
    new Set(
      (prosRaw || [])
        .map(p => String(p || "").trim())
        .filter(Boolean)
    )
  );

  if (!pros.length) {
    return { data: { items: [] } };
  }

  const body = {
    order_nos: [],
    tracking_nos: pros,
    customer_references: [],
    bols: [],
    bill_to_accounts: [],
    master_order_ids: [],
    status: [],
    sub_status: [],
    shipment_types: [],
    service_levels: [],
    trips: [],
    shipper_terminals: [],
    origin_states: [],
    origin_zip_codes: [],
    request_pickup_date: [],
    pickup_appointment: [],
    current_locations: [],
    service_terminals: [],
    lhs: [],
    lh_etd_date: [],
    lh_eta_date: [],
    consignee_terminals: [],
    consignee_state: [],
    consignee_zip_codes: [],
    desired_delivery_date: [],
    delivery_appointment: [],
    delivery_date: [],
    pickup_complete_date: [],
    pu_nos: [],
    po_nos: [],
    exception: false,
    delayed: false,
    hold: false,
    business_client: "",
    record_status: "0",
    page_number: 1,
    page_size: 10000
  };

  return searchOrders(body);
}

/* ============================================================
   POD Files Lookup (GET)
============================================================ */

async function getFiles(orderNo) {
  const headers = await authHeaders();
  const url = FILES_URL + encodeURIComponent(orderNo);

  const resp = await fmsFetch(url, { method: "GET", headers });

  if (!resp.ok)
    throw new Error(`File lookup failed HTTP ${resp.status}`);

  return resp.json();
}
