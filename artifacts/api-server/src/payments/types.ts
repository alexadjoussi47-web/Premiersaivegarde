export type MobilePaymentMethod = "mixx_by_yas" | "flooz";

export interface CreatePaymentInput {
  orderId: string;
  amountFcfa: number;
  paymentMethod: MobilePaymentMethod;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  callbackUrl: string;
}

export interface CreatedPayment {
  providerTransactionId: string;
  checkoutUrl: string;
}

export interface VerifiedPaymentEvent {
  eventName: string;
  transactionId: string;
  eventKey: string;
}

export interface ProviderTransaction {
  id: string;
  status: string;
  amount: number;
  currency: string;
}

/**
 * Payment providers expose the same checkout and signed-webhook interface.
 * Provider-specific request and response formats stay behind this boundary.
 */
export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  verifyWebhook(rawBody: Buffer, signature: string): VerifiedPaymentEvent;
  retrieveTransaction(transactionId: string): Promise<ProviderTransaction>;
}
