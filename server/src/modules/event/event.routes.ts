import { Router } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { sendError } from "../../app/middleware/errors.js";
import { getEventAvailability } from "./event.service.js";
import type { Env } from "../../app/config/env.js";

export function createEventRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get("/event/config", async (req, res) => {
    try {
      const availability = await getEventAvailability(prisma, env.EVENT_ID);

      res.status(200).json({
        eventId: availability.event.id,
        name: availability.event.name,
        eventDate: availability.event.eventDate,
        venue: availability.event.venue,
        registrationOpen: availability.isOpen,
        capacity: availability.event.capacity,
        remainingCapacity: availability.remainingCapacity,
        priceInPaise: availability.event.priceInPaise,
        erpPaymentUrl: availability.event.erpPaymentUrl,
        paymentInstructions: availability.event.paymentInstructions
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        sendError(req, res, 404, "EVENT_NOT_FOUND", "Configured event was not found");
        return;
      }
      throw error;
    }
  });

  return router;
}
