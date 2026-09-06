import type { Event, PrismaClient } from "@prisma/client";

export interface EventAvailability {
  event: Event;
  registeredCount: number;
  isOpen: boolean;
  remainingCapacity: number;
}

export async function getEventAvailability(
  prisma: PrismaClient,
  eventId: string
): Promise<EventAvailability> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const registeredCount = await prisma.registration.count({ where: { eventId } });
  const remainingCapacity = Math.max(event.capacity - registeredCount, 0);

  const deadlinePassed = event.registrationDeadline
    ? event.registrationDeadline.getTime() < Date.now()
    : false;

  // Capacity is advisory/display-only per the three-type registration update — registration
  // volume is explicitly unlimited and must never be gated on remainingCapacity.
  const isOpen = event.registrationOpen && !event.maintenanceMode && !deadlinePassed;

  return { event, registeredCount, isOpen, remainingCapacity };
}
