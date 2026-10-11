package com.ember.raft;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.registry.FuelRegistry;
import net.minecraft.item.ItemGroups;
import net.minecraft.util.Identifier;

/**
 * EMBER Raft — режим выживания в духе игры Raft.
 *
 * Игрок впервые появляется в мире на маленьком плоту посреди океана.
 * Вокруг плывёт мусор (древесина, доски, верёвки, еда) — его можно
 * вытащить крюком с верёвкой (ПКМ) или подобрать руками. Доски идут
 * на улучшение плота (ПКМ доской по плоту): плот растёт, плывёт быстрее,
 * появляются мачта и парус. Тение периодически прибивает плот к островам,
 * где на берегу лежат припасы — они подбираются только на ПКМ.
 */
public class EmberRaftMod implements ModInitializer {
    public static final String MOD_ID = "ember_raft";

    public static Identifier id(String path) {
        return Identifier.of(MOD_ID, path);
    }

    @Override
    public void onInitialize() {
        EmberRaftItems.register();
        EmberRaftEntities.register();

        // Первое появление игрока на плоту и постепенный поиск океана.
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> RaftSpawnHandler.onPlayerJoin(handler.player));

        ServerTickEvents.END_WORLD_TICK.register(world -> {
            RaftSpawnHandler.tick(world);
            FlotsamSpawner.tick(world);
        });

        // Дрейфующая древесина горит как обычный уголь по времени.
        FuelRegistry.INSTANCE.add(EmberRaftItems.DRIFTWOOD, 200);

        ItemGroupEvents.modifyEntriesEvent(ItemGroups.TOOLS).register(entries -> {
            entries.add(EmberRaftItems.HOOK);
            entries.add(EmberRaftItems.ANCHOR);
            entries.add(EmberRaftItems.RAFT_ITEM);
            entries.add(EmberRaftItems.DRIFTWOOD);
        });
    }
}
