import type { Event, PrismaClient } from "@prisma/client";

export interface EventAvailability {
  event: Event;
  registeredCount: number;
  isOpen: boolean;
  nonAcharyanOpen: boolean;
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
  // Deliberately NOT ANDed with isOpen: the main registrationOpen toggle only controls the public
  // landing page's own closed/open display (which is now hardcoded closed there regardless), but
  // the hidden /reg link keeps accepting registrations -- including Non-Acharyan ones -- as long
  // as its own toggle is on, the same way registration.service.ts's creation check already treats
  // them independently. Only maintenanceMode (genuine system-down protection) still applies.
  const nonAcharyanOpen = !event.maintenanceMode && event.nonAcharyanRegistrationOpen;

  return { event, registeredCount, isOpen, nonAcharyanOpen, remainingCapacity };
}
