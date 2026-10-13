import type { Event, PrismaClient } from "@prisma/client";

export interface EventAvailability {
  event: Event;
  registeredCount: number;
  isOpen: boolean;
  nonAcharyanOpen: boolean;
  acharyaStudentOpen: boolean;
  acharyaFacultyOpen: boolean;
  acharyaAlumniOpen: boolean;
}

export async function getEventAvailability(
  prisma: PrismaClient,
  eventId: string
): Promise<EventAvailability> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const registeredCount = await prisma.registration.count({ where: { eventId } });

  const deadlinePassed = event.registrationDeadline
    ? event.registrationDeadline.getTime() < Date.now()
    : false;

  const isOpen = event.registrationOpen && !event.maintenanceMode && !deadlinePassed;
  // Deliberately NOT ANDed with isOpen: the main registrationOpen toggle only controls the public
  // landing page's own closed/open display (which is now hardcoded closed there regardless), but
  // the hidden /reg link keeps accepting registrations -- each of the four categories independently
  // -- as long as its own toggle is on, the same way registration.service.ts's creation check
  // already treats them independently. Only maintenanceMode (genuine system-down protection)
  // still applies to all four.
  const nonAcharyanOpen = !event.maintenanceMode && event.nonAcharyanRegistrationOpen;
  const acharyaStudentOpen = !event.maintenanceMode && event.acharyaStudentRegistrationOpen;
  const acharyaFacultyOpen = !event.maintenanceMode && event.acharyaFacultyRegistrationOpen;
  const acharyaAlumniOpen = !event.maintenanceMode && event.acharyaAlumniRegistrationOpen;

  return { event, registeredCount, isOpen, nonAcharyanOpen, acharyaStudentOpen, acharyaFacultyOpen, acharyaAlumniOpen };
}
