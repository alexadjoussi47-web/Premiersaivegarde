---
name: FedaPay checkout
description: Provider choice and payment-confirmation boundary for the Togo storefront.
---

The merchant chose direct FedaPay sandbox for this storefront, with Mixx by Yas and Flooz as the customer-facing options. The payment provider module should remain replaceable later, but the current checkout must not change providers without the merchant’s direction. A browser return is informational only; only a signature-verified server webhook can mark an order paid.

**Why:** The merchant selected FedaPay direct and explicitly required signed webhook confirmation rather than trusting the browser return.

**How to apply:** Preserve the provider boundary and webhook-only paid transition when changing checkout, payment status, or delivery logic.
