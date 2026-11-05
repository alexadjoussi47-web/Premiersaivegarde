import { ReplitConnectors } from "@replit/connectors-sdk";
import type { Order } from "@workspace/db";

const connectors = new ReplitConnectors();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export async function sendDownloadEmail(order: Order, token: string) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM must be configured for Resend.");

  const downloadUrl = new URL(
    `/api/downloads/${encodeURIComponent(token)}`,
    order.siteOrigin,
  ).toString();
  const safeTitle = escapeHtml(order.productTitle);
  const safeName = escapeHtml(order.customerName);

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Boutique Digitale Togo <${from}>`,
      to: [order.email],
      subject: `Votre achat est confirmé : ${order.productTitle}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#173d39"><p>Bonjour ${safeName},</p><h1 style="font-size:24px">Votre ressource est prête.</h1><p>Votre achat de <strong>${safeTitle}</strong> est confirmé.</p><p><a href="${downloadUrl}" style="display:inline-block;background:#176b60;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Télécharger mon fichier</a></p><p>Ce lien est valable 24 heures et permet jusqu’à 3 téléchargements.</p><p style="color:#687975;font-size:13px">Si vous n’avez pas effectué cette commande, vous pouvez ignorer ce message.</p></div>`,
      text: `Bonjour ${order.customerName}, votre achat de ${order.productTitle} est confirmé. Téléchargez votre fichier ici : ${downloadUrl}. Ce lien expire dans 24 heures et permet jusqu’à 3 téléchargements.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend delivery failed with status ${response.status}.`);
  }
}
