-- O nome do provedor na persona passa a ser opcional: vazio = usa o nome do tenant. Antes todo provedor
-- novo nascia "Vibe Telecom". Idempotente (vale para bancos em que a coluna já é opcional).
ALTER TABLE "tenant_policy_configs" ALTER COLUMN "companyName" DROP NOT NULL;
ALTER TABLE "tenant_policy_configs" ALTER COLUMN "companyName" DROP DEFAULT;

-- Tenant que ficou com o valor padrão antigo e não é a Vibe volta a usar o próprio nome.
UPDATE "tenant_policy_configs" SET "companyName" = NULL
WHERE "companyName" = 'Vibe Telecom' AND "tenantId" <> 'tnt_vibe';
