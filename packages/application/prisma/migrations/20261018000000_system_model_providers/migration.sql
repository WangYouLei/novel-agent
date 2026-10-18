-- 模型配置来源改造：openai-model 插件内化为系统固定模型接入能力（model-service 厂商预设）
-- ModelConfig.installedPluginId（FK InstalledPlugin）→ providerId（系统厂商预设/第三方模型插件 id）
-- 存量配置均来自 openai-model 插件，统一回填 providerId='openai'

PRAGMA foreign_keys=OFF;

-- RedefineTables
CREATE TABLE "new_ModelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKeyEncrypted" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "extraParams" JSONB,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_ModelConfig" ("id", "userId", "providerId", "name", "baseUrl", "apiKeyEncrypted", "modelName", "isDefault", "extraParams", "deleted", "createdAt", "updatedAt")
SELECT "id", "userId", 'openai', "name", "baseUrl", "apiKeyEncrypted", "modelName", "isDefault", "extraParams", "deleted", "createdAt", "updatedAt" FROM "ModelConfig";

DROP TABLE "ModelConfig";
ALTER TABLE "new_ModelConfig" RENAME TO "ModelConfig";

-- CreateIndex
CREATE INDEX "ModelConfig_userId_idx" ON "ModelConfig"("userId");

-- CreateIndex
CREATE INDEX "ModelConfig_userId_isDefault_idx" ON "ModelConfig"("userId", "isDefault");

PRAGMA foreign_keys=ON;
