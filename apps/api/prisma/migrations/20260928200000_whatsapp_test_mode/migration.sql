-- Modo teste do WhatsApp: a IA só responde aos números da lista.
ALTER TABLE "whatsapp_connections" ADD COLUMN "testMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_connections" ADD COLUMN "allowedNumbers" TEXT NOT NULL DEFAULT '';
