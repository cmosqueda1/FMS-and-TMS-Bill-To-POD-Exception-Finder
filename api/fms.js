// /api/fms.js
// Handles login, Bill-To search, order search, POD files

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
    console.error("FMS API ERROR:", err);
    return res.status(500).json({ error: "Internal FMS error" });
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
const COMPANY_ID = "SBFH";

/* ------------------------------------------
   LOGIN
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

  if (!resp.ok) throw new Error("FMS login error");

  const json = await resp.json();
  return { token: json?.data?.token || json?.token };
}

/* ------------------------------------------
   BILL-TO SEARCH  (THE FIX)
------------------------------------------- */
async function fmsSearchBillTo({ token, code }) {
  const url = SEARCH_BILLTO_URL + encodeURIComponent(code);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "accept": "application/json, text/plain, */*",
      "fms-client": FMS_CLIENT,
      "fms-token": token,
      "company-id": COMPANY_ID,
      "authorization": token
    }
  });

  if (!resp.ok) throw new Error("FMS search-business-client failed");

  return resp.json();
}

/* ------------------------------------------
   ORDER SEARCH (unchanged)
------------------------------------------- */
async function fmsSearchOrders({ token, body }) {
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

  return resp.json();
}

/* ------------------------------------------
   FILE (POD) LOOKUP
------------------------------------------- */
async function fmsFiles({ token, orderNo }) {
  const resp = await fetch(FILES_URL + orderNo, {
    method: "GET",
    headers: {
      "fms-client": FMS_CLIENT,
      "fms-token": token,
      "Company-Id": COMPANY_ID
    }
  });

  return resp.json();
}
