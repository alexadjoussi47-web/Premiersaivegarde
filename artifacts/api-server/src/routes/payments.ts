import { randomBytes, createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, lt } from "drizzle-orm";
import {
  db,
  ordersTable,
  webhookEventsTable,
  type Order,
} from "@workspace/db";
import { sendDownloadEmail } from "../lib/email";
import { paymentProvider } from "../payments";

const router: IRouter = Router();
const EMAIL_CLAIM_TTL_MS = 10 * 60_000;

function validOutcome(eventName: string, status: string) {
  if (eventName === "transaction.approved" && status === "approved") {
    return "paid" as const;
  }
  if (eventName === "transaction.declined" && status === "declined") {
    return "failed" as const;
  }
  if (
    (eventName === "transaction.canceled" ||
      eventName === "transaction.cancelled") &&
    (status === "canceled" || status === "cancelled")
  ) {
    return "failed" as const;
  }
  return null;
}

router.post("/webhooks/fedapay", async (req, res) => {
  const signature = req.get("x-fedapay-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Signature ou corps du webhook manquant." });
    return;
  }

  let event;
  try {
    event = paymentProvider.verifyWebhook(req.body, signature);
  } catch {
    // Do not log the raw webhook payload or signature: the body contains customer data.
    res.status(400).json({ error: "Signature FedaPay invalide." });
    return;
  }
  if (!event.transactionId) {
    res.json({ received: true });
    return;
  }

  let transaction;
  try {
    transaction = await paymentProvider.retrieveTransaction(event.transactionId);
  } catch (error) {
    req.log.error({ err: error }, "FedaPay transaction verification failed");
    res.status(502).json({ error: "Vérification FedaPay temporairement indisponible." });
    return;
  }
  if (transaction.id !== event.transactionId) {
    res.status(400).json({ error: "Transaction FedaPay invalide." });
    return;
  }

  const [knownOrder] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.providerTransactionId, transaction.id))
    .limit(1);
  if (!knownOrder) {
    // A valid but unrelated transaction must not be retried indefinitely.
    res.json({ received: true });
    return;
  }
  if (
    transaction.amount !== knownOrder.amountFcfa ||
    transaction.currency !== "XOF"
  ) {
    req.log.warn(
      { orderId: knownOrder.id, transactionId: transaction.id },
      "FedaPay amount or currency did not match the order",
    );
    res.status(400).json({ error: "Le montant FedaPay ne correspond pas à la commande." });
    return;
  }

  const outcome = validOutcome(event.eventName, transaction.status);
  if (!outcome) {
    res.json({ received: true });
    return;
  }

  const delivery = await db.transaction(async (tx) => {
    await tx
      .insert(webhookEventsTable)
      .values({ providerEventKey: event.eventKey })
      .onConflictDoNothing();

    const [order] = await tx
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, knownOrder.id),
          eq(ordersTable.providerTransactionId, transaction.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!order) return null;

    if (outcome === "failed") {
      if (order.status !== "paid") {
        await tx
          .update(ordersTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(ordersTable.id, order.id));
      }
      return null;
    }

    const now = new Date();
    const claimExpired =
      !order.emailDeliveryClaimedAt ||
      order.emailDeliveryClaimedAt.getTime() < now.getTime() - EMAIL_CLAIM_TTL_MS;
    if (order.emailSentAt || !claimExpired) {
      if (order.status !== "paid") {
        await tx
          .update(ordersTable)
          .set({ status: "paid", paidAt: order.paidAt ?? now, updatedAt: now })
          .where(eq(ordersTable.id, order.id));
      }
      return null;
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [paidOrder] = await tx
      .update(ordersTable)
      .set({
        status: "paid",
        paidAt: order.paidAt ?? now,
        downloadTokenHash: tokenHash,
        downloadExpiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
        downloadCount: 0,
        emailDeliveryClaimedAt: now,
        updatedAt: now,
      })
      .where(eq(ordersTable.id, order.id))
      .returning();
    return { order: paidOrder, token };
  });

  if (delivery) {
    try {
      await sendDownloadEmail(delivery.order, delivery.token);
      await db
        .update(ordersTable)
        .set({ emailSentAt: new Date(), emailDeliveryClaimedAt: null })
        .where(eq(ordersTable.id, delivery.order.id));
    } catch (error) {
      await db
        .update(ordersTable)
        .set({ emailDeliveryClaimedAt: null })
        .where(
          and(
            eq(ordersTable.id, delivery.order.id),
            lt(ordersTable.emailDeliveryClaimedAt, new Date()),
          ),
        );
      req.log.error(
        { err: error, orderId: delivery.order.id },
        "Download email delivery failed",
      );
      res.status(502).json({ error: "Paiement confirmé, mais l’e-mail n’a pas encore été envoyé." });
      return;
    }
  }

  res.json({ received: true });
});

export default router;
