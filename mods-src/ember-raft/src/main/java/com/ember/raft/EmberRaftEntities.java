package com.ember.raft;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class EmberRaftEntities {
    /** Плот. Основан на лодке: настоящая физика на воде, гребля, покачивание. */
    public static final EntityType<RaftEntity> RAFT = Registry.register(
            Registries.ENTITY_TYPE,
            EmberRaftMod.id("raft"),
            EntityType.Builder.create(RaftEntity::new, SpawnGroup.MISC)
                    .dimensions(1.7F, 0.5F)
                    .maxTrackingRange(80)
                    .trackingTickInterval(3)
                    .build("raft"));

    /** Брошенный крюк с верёвкой. */
    public static final EntityType<HookEntity> HOOK = Registry.register(
            Registries.ENTITY_TYPE,
            EmberRaftMod.id("hook"),
            EntityType.Builder.create(HookEntity::new, SpawnGroup.MISC)
                    .dimensions(0.25F, 0.25F)
                    .maxTrackingRange(64)
                    .trackingTickInterval(10)
                    .build("hook"));

    /** Мусор в воде и припасы на островах: подбираются только на ПКМ. */
    public static final EntityType<LootItemEntity> LOOT_ITEM = Registry.register(
            Registries.ENTITY_TYPE,
            EmberRaftMod.id("loot_item"),
            EntityType.Builder.create(LootItemEntity::new, SpawnGroup.MISC)
                    .dimensions(0.25F, 0.25F)
                    .maxTrackingRange(64)
                    .trackingTickInterval(20)
                    .build("loot_item"));

    public static void register() {
        // Сущности уже зарегистрированы в статических полях выше.
    }

    private EmberRaftEntities() {
    }
}
