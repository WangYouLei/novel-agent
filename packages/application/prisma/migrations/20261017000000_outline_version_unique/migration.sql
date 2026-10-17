-- 清理历史并发写入产生的重复 (novelId, version)：每组保留 id 最大（最新）一条，
-- 否则下方唯一索引会因重复数据创建失败
DELETE FROM "Outline" WHERE "id" NOT IN (
    SELECT MAX("id") FROM "Outline" GROUP BY "novelId", "version"
);

-- 清理同一小说存在多条 isActive 的历史脏数据：每本小说只保留 updatedAt 最新的一条 active
DELETE FROM "Outline" WHERE "isActive" = 1 AND "id" NOT IN (
    SELECT "id" FROM (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "novelId" ORDER BY "updatedAt" DESC) AS rn
        FROM "Outline" WHERE "isActive" = 1
    ) AS keep WHERE rn = 1
);

-- CreateIndex
CREATE UNIQUE INDEX "Outline_novelId_version_key" ON "Outline"("novelId", "version");
