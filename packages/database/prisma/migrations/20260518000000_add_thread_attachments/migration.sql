-- CreateTable
CREATE TABLE "thread_attachments" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "uploader_id" TEXT,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "thread_attachments_thread_id_created_at_idx" ON "thread_attachments"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "thread_attachments" ADD CONSTRAINT "thread_attachments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
