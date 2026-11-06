import { createHash } from "node:crypto";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm";
import {
  CreateOrderBody,
  DownloadOrderFileParams,
  GetOrderStatusParams,
  GetProductParams,
  ListProductsQueryParams,
  SubmitContactMessageBody,
} from "@workspace/api-zod";
import {
  contactMessagesTable,
  db,
  ordersTable,
  productsTable,
} from "@workspace/db";
import { rateLimit } from "express-rate-limit";
import { ObjectStorageService } from "../lib/objectStorage";
import { paymentProvider } from "../payments";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const orderLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans une minute." },
});

const contactLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de messages. Réessayez dans une minute." },
});

function publicProduct(product: typeof productsTable.$inferSelect) {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    type: product.type,
    category: product.category,
    description: product.description,
    priceFcfa: product.priceFcfa,
    coverUrl: product.coverUrl,
    isActive: product.isActive,
  };
}

function errorResponse(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function getSiteOrigin(req: Request): string {
  const configuredOrigin = process.env.PUBLIC_APP_URL;
  const candidate = configuredOrigin || `${req.protocol}://${req.get("host")}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_APP_URL or request host must be a valid URL.");
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("The storefront origin is invalid.");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("The storefront must use HTTPS in production.");
  }
  return parsed.origin;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTogoPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00228")) digits = digits.slice(2);
  if (digits.startsWith("228") && digits.length === 11) digits = digits.slice(3);
  return digits.length === 8 ? `+228${digits}` : null;
}

router.get("/products", async (req, res) => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    errorResponse(res, 400, "Filtres de catalogue invalides.");
    return;
  }
  const { search, category } = parsed.data;
  const conditions = [eq(productsTable.isActive, true)];
  if (category) conditions.push(eq(productsTable.category, category));
  if (search?.trim()) {
    const safeSearch = search.trim().replace(/[\\%_]/g, "\\$&");
    const match = `%${safeSearch}%`;
    conditions.push(
      or(
        ilike(productsTable.title, match),
        ilike(productsTable.category, match),
        ilike(productsTable.description, match),
      )!,
    );
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.createdAt))
    .limit(100);
  res.json(products.map(publicProduct));
});

router.get("/products/:slug", async (req, res) => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) {
    errorResponse(res, 400, "Identifiant de produit invalide.");
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.slug, parsed.data.slug), eq(productsTable.isActive, true)))
    .limit(1);
  if (!product) {
    errorResponse(res, 404, "Produit introuvable.");
    return;
  }
  res.json(publicProduct(product));
});

router.post("/orders", orderLimiter, async (req, res) => {
  const raw =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};
  const candidate = {
    ...raw,
    customerName:
      typeof raw.customerName === "string" ? raw.customerName.trim() : raw.customerName,
    email: typeof raw.email === "string" ? raw.email.trim() : raw.email,
    phone: typeof raw.phone === "string" ? raw.phone.trim() : raw.phone,
  };
  const parsed = CreateOrderBody.safeParse(candidate);
  if (
    !parsed.success ||
    parsed.data.customerName.trim().length < 2 ||
    !normalizeTogoPhone(parsed.data.phone)
  ) {
    errorResponse(res, 400, "Coordonnées de commande invalides.");
    return;
  }

  const input = parsed.data;
  const phone = normalizeTogoPhone(input.phone)!;
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, input.productId), eq(productsTable.isActive, true)))
    .limit(1);
  if (!product) {
    errorResponse(res, 404, "Ce produit n’est plus disponible.");
    return;
  }

  let siteOrigin: string;
  try {
    siteOrigin = getSiteOrigin(req);
  } catch (error) {
    req.log.error({ err: error }, "Invalid storefront origin");
    errorResponse(res, 503, "La boutique n’est pas configurée pour accepter les commandes.");
    return;
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      productId: product.id,
      productTitle: product.title,
      productFileObjectPath: product.fileObjectPath,
      productFileName: product.fileName,
      productFileContentType: product.fileContentType,
      productFileSize: product.fileSize,
      amountFcfa: product.priceFcfa,
      customerName: input.customerName.trim(),
      email: input.email.trim().toLowerCase(),
      phone,
      siteOrigin,
      paymentMethod: input.paymentMethod,
      status: "pending",
    })
    .returning();

  try {
    const callbackUrl = new URL(`/succes/${order.id}`, siteOrigin).toString();
    const checkout = await paymentProvider.createPayment({
      orderId: order.id,
      amountFcfa: order.amountFcfa,
      paymentMethod: order.paymentMethod,
      customer: {
        name: order.customerName,
        email: order.email,
        phone: order.phone.replace(/^\+228/, ""),
      },
      callbackUrl,
    });
    const [updatedOrder] = await db
      .update(ordersTable)
      .set({
        providerTransactionId: checkout.providerTransactionId,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, order.id))
      .returning();

    res.status(201).json({
      orderId: updatedOrder.id,
      productTitle: updatedOrder.productTitle,
      amountFcfa: updatedOrder.amountFcfa,
      paymentMethod: updatedOrder.paymentMethod,
      status: updatedOrder.status,
      checkoutUrl: checkout.checkoutUrl,
      createdAt: updatedOrder.createdAt,
    });
  } catch (error) {
    await db
      .update(ordersTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pending")));
    req.log.error({ err: error, orderId: order.id }, "Payment checkout creation failed");
    errorResponse(res, 502, "Le paiement ne peut pas être préparé pour le moment.");
  }
});

router.get("/orders/:orderId", async (req, res) => {
  const parsed = GetOrderStatusParams.safeParse(req.params);
  if (!parsed.success) {
    errorResponse(res, 400, "Référence de commande invalide.");
    return;
  }
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, parsed.data.orderId))
    .limit(1);
  if (!order) {
    errorResponse(res, 404, "Commande introuvable.");
    return;
  }
  res.json({
    orderId: order.id,
    productTitle: order.productTitle,
    amountFcfa: order.amountFcfa,
    paymentMethod: order.paymentMethod,
    status: order.status,
    createdAt: order.createdAt,
  });
});

router.get("/downloads/:token", async (req, res) => {
  const parsed = DownloadOrderFileParams.safeParse(req.params);
  if (!parsed.success || !/^[a-f0-9]{64}$/i.test(parsed.data?.token ?? "")) {
    errorResponse(res, 404, "Lien de téléchargement invalide ou expiré.");
    return;
  }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const now = new Date();
  const [eligibleOrder] = await db
    .select({
      id: ordersTable.id,
      fileObjectPath: ordersTable.productFileObjectPath,
      fileName: ordersTable.productFileName,
      fileSize: ordersTable.productFileSize,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.downloadTokenHash, tokenHash),
        eq(ordersTable.status, "paid"),
        gt(ordersTable.downloadExpiresAt, now),
        lt(ordersTable.downloadCount, 3),
      ),
    )
    .limit(1);
  if (!eligibleOrder) {
    errorResponse(res, 404, "Lien de téléchargement invalide ou expiré.");
    return;
  }

  const [consumed] = await db
    .update(ordersTable)
    .set({ downloadCount: sql`${ordersTable.downloadCount} + 1` })
    .where(
      and(
        eq(ordersTable.id, eligibleOrder.id),
        eq(ordersTable.status, "paid"),
        gt(ordersTable.downloadExpiresAt, new Date()),
        lt(ordersTable.downloadCount, 3),
      ),
    )
    .returning({ id: ordersTable.id });
  if (!consumed) {
    errorResponse(res, 404, "Lien de téléchargement invalide ou expiré.");
    return;
  }

  try {
    const file = await objectStorage.getObjectEntityFile(eligibleOrder.fileObjectPath);
    const [metadata] = await file.getMetadata();
    const safeName = basename(eligibleOrder.fileName).replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );
    res.setHeader("Content-Length", String(metadata.size ?? eligibleOrder.fileSize));
    await pipeline(file.createReadStream(), res);
  } catch (error) {
    req.log.error({ err: error, orderId: eligibleOrder.id }, "Private product download failed");
    if (!res.headersSent) errorResponse(res, 500, "Le fichier ne peut pas être transmis.");
    else res.destroy(error as Error);
  }
});

router.post("/contact", contactLimiter, async (req, res) => {
  const raw =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};
  const candidate = {
    ...raw,
    name: typeof raw.name === "string" ? raw.name.trim() : raw.name,
    email: typeof raw.email === "string" ? raw.email.trim() : raw.email,
    message: typeof raw.message === "string" ? raw.message.trim() : raw.message,
  };
  const parsed = SubmitContactMessageBody.safeParse(candidate);
  if (
    !parsed.success ||
    parsed.data.name.length < 2 ||
    parsed.data.message.length < 10
  ) {
    errorResponse(res, 400, "Informations de contact invalides.");
    return;
  }
  await db.insert(contactMessagesTable).values({
    name: parsed.data.name.trim(),
    email: parsed.data.email.trim().toLowerCase(),
    message: parsed.data.message.trim(),
  });
  res.status(201).json({ success: true });
});

export default router;
