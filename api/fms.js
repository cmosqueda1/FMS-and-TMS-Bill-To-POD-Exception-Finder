// /api/fms.js
// Fully correct FMS-only API using environment variables
// Bill-To search + Order search + POD files

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, payload } = req.body || {};

  try {
    switch (action) {
      case "login":
        return res.json(await fmsLogin());
      case "searchBillTo":
        return res.json(await searchBillTo(payload));
      case "searchOrders":
        return res.json(await searchOrders(payload));
      case "files":
        return res.json(await getFiles(payload));
      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("🔥 FMS ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}

/* ===========================================
   CONSTANTS — Matches your working logic
=========================================== */

const FMS_BASE = "https://fms.item.com";

const LOGIN_URL =
  `${FMS_BASE}/fms-platform-user/Auth/Login`;

const SEARCH_BILLTO_URL =
  `${FMS_BASE}/fms-platform-order/shipment-orders/search-business-client?code=`;

const SEARCH_ORDERS_URL =
  `${FMS_BASE}/fms-platform-order/shipment-orders/query`;

const FILES_URL =
  `${FMS_BASE}/fms-platform-order/shipper/order-file/`;

const FMS_CLIENT = "FMS_WEB";
const COMPANY_ID = "SBFH";

/* ===========================================
   LOGIN — identical to last working version
=========================================== */
async function fmsLogin() {
  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "fms-client": FMS_CLIENT,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      account: process.env.FMS_USER,
      password: process.env.FMS_PASS
    })
  });

  if (!resp.ok) {
    throw new Error(`Login failed with HTTP ${resp.status}`);
  }

  const json = await resp.json();

  const token =
    json?.data?.token ||
    json?.token ||
    null;

  if (!token) {
    throw new Error("No FMS token returned");
  }

  return { token };
}

/* ===========================================
   BILL-TO SEARCH (GET)
=========================================== */
async function searchBillTo({ token, code }) {
  const resp = await fetch(
    SEARCH_BILLTO_URL + encodeURIComponent(code),
    {
      method: "GET",
      headers: {
        "accept": "application/json, text/plain, */*",
        "fms-client": FMS_CLIENT,
        "fms-token": token,
        "company-id": COMPANY_ID
      }
    }
  );

  if (!resp.ok) {
    throw new Error(`Bill-To search failed HTTP ${resp.status}`);
  }

  return resp.json();
}

/* ===========================================
   ORDER SEARCH (POST)
=========================================== */
async function searchOrders({ token, body }) {
  const resp = await fetch(SEARCH_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "fms-client": FMS_CLIENT,
      "fms-token": token,
      "Company-Id": COMPANY_ID
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    throw new Error(`Order search failed HTTP ${resp.status}`);
  }

  return resp.json();
}

/* ===========================================
   POD FILE LOOKUP (GET)
=========================================== */
async function getFiles({ token, orderNo }) {
  const url = FILES_URL + encodeURIComponent(orderNo);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "fms-client": FMS_CLIENT,
      "fms-token": token,
      "company-id": COMPANY_ID,
      "accept": "application/json"
    }
  });

  if (!resp.ok) {
    throw new Error(`File lookup failed HTTP ${resp.status}`);
  }

  return resp.json();
}
