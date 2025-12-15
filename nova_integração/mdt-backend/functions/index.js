const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ========================================================
// 🔥 WEBHOOK HUBLA — ACEITA TODOS OS EVENTOS
// ========================================================
exports.hublaWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const body = req.body || {};
    const type = body.type;
    const ev = body.event || {};

    if (!type || !ev) {
      console.error("❌ Payload inválido:", body);
      return res.status(400).send("Bad Request");
    }

    // ========================================================
    // 📌 EXTRAÇÃO UNIVERSAL DE CAMPOS
    // ========================================================
    const email =
      ev?.userEmail ||
      ev?.user?.email ||
      ev?.payer?.email ||
      ev?.smartInstallment?.payer?.email ||
      null;

    const name =
      ev?.userName ||
      `${ev?.user?.firstName || ""} ${ev?.user?.lastName || ""}`.trim() ||
      `${ev?.payer?.firstName || ""} ${ev?.payer?.lastName || ""}`.trim() ||
      "";

    const transactionId =
      ev?.transactionId ||
      ev?.subscriptionId ||
      ev?.invoice?.id ||
      ev?.smartInstallment?.id ||
      ev?.sourceInvoiceId ||
      null;

    if (!email || !transactionId) {
      console.error("❌ Missing fields:", { email, transactionId });
      throw new Error("Missing required fields");
    }

    // ========================================================
    // 🧠 IDEMPOTÊNCIA
    // ========================================================
    const idempotencyKey =
      req.headers["x-hubla-idempotency"] ||
      `${type}-${transactionId}-${Date.now()}`;

    const logRef = db.collection("webhook_events").doc(idempotencyKey);
    if ((await logRef.get()).exists) {
      console.log("🔁 Evento duplicado ignorado:", idempotencyKey);
      return res.status(200).send("Duplicate");
    }

    await logRef.set({
      type,
      email,
      transactionId,
      payload: body,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false,
    });

    // ========================================================
    // 🔥 MAPEAMENTO DO STATUS
    // ========================================================
    const status = mapStatusFromType(type);

    const hasAccess = ["paid", "active", "completed"].includes(status);

    // ========================================================
    // 👤 CRIAR / BUSCAR USUÁRIO
    // ========================================================
    const user = await getOrCreateUser(email, name);

    // ========================================================
    // 💾 SALVAR SUBSCRIPTION
    // ========================================================
    await db.collection("subscriptions").doc(transactionId).set(
      {
        userId: user.uid,
        email,
        name,
        type,
        status,
        transactionId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ========================================================
    // 🔑 ATUALIZAR CUSTOM CLAIMS
    // ========================================================
    await admin.auth().setCustomUserClaims(user.uid, {
      hasAccess,
      hublaStatus: status,
      lastHublaEvent: type,
      lastTransactionId: transactionId,
    });

    // ========================================================
    // 👥 ACTIVE / INACTIVE USERS
    // ========================================================
    const activeRef = db.collection("views").doc("active_users");
    const inactiveRef = db.collection("views").doc("inactive_users");

    if (hasAccess) {
      await activeRef.collection("list").doc(user.uid).set({
        uid: user.uid,
        email,
        name,
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await inactiveRef.collection("list").doc(user.uid).delete();
    } else {
      await inactiveRef.collection("list").doc(user.uid).set({
        uid: user.uid,
        email,
        name,
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await activeRef.collection("list").doc(user.uid).delete();
    }

    await logRef.set({ success: true }, { merge: true });

    console.log("✅ Evento processado:", { type, status, email, transactionId });
    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ ERRO GERAL:", err);
    return res.status(500).send("Internal Error");
  }
});

// ========================================================
// 👤 CREATE OR GET USER
// ========================================================
async function getOrCreateUser(email, name) {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      user = await admin.auth().createUser({
        email,
        displayName: name,
      });
    } else throw err;
  }

  await db.collection("users").doc(user.uid).set(
    {
      email,
      name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return user;
}

// ========================================================
// 🔥 MAP STATUS
// ========================================================
function mapStatusFromType(type) {
  const t = type.toLowerCase();

  if (
    t.includes("approved") ||
    t.includes("completed") ||
    t.includes("active") ||
    t.includes("newsale") ||
    t.includes("on_schedule")
  )
    return "paid";

  if (t.includes("pending")) return "pending";

  if (t.includes("canceled") || t.includes("aborted")) return "canceled";

  if (t.includes("expired")) return "expired";
  if (t.includes("refunded")) return "refunded";

  return "unknown";
}
