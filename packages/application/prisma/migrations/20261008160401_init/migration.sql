-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "vipExpiresAt" DATETIME,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "dailyCredits" INTEGER NOT NULL DEFAULT 0,
    "lastDailyClaim" DATETIME,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CreditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "modelCallId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "genre" TEXT,
    "stylePackId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Novel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Novel_stylePackId_fkey" FOREIGN KEY ("stylePackId") REFERENCES "StylePack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stylePackId" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Chapter_stylePackId_fkey" FOREIGN KEY ("stylePackId") REFERENCES "StylePack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StylePack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "builtinKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "sourceType" TEXT NOT NULL,
    "generatedBy" TEXT,
    "sourcePluginId" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "modifiable" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL,
    "forkedFromId" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StylePack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StylePack_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "StylePack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL,
    "gender" TEXT,
    "age" TEXT,
    "description" TEXT,
    "profile" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "fromCharacterId" TEXT NOT NULL,
    "toCharacterId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterRelation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelation_fromCharacterId_fkey" FOREIGN KEY ("fromCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelation_toCharacterId_fkey" FOREIGN KEY ("toCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "details" JSONB,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldSetting_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorldSetting_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorldSetting" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Outline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "structure" JSONB NOT NULL,
    "generatedBy" TEXT,
    "generationParams" JSONB,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Outline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstalledPlugin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "installPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INSTALLED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "dependencies" JSONB,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstalledPlugin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "installedPluginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKeyEncrypted" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "extraParams" JSONB,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ModelConfig_installedPluginId_fkey" FOREIGN KEY ("installedPluginId") REFERENCES "InstalledPlugin" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "novelId" TEXT,
    "sessionType" TEXT NOT NULL,
    "featurePluginId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "WritingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WritingSession_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "inputExcerpt" TEXT,
    "outputExcerpt" TEXT,
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelCall_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WritingSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ModelCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CreditLog_userId_createdAt_idx" ON "CreditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Novel_userId_idx" ON "Novel"("userId");

-- CreateIndex
CREATE INDEX "Chapter_novelId_sortOrder_idx" ON "Chapter"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "StylePack_userId_idx" ON "StylePack"("userId");

-- CreateIndex
CREATE INDEX "StylePack_sourceType_idx" ON "StylePack"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "StylePack_builtinKey_key" ON "StylePack"("builtinKey");

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

-- CreateIndex
CREATE INDEX "CharacterRelation_novelId_idx" ON "CharacterRelation"("novelId");

-- CreateIndex
CREATE INDEX "CharacterRelation_toCharacterId_idx" ON "CharacterRelation"("toCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRelation_fromCharacterId_toCharacterId_relationType_key" ON "CharacterRelation"("fromCharacterId", "toCharacterId", "relationType");

-- CreateIndex
CREATE INDEX "WorldSetting_novelId_category_idx" ON "WorldSetting"("novelId", "category");

-- CreateIndex
CREATE INDEX "Outline_novelId_isActive_idx" ON "Outline"("novelId", "isActive");

-- CreateIndex
CREATE INDEX "InstalledPlugin_userId_status_idx" ON "InstalledPlugin"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledPlugin_userId_pluginId_key" ON "InstalledPlugin"("userId", "pluginId");

-- CreateIndex
CREATE INDEX "ModelConfig_userId_idx" ON "ModelConfig"("userId");

-- CreateIndex
CREATE INDEX "ModelConfig_userId_isDefault_idx" ON "ModelConfig"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "WritingSession_userId_createdAt_idx" ON "WritingSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelCall_sessionId_idx" ON "ModelCall"("sessionId");

-- CreateIndex
CREATE INDEX "ModelCall_userId_createdAt_idx" ON "ModelCall"("userId", "createdAt");
