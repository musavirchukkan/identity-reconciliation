-- CreateEnum
CREATE TYPE "LinkPrecedence" AS ENUM ('primary', 'secondary');

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "phone_number" TEXT,
    "email" TEXT,
    "linked_id" INTEGER,
    "link_precedence" "LinkPrecedence" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_phone_number_idx" ON "contacts"("phone_number");

-- CreateIndex
CREATE INDEX "contacts_linked_id_idx" ON "contacts"("linked_id");

-- CreateIndex
CREATE INDEX "contacts_link_precedence_idx" ON "contacts"("link_precedence");

-- CreateIndex
CREATE INDEX "contacts_created_at_idx" ON "contacts"("created_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_id_fkey" FOREIGN KEY ("linked_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;