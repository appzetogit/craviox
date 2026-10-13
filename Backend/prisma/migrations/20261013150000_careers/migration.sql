-- Careers: admin-managed job openings and the applications sent to them.
CREATE TABLE "career_jobs" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "employmentType" TEXT NOT NULL DEFAULT 'full_time',
    "experience" TEXT NOT NULL DEFAULT '',
    "salary" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "career_applications" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "jobId" VARCHAR(24),
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "linkUrl" TEXT NOT NULL DEFAULT '',
    "coverNote" TEXT NOT NULL DEFAULT '',
    "resumePath" TEXT NOT NULL DEFAULT '',
    "resumeName" TEXT NOT NULL DEFAULT '',
    "resumeMime" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "career_jobs_slug_key" ON "career_jobs"("slug");
CREATE INDEX "career_jobs_isActive_sortOrder_idx" ON "career_jobs"("isActive", "sortOrder");
CREATE INDEX "career_applications_status_createdAt_idx" ON "career_applications"("status", "createdAt");
CREATE INDEX "career_applications_jobId_idx" ON "career_applications"("jobId");

ALTER TABLE "career_applications" ADD CONSTRAINT "career_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "career_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
