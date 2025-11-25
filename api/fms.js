export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, payload } = req.body;

  try {
    switch (action) {

      /* LOGIN */
      case "login": {
        const resp = await fetch("https://fms.item.com/fms-platform-user/Auth/Login", {
          method: "POST",
          headers: {
            "fms-client": "FMS_WEB",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            account: process.env.FMS_USER,
            password: process.env.FMS_PASS
          })
        });
        const j = await resp.json();
        return res.status(200).json(j);
      }

      /* QUERY ORDERS (Bill-to search or PRO search) */
      case "search": {
        const resp = await fetch("https://fms.item.com/fms-platform-order/shipment-orders/query", {
          method: "POST",
          headers: {
            "fms-client": "FMS_WEB",
            "fms-token": payload.token,
            "Content-Type": "application/json",
            "Company-Id": "SBFH"
          },
          body: JSON.stringify(payload.body)
        });
        const j = await resp.json();
        return res.status(200).json(j);
      }

      /* GET POD FILES */
      case "files": {
        const resp = await fetch(
          "https://fms.item.com/fms-platform-order/files/" + encodeURIComponent(payload.orderNo),
          {
            method: "GET",
            headers: {
              "fms-client": "FMS_WEB",
              "fms-token": payload.token,
              "company-id": "SBFH"
            }
          }
        );
        const j = await resp.json();
        return res.status(200).json(j);
      }

      default:
        return res.status(400).json({ error: "Invalid action" });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
