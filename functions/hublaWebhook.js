const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.hublaWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const body = req.body || {};
    const type = body.type;
    const ev = body.event || {};

    if (!type || !ev) return res.status(400).send("Bad Request");

    // ---------------------
    // UNIVERSAL FIELD EXTRACTION
    // ---------------------
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
      ev?.smartInstallment?.id ||
      ev?.sourceInvoiceId ||
      null;

    if (!email || !transactionId) {
      console.error("Missing fields:", { email, transactionId });
      throw new Error("Missing required fields: email or transactionId");
    }

    // Idempotency
    const idempotencyKey =
      req.headers["x-hubla-idempotency"] ||
      `${type}-${transactionId}-${Date.now()}`;

    const logRef = db.collection("webhook_events").doc(idempotencyKey);
    if ((await logRef.get()).exists) return res.status(200).send("Duplicate");

    await logRef.set({
      type,
      email,
      transactionId,
      payload: body,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false,
    });

    // ---------------------
    // MAP STATUS
    // ---------------------
    const status = mapStatusFromType(type);
    const hasAccess = ["paid", "active", "completed", "on_schedule"].includes(status);

    // ---------------------
    // USER CREATION
    // ---------------------
    const user = await getOrCreateUser(email, name);

    // ---------------------
    // SAVE SUBSCRIPTION
    // ---------------------
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

    // ---------------------
    // UPDATE CUSTOM CLAIMS
    // ---------------------
    await admin.auth().setCustomUserClaims(user.uid, {
      hasAccess,
      hublaStatus: status,
      lastHublaEvent: type,
      lastTransactionId: transactionId,
    });

    // ---------------------
    // 🔥 UPDATE VIEWS (ACTIVE / INACTIVE)
    // ---------------------
    const activeRef = db.collection("views").doc("active_users");
    const inactiveRef = db.collection("views").doc("inactive_users");

    if (hasAccess) {
      // Add to active users
      await activeRef.collection("list").doc(user.uid).set({
        uid: user.uid,
        email,
        name,
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Remove from inactive
      await inactiveRef.collection("list").doc(user.uid).delete();
    } else {
      // Add to inactive
      await inactiveRef.collection("list").doc(user.uid).set({
        uid: user.uid,
        email,
        name,
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Remove from active
      await activeRef.collection("list").doc(user.uid).delete();
    }

    // ---------------------
    // END
    // ---------------------
    await logRef.set({ success: true }, { merge: true });

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook Error:", err);
    return res.status(500).send("Internal Error");
  }
});

// USER CREATION
async function getOrCreateUser(email, name) {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      user = await admin.auth().createUser({ email, displayName: name });
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

// STATUS MAPPING
function mapStatusFromType(type) {
  const t = type.toLowerCase();

  if (t.includes("approved") || t.includes("completed") || t.includes("active"))
    return "paid";

  if (t.includes("pending")) return "pending";

  if (t.includes("canceled") || t.includes("aborted") || t.includes("disabled"))
    return "canceled";

  if (t.includes("expired")) return "expired";

  if (t.includes("refunded")) return "refunded";

  if (t.includes("chargeback")) return "chargeback";

  return "unknown";
}
