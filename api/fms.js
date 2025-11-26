// /api/fms.js
// FMS-only API: login via env vars, Bill-To search, order search, POD files.

const FMS_BASE = "https://fms.item.com";

const LOGIN_URL =
  `${FMS_BASE}/fms-platform-user/Auth/Login`;

const SEARCH_BILLTO_URL =
  `${FMS_BASE}/fms-platform-order/shipment-orders/search-business-client?Code=`;

const SEARCH_ORDERS_URL =
  `${FMS_BASE}/fms-platform-order/shipment-orders/query`;

const FILES_URL =
  `${FMS_BASE}/fms-platform-order/shipper/order-file/`;

const FMS_CLIENT = "FMS_WEB";
const COMPANY_ID = "SBFH";

// simple in-memory token cache (per lambda instance)
let FMS_TOKEN = null;
let FMS_TOKEN_TS = 0; // ms timestamp

const TOKEN_TTL_MS = 55 * 60 * 1000; // 55 minutes safety window

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, payload } = req.body || {};

  try {
    switch (action) {

      case "login": {
        const token = await fmsLogin(true);
        return res.json({ token });
      }

      case "searchBillTo": {
        const { code } = payload || {};
        if (!code || !String(code).trim()) {
          return res.status(400).json({ error: "Missing Bill-To code" });
        }
        const data = await searchBillTo(String(code).trim());
        return res.json(data);
      }

      case "searchOrdersByBillTo": {
        const { billToCode, page_number, page_size } = payload || {};
        if (!billToCode || !String(billToCode).trim()) {
          return res.status(400).json({ error: "Missing billToCode" });
        }
        const data = await searchOrdersByBillTo(
          String(billToCode).trim(),
          page_number || 1,
          page_size || 10000
        );
        return res.json(data);
      }

      case "searchOrdersRaw": {
        const { body } = payload || {};
        if (!body || typeof body !== "object") {
          return res.status(400).json({ error: "Missing body for searchOrdersRaw" });
        }
        const data = await searchOrders(body);
        return res.json(data);
      }

      case "files": {
        const { orderNo } = payload || {};
        if (!orderNo || !String(orderNo).trim()) {
          return res.status(400).json({ error: "Missing orderNo" });
        }
        const data = await getFiles(String(orderNo).trim());
        return res.json(data);
      }

      case "searchOrdersForPODCheck": {
        const { pro } = payload || {};
        if (!pro || !String(pro).trim()) {
          return res.status(400).json({ error: "Missing pro" });
        }
        const data = await searchOrdersByProForPODCheck(String(pro).trim());
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

/* ===========================================
   LOGIN + TOKEN HANDLING
=========================================== */

async function fmsLogin(force = false) {
  const now = Date.now();

  if (!force && FMS_TOKEN && now - FMS_TOKEN_TS < TOKEN_TTL_MS) {
    return FMS_TOKEN;
  }

  const account = process.env.FMS_USER;
  const password = process.env.FMS_PASS;

  if (!account || !password) {
    throw new Error("Missing FMS_USER / FMS_PASS environment variables");
  }

  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "fms-client": FMS_CLIENT,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ account, password })
  });

  if (!resp.ok) {
    throw new Error(`Login failed with HTTP ${resp.status}`);
  }

  const json = await resp.json().catch(() => ({}));

  const token =
    json?.data?.token ||
    json?.token ||
    null;

  if (!token) {
    throw new Error("No FMS token returned from Auth/Login");
  }

  FMS_TOKEN = token;
  FMS_TOKEN_TS = now;

  return FMS_TOKEN;
}

/**
 * Build common headers for authenticated FMS calls.
 */
async function authHeaders() {
  const token = await fmsLogin(false);

  return {
    "accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "authorization": token,
    "fms-token": token,
    "company-id": COMPANY_ID,
    "fms-client": FMS_CLIENT
  };
}

/* ===========================================
   BILL-TO SEARCH (GET)
   EXACT MATCH TO WEBSITE LOGIC
=========================================== */

async function searchBillTo(code) {
  const token = await fmsLogin(false);

  // EXACT HEADER SET FROM HAR (NO Content-Type)
  const headers = {
    "accept": "application/json, text/plain, */*",
    "authorization": token,
    "company-id": COMPANY_ID,
    "fms-client": FMS_CLIENT,
    "fms-token": token
  };

  // CASE-SENSITIVE: must use "Code="
  const url = SEARCH_BILLTO_URL + encodeURIComponent(code);

  const resp = await fetch(url, {
    method: "GET",
    headers
  });

  if (!resp.ok) {
    throw new Error(`Bill-To search failed HTTP ${resp.status}`);
  }

  return resp.json();
}

/* ===========================================
   ORDER SEARCH (POST)
=========================================== */

async function searchOrders(body) {
  const headers = await authHeaders();

  const resp = await fetch(SEARCH_ORDERS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    throw new Error(`Order search failed HTTP ${resp.status}`);
  }

  return resp.json();
}

/* ===========================================
   POD CHECK: tracking_nos ONLY
=========================================== */

async function searchOrdersByProForPODCheck(pro) {
  const payload = {
    tracking_nos: [pro],
    order_nos: [],
    bols: [],
    customer_references: [],
    bill_to_accounts: [],
    page_number: 1,
    page_size: 200
  };

  return searchOrders(payload);
}

/* ===========================================
   Search all orders by Bill-To (HAR pattern)
=========================================== */

async function searchOrdersByBillTo(billToCode, page_number = 1, page_size = 10000) {
  const payload = {
    order_nos: [],
    tracking_nos: [],
    customer_references: [],
    bols: [],
    bill_to_accounts: [billToCode],
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
    page_number,
    page_size
  };

  return searchOrders(payload);
}

/* ===========================================
   POD FILE LOOKUP (GET)
=========================================== */

async function getFiles(orderNo) {
  const token = await fmsLogin(false);

  const headers = {
    "accept": "application/json, text/plain, */*",
    "authorization": token,
    "fms-token": token,
    "company-id": COMPANY_ID,
    "fms-client": FMS_CLIENT
  };

  const url = FILES_URL + encodeURIComponent(orderNo);

  const resp = await fetch(url, {
    method: "GET",
    headers
  });

  if (!resp.ok) {
    throw new Error(`File lookup failed HTTP ${resp.status}`);
  }

  return resp.json();
}
