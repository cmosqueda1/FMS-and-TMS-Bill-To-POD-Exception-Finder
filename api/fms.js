// /api/fms.js
// Serverless proxy for ALL FMS interactions required by the Bill-To POD Compare tool

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { action, payload } = req.body || {};

  try {
    switch (action) {
      case "login":
        return res.json(await fmsLogin());
      case "search":
        return res.json(await fmsSearch(payload));
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
   CONSTANTS — identical to browser behavior
------------------------------------------- */
const FMS_BASE = "https://fms.item.com";
const LOGIN_URL = `${FMS_BASE}/fms-platform-user/Auth/Login`;
const SEARCH_URL = `${FMS_BASE}/fms-platform-order/shipment-orders/query`;
const FILES_URL = `${FMS_BASE}/fms-platform-order/shipper/order-file/`;

const FMS_CLIENT = "FMS_WEB";
const FMS_USER = process.env.FMS_USER;
const FMS_PASS = process.env.FMS_PASS;

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
      account: FMS_USER,
      password: FMS_PASS
    })
  });

  if (!resp.ok) throw new Error(`FMS login HTTP ${resp.status}`);

  const json = await resp.json();
  return {
    token: json?.token || json?.data?.token || null
  };
}

/* ------------------------------------------
   SEARCH ORDERS (Bill-To or PRO)
------------------------------------------- */
async function fmsSearch({ token, body }) {
  const resp = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "fms-client": FMS_CLIENT,
      "fms-token": token,
      "Company-Id": "SBFH"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) throw new Error(`FMS search HTTP ${resp.status}`);

  return resp.json();
}

/* ------------------------------------------
   GET ORDER FILES (POD detection)
------------------------------------------- */
async function fmsFiles({ token, orderNo }) {
  const resp = await fetch(FILES_URL + orderNo, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "fms-client": FMS_CLIENT,
      "fms-token": token,
      "Company-Id": "SBFH"
    }
  });

  if (!resp.ok) throw new Error("FMS files error");

  return resp.json();
}
