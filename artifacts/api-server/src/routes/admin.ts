import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import {
  AdminLoginBody,
  CreateProductBody,
  ListAdminOrdersQueryParams,
  RequestProductUploadUrlBody,
  UpdateProductBody,
  UpdateProductParams,
} from "@workspace/api-zod";
import {
  adminCredentialsTable,
  db,
  ordersTable,
  productUploadsTable,
  productsTable,
} from "@workspace/db";
import { requireAdminSession, requireSameOriginMutation } from "../middleware/adminAuth";
import { verifyAdminPassword } from "../lib/adminPassword";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." },
});

const allowedFiles: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".epub": ["application/epub+zip", "application/zip"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".mp4": ["video/mp4"],
  ".mp3": ["audio/mpeg"],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

class InvalidUploadError extends Error {}

function safeFileName(value: string) {
  return (value.replace(/\\/g, "/").split("/").pop() || "document")
    .replace(/[\r\n\0]/g, "_")
    .slice(0, 180);
}

function assertAllowedFile(name: string, contentType: string) {
  const fileName = safeFileName(name);
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const acceptedTypes = allowedFiles[extension];
  if (
    !acceptedTypes ||
    (contentType !== "application/octet-stream" &&
      !acceptedTypes.includes(contentType.toLowerCase()))
  ) {
    throw new InvalidUploadError(
      "Formats acceptés : PDF, EPUB, ZIP, MP4, MP3, PPTX ou DOCX.",
    );
  }
  return fileName;
}

function safeCoverUrl(value: string | null | undefined) {
  if (value == null || value === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InvalidUploadError("L’adresse de couverture est invalide.");
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidUploadError("La couverture doit utiliser une adresse HTTPS.");
  }
  return parsed.toString();
}

function productResponse(product: typeof productsTable.$inferSelect) {
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

function makeSlug(title: string) {
  const base =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 110) || "produit";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

async function readyUpload(uploadId: string) {
  const [upload] = await db
    .select()
    .from(productUploadsTable)
    .where(eq(productUploadsTable.uploadId, uploadId))
    .limit(1);
  if (!upload || upload.expiresAt.getTime() <= Date.now()) {
    throw new InvalidUploadError("Le téléversement a expiré. Importez le fichier à nouveau.");
  }

  const file = await objectStorage.getObjectEntityFile(upload.objectPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== upload.size) {
    throw new InvalidUploadError("La taille du fichier téléversé ne correspond pas.");
  }
  const actualType = String(metadata.contentType ?? "application/octet-stream")
    .split(";")[0]
    .toLowerCase();
  if (
    actualType !== "application/octet-stream" &&
    actualType !== upload.contentType.toLowerCase()
  ) {
    throw new InvalidUploadError("Le type du fichier téléversé ne correspond pas.");
  }
  assertAllowedFile(upload.originalName, upload.contentType);
  return upload;
}

function sessionOperation(
  operation: (callback: (error?: Error) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    operation((error) => (error ? reject(error) : resolve()));
  });
}

router.get("/admin/session", (req, res) => {
  res.json({ authenticated: req.session.adminAuthenticated === true });
});

router.post(
  "/admin/login",
  loginLimiter,
  requireSameOriginMutation,
  async (req, res) => {
    const parsed = AdminLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Mot de passe invalide." });
      return;
    }
    const isValid = await verifyAdminPassword(parsed.data.password);
    if (!isValid) {
      res.status(401).json({ error: "Identifiants invalides." });
      return;
    }

    await sessionOperation((callback) => req.session.regenerate(callback));
    req.session.adminAuthenticated = true;
    await sessionOperation((callback) => req.session.save(callback));
    res.json({ authenticated: true });
  },
);

router.post(
  "/admin/logout",
  requireAdminSession,
  requireSameOriginMutation,
  async (req, res) => {
    await sessionOperation((callback) => req.session.destroy(callback));
    res.clearCookie("bdt.sid", { path: "/" });
    res.json({ success: true });
  },
);

router.use("/admin", requireAdminSession, requireSameOriginMutation);

router.get("/admin/summary", async (_req, res) => {
  const [totalOrders] = await db.select({ value: count() }).from(ordersTable);
  const [pendingOrders] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(eq(ordersTable.status, "pending"));
  const [paidOrders] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(eq(ordersTable.status, "paid"));
  const [revenue] = await db
    .select({
      value: sql<number>`coalesce(sum(${ordersTable.amountFcfa}), 0)`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.status, "paid"));
  const [activeProducts] = await db
    .select({ value: count() })
    .from(productsTable)
    .where(eq(productsTable.isActive, true));

  res.json({
    totalOrders: totalOrders.value,
    pendingOrders: pendingOrders.value,
    paidOrders: paidOrders.value,
    revenueFcfa: Number(revenue.value),
    activeProducts: activeProducts.value,
  });
});

router.get("/admin/orders", async (req, res) => {
  const parsed = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtre de commande invalide." });
    return;
  }
  const orders = await db
    .select()
    .from(ordersTable)
    .where(parsed.data.status ? eq(ordersTable.status, parsed.data.status) : undefined)
    .orderBy(desc(ordersTable.createdAt))
    .limit(200);
  res.json(
    orders.map((order) => ({
      orderId: order.id,
      customerName: order.customerName,
      email: order.email,
      phone: order.phone,
      productTitle: order.productTitle,
      amountFcfa: order.amountFcfa,
      paymentMethod: order.paymentMethod,
      status: order.status,
      createdAt: order.createdAt,
    })),
  );
});

router.get("/admin/products", async (_req, res) => {
  const products = await db
    .select()
    .from(productsTable)
    .orderBy(desc(productsTable.createdAt))
    .limit(500);
  res.json(products.map(productResponse));
});

router.post("/admin/products/upload-url", async (req, res) => {
  const parsed = RequestProductUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informations de fichier invalides." });
    return;
  }

  try {
    const name = assertAllowedFile(parsed.data.name, parsed.data.contentType);
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    if (!objectPath.startsWith("/objects/")) {
      throw new Error("Private storage returned an invalid object path.");
    }
    const uploadId = randomUUID();
    await db.insert(productUploadsTable).values({
      uploadId,
      objectPath,
      originalName: name,
      contentType: parsed.data.contentType.toLowerCase(),
      size: parsed.data.size,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    await db
      .delete(productUploadsTable)
      .where(lt(productUploadsTable.expiresAt, new Date()));
    res.json({ uploadURL, objectPath, uploadId });
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Private product upload URL creation failed");
    res.status(503).json({ error: "Le stockage privé est momentanément indisponible." });
  }
});

router.post("/admin/products", async (req, res) => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informations de produit invalides." });
    return;
  }

  try {
    const upload = await readyUpload(parsed.data.uploadId);
    const product = await db.transaction(async (tx) => {
      const [lockedUpload] = await tx
        .select()
        .from(productUploadsTable)
        .where(eq(productUploadsTable.uploadId, upload.uploadId))
        .for("update")
        .limit(1);
      if (!lockedUpload || lockedUpload.expiresAt.getTime() <= Date.now()) {
        throw new InvalidUploadError("Le téléversement a expiré.");
      }
      const [created] = await tx
        .insert(productsTable)
        .values({
          title: parsed.data.title.trim(),
          slug: makeSlug(parsed.data.title),
          type: parsed.data.type,
          category: parsed.data.category.trim(),
          description: parsed.data.description.trim(),
          priceFcfa: parsed.data.priceFcfa,
          coverUrl: safeCoverUrl(parsed.data.coverUrl),
          fileObjectPath: lockedUpload.objectPath,
          fileName: lockedUpload.originalName,
          fileContentType: lockedUpload.contentType,
          fileSize: lockedUpload.size,
          isActive: true,
        })
        .returning();
      await tx
        .delete(productUploadsTable)
        .where(eq(productUploadsTable.uploadId, lockedUpload.uploadId));
      return created;
    });
    res.status(201).json(productResponse(product));
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Product creation failed");
    res.status(500).json({ error: "Le produit n’a pas pu être créé." });
  }
});

router.patch("/admin/products/:id", async (req, res) => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Informations de produit invalides." });
    return;
  }
  const [current] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "Produit introuvable." });
    return;
  }

  try {
    const upload = body.data.uploadId ? await readyUpload(body.data.uploadId) : null;
    const updateValues: Partial<typeof productsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.data.title !== undefined) {
      updateValues.title = body.data.title.trim();
      updateValues.slug = makeSlug(body.data.title);
    }
    if (body.data.type !== undefined) updateValues.type = body.data.type;
    if (body.data.category !== undefined) updateValues.category = body.data.category.trim();
    if (body.data.description !== undefined) updateValues.description = body.data.description.trim();
    if (body.data.priceFcfa !== undefined) updateValues.priceFcfa = body.data.priceFcfa;
    if (body.data.coverUrl !== undefined) {
      updateValues.coverUrl = safeCoverUrl(body.data.coverUrl);
    }

    const updated = await db.transaction(async (tx) => {
      if (upload) {
        const [lockedUpload] = await tx
          .select()
          .from(productUploadsTable)
          .where(eq(productUploadsTable.uploadId, upload.uploadId))
          .for("update")
          .limit(1);
        if (!lockedUpload || lockedUpload.expiresAt.getTime() <= Date.now()) {
          throw new InvalidUploadError("Le téléversement a expiré.");
        }
        updateValues.fileObjectPath = lockedUpload.objectPath;
        updateValues.fileName = lockedUpload.originalName;
        updateValues.fileContentType = lockedUpload.contentType;
        updateValues.fileSize = lockedUpload.size;
      }

      const [result] = await tx
        .update(productsTable)
        .set(updateValues)
        .where(eq(productsTable.id, params.data.id))
        .returning();
      if (upload) {
        await tx
          .delete(productUploadsTable)
          .where(eq(productUploadsTable.uploadId, upload.uploadId));
      }
      return result;
    });

    if (!updated) {
      res.status(404).json({ error: "Produit introuvable." });
      return;
    }
    res.json(productResponse(updated));
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error, productId: params.data.id }, "Product update failed");
    res.status(500).json({ error: "Le produit n’a pas pu être modifié." });
  }
});

router.delete("/admin/products/:id", async (req, res) => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de produit invalide." });
    return;
  }
  const [product] = await db
    .update(productsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(productsTable.id, params.data.id))
    .returning({ id: productsTable.id });
  if (!product) {
    res.status(404).json({ error: "Produit introuvable." });
    return;
  }
  res.status(204).end();
});

export default router;
