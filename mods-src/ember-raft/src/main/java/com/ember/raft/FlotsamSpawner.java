package com.ember.raft;

import java.util.List;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.registry.tag.BiomeTags;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.biome.Biome;

/**
 * Периодически появляется проплывающий мимо мусор: дрейфующая древесина,
 * доски, верёвки и еда. Спавнится рядом с игроком в океане, реке или у берега,
 * а также если игрок плывёт на плоту.
 */
public final class FlotsamSpawner {
    private static final int MAX_NEARBY = 14;

    public static void tick(ServerWorld world) {
        if (world.getTime() % 16L != 0L) {
            return;
        }
        for (PlayerEntity player : world.getPlayers()) {
            // В среднем один обломок каждые ~12 секунд на игрока.
            if (world.random.nextInt(8) != 0) {
                continue;
            }
            trySpawn(world, player);
        }
    }

    private static void trySpawn(ServerWorld world, PlayerEntity player) {
        if (!shouldSpawnAround(world, player)) {
            return;
        }
        List<LootItemEntity> nearby = world.getEntitiesByClass(LootItemEntity.class, player.getBoundingBox().expand(48.0), loot -> true);
        if (nearby.size() >= MAX_NEARBY) {
            return;
        }
        double angle = world.random.nextDouble() * Math.PI * 2.0;
        double distance = 14.0 + world.random.nextDouble() * 26.0;
        int x = MathHelper.floor(player.getX() + Math.cos(angle) * distance);
        int z = MathHelper.floor(player.getZ() + Math.sin(angle) * distance);
        int sea = world.getSeaLevel();
        for (int y = sea + 4; y > sea - 12; y--) {
            BlockPos pos = new BlockPos(x, y, z);
            BlockState state = world.getBlockState(pos);
            if (!state.isAir()) {
                break; // упёрлись в сушу или лёд — здесь не спавним
            }
            if (world.getFluidState(pos.down()).isIn(FluidTags.WATER)) {
                LootItemEntity.spawn(world, x + 0.5, y - 0.6, z + 0.5, rollFlotsam(world.random));
                return;
            }
        }
    }

    private static boolean shouldSpawnAround(ServerWorld world, PlayerEntity player) {
        if (player.getVehicle() instanceof RaftEntity) {
            return true;
        }
        List<RaftEntity> rafts = world.getEntitiesByClass(RaftEntity.class, player.getBoundingBox().expand(40.0), raft -> true);
        if (!rafts.isEmpty()) {
            return true;
        }
        RegistryEntry<Biome> biome = world.getBiome(player.getBlockPos());
        return biome.isIn(BiomeTags.IS_OCEAN) || biome.isIn(BiomeTags.IS_RIVER) || biome.isIn(BiomeTags.IS_BEACH);
    }

    private static ItemStack rollFlotsam(Random random) {
        int roll = random.nextInt(100);
        if (roll < 55) {
            return new ItemStack(EmberRaftItems.DRIFTWOOD, 1 + random.nextInt(2));
        }
        if (roll < 75) {
            return new ItemStack(Items.OAK_PLANKS, 1 + random.nextInt(3));
        }
        if (roll < 90) {
            return new ItemStack(Items.STRING, 1 + random.nextInt(2));
        }
        return new ItemStack(Items.BREAD, 1 + random.nextInt(2));
    }

    private FlotsamSpawner() {
    }
}
