import { createHash } from "node:crypto";
import { Webhook } from "fedapay";
import type {
  CreatePaymentInput,
  CreatedPayment,
  PaymentProvider,
  ProviderTransaction,
  VerifiedPaymentEvent,
} from "./types";

const FEDAPAY_SANDBOX_API = "https://sandbox-api.fedapay.com/v1";
const FETCH_TIMEOUT_MS = 20_000;

type JsonRecord = Record<string, unknown>;

function getSecret(name: "FEDAPAY_SECRET_KEY" | "FEDAPAY_WEBHOOK_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to use FedaPay.`);
  }
  return value;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function unwrapRecord(value: unknown): JsonRecord {
  const root = asRecord(value);
  if (!root) {
    throw new Error("FedaPay returned an invalid response.");
  }
  for (const key of ["v1/transaction", "v1/token", "transaction", "data"]) {
    const nested = asRecord(root[key]);
    if (nested) {
      if (key === "data") {
        for (const nestedKey of ["v1/transaction", "v1/token", "transaction"]) {
          const deeper = asRecord(nested[nestedKey]);
          if (deeper) return deeper;
        }
      }
      return nested;
    }
  }
  return root;
}

async function fedapayRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${FEDAPAY_SANDBOX_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecret("FEDAPAY_SECRET_KEY")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`FedaPay request failed with status ${response.status}.`);
  }

  return response.json();
}

function splitCustomerName(name: string) {
  const parts = name.trim().split(/\s+/);
  const firstname = parts.shift() ?? name;
  return { firstname, lastname: parts.join(" ") || firstname };
}

function getTransactionFromEvent(event: JsonRecord) {
  const entity =
    asRecord(event.entity) ??
    asRecord(event.transaction) ??
    asRecord(asRecord(event.data)?.transaction) ??
    asRecord(event.data);
  const id = entity?.id;
  if ((typeof id !== "string" && typeof id !== "number") || String(id).length === 0) {
    throw new Error("FedaPay event did not include a transaction ID.");
  }
  return String(id);
}

function normalizeCurrency(value: unknown): string {
  if (typeof value === "string") return value.toUpperCase();
  const record = asRecord(value);
  const code = record?.iso ?? record?.code;
  return typeof code === "string" ? code.toUpperCase() : "";
}

export const fedapayProvider: PaymentProvider = {
  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const mode = input.paymentMethod === "mixx_by_yas" ? "togocel" : "moov_tg";
    const { firstname, lastname } = splitCustomerName(input.customer.name);
    const created = unwrapRecord(
      await fedapayRequest("/transactions", {
        method: "POST",
        body: JSON.stringify({
          description: `Commande ${input.orderId}`,
          amount: input.amountFcfa,
          currency: { iso: "XOF" },
          callback_url: input.callbackUrl,
          mode,
          customer: {
            firstname,
            lastname,
            email: input.customer.email,
            phone_number: { number: input.customer.phone, country: "TG" },
          },
          custom_metadata: { order_id: input.orderId },
        }),
      }),
    );
    const transactionId = created.id;
    if (
      (typeof transactionId !== "string" && typeof transactionId !== "number") ||
      String(transactionId).length === 0
    ) {
      throw new Error("FedaPay did not return a transaction ID.");
    }

    const token = unwrapRecord(
      await fedapayRequest(`/transactions/${encodeURIComponent(String(transactionId))}/token`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    const checkoutUrl =
      token.url ?? token.checkout_url ?? token.payment_url ?? token.paymentUrl;
    if (typeof checkoutUrl !== "string") {
      throw new Error("FedaPay did not return a checkout URL.");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(checkoutUrl);
    } catch {
      throw new Error("FedaPay returned an invalid checkout URL.");
    }
    if (parsedUrl.protocol !== "https:") {
      throw new Error("FedaPay returned a non-HTTPS checkout URL.");
    }

    return {
      providerTransactionId: String(transactionId),
      checkoutUrl: parsedUrl.toString(),
    };
  },

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedPaymentEvent {
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new Error("FedaPay webhook body is empty.");
    }
    const parsed = Webhook.constructEvent(
      rawBody.toString("utf8"),
      signature,
      getSecret("FEDAPAY_WEBHOOK_SECRET"),
      300,
    );
    const event = asRecord(parsed);
    const eventName =
      typeof event?.name === "string"
        ? event.name
        : typeof event?.type === "string"
          ? event.type
          : "";
    if (!eventName.startsWith("transaction.")) {
      const eventId =
        typeof event?.id === "string" || typeof event?.id === "number"
          ? String(event.id)
          : "unknown";
      return {
        eventName: eventName || "unknown",
        transactionId: "",
        eventKey: createHash("sha256")
          .update(`${eventName || "unknown"}:${eventId}`)
          .digest("hex"),
      };
    }
    const transactionId = getTransactionFromEvent(event ?? {});
    const eventId =
      typeof event?.id === "string" || typeof event?.id === "number"
        ? String(event.id)
        : transactionId;

    return {
      eventName,
      transactionId,
      eventKey: createHash("sha256")
        .update(`${eventName}:${transactionId}:${eventId}`)
        .digest("hex"),
    };
  },

  async retrieveTransaction(transactionId: string): Promise<ProviderTransaction> {
    const record = unwrapRecord(
      await fedapayRequest(`/transactions/${encodeURIComponent(transactionId)}`),
    );
    const id = record.id;
    const status = record.status;
    const amount = Number(record.amount);
    const currency = normalizeCurrency(record.currency);
    if (
      (typeof id !== "string" && typeof id !== "number") ||
      String(id) !== transactionId ||
      typeof status !== "string" ||
      !Number.isSafeInteger(amount) ||
      !currency
    ) {
      throw new Error("FedaPay transaction response is incomplete.");
    }
    return { id: String(id), status: status.toLowerCase(), amount, currency };
  },
};
