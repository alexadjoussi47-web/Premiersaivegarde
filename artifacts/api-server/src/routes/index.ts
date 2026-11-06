import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import paymentsRouter from "./payments";
import storefrontRouter from "./storefront";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);
router.use(paymentsRouter);
router.use(adminRouter);

export default router;
