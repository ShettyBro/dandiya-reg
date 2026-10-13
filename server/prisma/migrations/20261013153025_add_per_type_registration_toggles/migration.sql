-- AlterTable
ALTER TABLE "events" ADD COLUMN     "acharyaAlumniRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acharyaFacultyRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acharyaStudentRegistrationOpen" BOOLEAN NOT NULL DEFAULT true;
