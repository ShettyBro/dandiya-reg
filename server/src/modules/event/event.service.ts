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

  const isOpen =
    event.registrationOpen &&
    !event.maintenanceMode &&
    !deadlinePassed &&
    remainingCapacity > 0;

  return { event, registeredCount, isOpen, remainingCapacity };
}
