import { Router } from "express";
import { IdentifyController } from "../controllers/identifyController";
import { requestLogger } from "../middleware/requestLogger";
import { rateLimiter } from "../middleware/rateLimiter";

const router = Router();
const identifyController = new IdentifyController();

// Apply middleware
router.use(requestLogger);
router.use(rateLimiter);

// Main identify endpoint
router.post("/identify", identifyController.identify.bind(identifyController));

// Health check endpoint
router.get(
  "/identify/health",
  identifyController.healthCheck.bind(identifyController)
);

export default router;
