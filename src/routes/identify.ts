import { Router } from "express";
import { identifyContact } from "../controllers/identifyController";

const router = Router();

// Main identify endpoint
router.post("/identify", identifyContact);

export { router as identifyRouter }; 