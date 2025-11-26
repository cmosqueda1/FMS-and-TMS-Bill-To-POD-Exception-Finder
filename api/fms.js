// /api/fms.js
// Fully corrected FMS proxy — restores the same working logic as before.
// This version uses the correct login endpoint, correct headers, and correct token propagation.

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { action, payload } = req.body || {};

  try {
    switch (action) {
      case "login":
        return res.json(await fmsLogin());
      case "searchBillTo":
        return res.json(await fmsSearchBillTo(payload));
      case "search":
        return res.json(await fmsSearchOrders(payload));
      case "files":
        return res.json(await fmsFiles(payload));
      default:
        return res.status(400).json({ error: "Unknown FMS action" });
    }
  } catch (err) {
    console.error("🔥 FMS ERROR:", err);
    return res.status(500).json({ error: "FMS error: " + err.message });
  }
}

/* ------------------------------------------
   CONSTANTS
------------------------------------------- */

const FMS_BASE = "https://fms.item.com";
const LOGIN_URL = `${FMS_BASE}/fms-platform-user/Auth/Login`;
const SEARCH_BILLTO_URL = `${FMS_BASE}/fms-platform-order/shipment-orders/search-business-client?Code=`;
const SEARCH_ORDERS_URL = `${FMS_BASE}/fms-platform-order/shipment-orders/query`;
const FILES_URL = `${FMS_BASE}/fms-platform-order/shipper/order-file/`;

const FMS_CLIENT = "FMS_WEB";
const COMPANY = "SBFH";

/* ------------------------------------------
   LOGIN (Correct working version)
------------------------------------------- */
async function fmsLogin() {
  const resp = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "fms-client": FMS_CLIENT
    },
    body: JSON.stringify({
      account: process.env.FMS_USER,
      password: process.env.FMS_PASS
    })
  });

  if (!resp.ok) throw new Error(`Login HTTP ${resp.status}`);

  const data = await resp.json();

  const token =
    data?.token ||
    data?.data?.token ||
    data?.result?.token ||
    null;

  if (!token) throw new Error("No FMS token returned");

  return { token };
}

/* ------------------------------------------
   BILL-TO SEARCH (GET)
------------------------------------------- */
async function fmsSearchBillTo({ token, code }) {
  const url = SEARCH_BILLTO_URL + encodeURIComponent(code);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json, text/plain, */*",
      "authorization": token,          // REQUIRED
      "fms-token": token,              // REQUIRED
      "company-id": COMPANY,           // REQUIRED
      "fms-client": FMS_CLIENT
    }
  });

  if (!resp.ok) {
    throw new Error(`search-business-client HTTP ${resp.status}`);
  }

  return resp.json();
}

/* ------------------------------------------
   ORDER SEARCH (POST)
------------------------------------------- */
async function fmsSearchOrders({ token, body }) {
  const resp = await fetch(SEARCH_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "authorization": token,
      "fms-token": token,
      "company-id": COMPANY,
      "fms-client": FMS_CLIENT
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    throw new Error(`Order search HTTP ${resp.status}`);
  }

  return resp.json();
}

/* ------------------------------------------
   POD FILE SEARCH
------------------------------------------- */
async function fmsFiles({ token, orderNo }) {
  const resp = await fetch(FILES_URL + orderNo, {
    method: "GET",
    headers: {
      "accept": "application/json",
      "authorization": token,
      "fms-token": token,
      "company-id": COMPANY,
      "fms-client": FMS_CLIENT
    }
  });

  if (!resp.ok) throw new Error(`Files HTTP ${resp.status}`);

  return resp.json();
}
