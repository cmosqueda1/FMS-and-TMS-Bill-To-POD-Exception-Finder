export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, payload } = req.body;

  try {
    switch (action) {

      /* LOGIN */
      case "login": {
        const form = new URLSearchParams();
        form.set("username", process.env.TMS_USER);
        form.set("password", process.env.TMS_PASS);
        form.set("UserID", "null");
        form.set("UserToken", "null");
        form.set("pageName", "/index.html");

        const resp = await fetch("https://tms.freightapp.com/write/check_login.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
          },
          body: form
        });

        const j = await resp.json();
        return res.status(200).json(j);
      }

      /* TRACE (bill-to or pro) */
      case "trace": {
        const form = new URLSearchParams(payload);
        const resp = await fetch("https://tms.freightapp.com/write_new/get_tms_trace.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
          },
          body: form
        });

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
