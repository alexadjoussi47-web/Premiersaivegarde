import type { RequestHandler } from "express";

declare module "express-session" {
  interface SessionData {
    adminAuthenticated?: boolean;
  }
}

export const requireAdminSession: RequestHandler = (req, res, next) => {
  if (!req.session.adminAuthenticated) {
    res.status(401).json({ error: "Session administrateur requise." });
    return;
  }
  next();
};

/** SameSite cookies plus this origin check protect admin mutations from CSRF. */
export const requireSameOriginMutation: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  const host = req.get("host");
  if (!origin || !host) {
    res.status(403).json({ error: "Origine de requête invalide." });
    return;
  }

  try {
    const received = new URL(origin);
    const expectedOrigin = `${req.protocol}://${host}`;
    if (received.origin !== expectedOrigin) {
      res.status(403).json({ error: "Origine de requête invalide." });
      return;
    }
  } catch {
    res.status(403).json({ error: "Origine de requête invalide." });
    return;
  }

  next();
};
