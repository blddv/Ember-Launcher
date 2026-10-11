package com.ember.raft;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.World;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.chunk.ChunkStatus;

/**
 * Первое появление игрока в мире: его высаживает на плот посреди океана.
 * Океан ищется спиралью от спавна мира; чтобы не вешать сервер, генерация
 * чанков размазана по тикам. Если океана не нашлось — плот появляется
 * у первой найденной воды или прямо у игрока.
 */
public final class RaftSpawnHandler {
    private static final int DIRECTIONS_PER_RING = 16;
    private static final int MAX_RINGS = 16;
    private static final int MAX_GENERATED_CHUNKS = 160;
    private static final int MAX_GENERATED_PER_TICK = 2;

    private static final List<SpawnTask> tasks = new ArrayList<>();

    public static void onPlayerJoin(ServerPlayerEntity player) {
        World world = player.getWorld();
        if (!World.OVERWORLD.equals(world.getRegistryKey())) {
            return;
        }
        RaftWorldState state = RaftWorldState.get(world);
        if (state.startedPlayers.contains(player.getUuid())) {
            return;
        }
        for (SpawnTask task : tasks) {
            if (task.playerUuid.equals(player.getUuid())) {
                return;
            }
        }
        tasks.add(new SpawnTask(player.getUuid()));
    }

    public static void tick(ServerWorld world) {
        if (tasks.isEmpty() || !World.OVERWORLD.equals(world.getRegistryKey())) {
            return;
        }
        Iterator<SpawnTask> it = tasks.iterator();
        while (it.hasNext()) {
            SpawnTask task = it.next();
            ServerPlayerEntity player = world.getServer().getPlayerManager().getPlayer(task.playerUuid);
            if (player == null) {
                it.remove(); // вышел с сервера — попробуем при следующем входе
                continue;
            }
            if (task.step(world, player)) {
                it.remove();
            }
        }
    }

    private static final class SpawnTask {
        final UUID playerUuid;
        private int ring;
        private int dir;
        private int generated;
        private BlockPos anyWater;

        SpawnTask(UUID playerUuid) {
            this.playerUuid = playerUuid;
        }

        /** Возвращает true, когда задача завершена. */
        boolean step(ServerWorld world, ServerPlayerEntity player) {
            int generatedThisTick = 0;
            int checks = 0;
            while (checks < 6) {
                if (this.ring >= MAX_RINGS || this.generated >= MAX_GENERATED_CHUNKS) {
                    this.finish(world, player);
                    return true;
                }
                double radius = 64.0 + this.ring * 48.0;
                double angle = this.dir * (Math.PI * 2.0 / DIRECTIONS_PER_RING) + this.ring * 0.35;
                this.dir++;
                if (this.dir >= DIRECTIONS_PER_RING) {
                    this.dir = 0;
                    this.ring++;
                }
                checks++;

                int x = MathHelper.floor(world.getLevelProperties().getSpawnX() + Math.cos(angle) * radius);
                int z = MathHelper.floor(world.getLevelProperties().getSpawnZ() + Math.sin(angle) * radius);
                Chunk chunk = world.getChunk(x >> 4, z >> 4, ChunkStatus.FULL, false);
                if (chunk == null) {
                    if (generatedThisTick >= MAX_GENERATED_PER_TICK) {
                        return false; // продолжим в следующем тике
                    }
                    chunk = world.getChunk(x >> 4, z >> 4, ChunkStatus.FULL, true);
                    this.generated++;
                    generatedThisTick++;
                    if (chunk == null) {
                        continue;
                    }
                }

                int sea = world.getSeaLevel();
                BlockPos.Mutable probe = new BlockPos.Mutable(x, sea, z);
                BlockState atSea = chunk.getBlockState(probe);
                if (atSea.isOf(Blocks.WATER)) {
                    boolean deep = chunk.getBlockState(probe.set(x, sea - 2, z)).isOf(Blocks.WATER)
                            && chunk.getBlockState(probe.set(x, sea + 1, z)).isAir();
                    if (deep) {
                        this.finishAt(world, player, x, sea + 1.0, z, false);
                        return true;
                    }
                    if (this.anyWater == null) {
                        this.anyWater = new BlockPos(x, sea, z);
                    }
                }
            }
            return false;
        }

        private void finish(ServerWorld world, ServerPlayerEntity player) {
            if (this.anyWater != null) {
                this.finishAt(world, player, this.anyWater.getX(), this.anyWater.getY() + 1.0, this.anyWater.getZ(), true);
                return;
            }
            // Совсем воды не нашлось — плот появится рядом с игроком, где стоит.
            this.finishAt(world, player, MathHelper.floor(player.getX()), player.getY() + 0.5, MathHelper.floor(player.getZ()), true);
        }

        private void finishAt(ServerWorld world, ServerPlayerEntity player, double x, double y, double z, boolean fallback) {
            RaftWorldState state = RaftWorldState.get(world);
            if (state.startedPlayers.contains(this.playerUuid)) {
                return;
            }

            RaftEntity raft = new RaftEntity(world, x + 0.5, y, z + 0.5);
            raft.setYaw(world.random.nextFloat() * 360.0F);
            world.spawnEntity(raft);

            player.teleport(world, x + 0.5, y + 0.4, z + 0.5, raft.getYaw(), 0.0F);
            player.setSpawnPoint(World.OVERWORLD, BlockPos.ofFloored(x + 0.5, y + 0.4, z + 0.5), raft.getYaw(), true, true);
            if (!player.giveItemStack(new ItemStack(EmberRaftItems.HOOK))) {
                player.dropItem(new ItemStack(EmberRaftItems.HOOK), false);
            }

            state.startedPlayers.add(this.playerUuid);
            state.markDirty();

            player.sendMessage(Text.translatable("msg.ember_raft.welcome"), false);
            player.sendMessage(Text.translatable("msg.ember_raft.welcome2"), false);
            if (fallback) {
                player.sendMessage(Text.translatable("msg.ember_raft.no_ocean"), false);
            }
            world.playSound(null, x, y, z, SoundEvents.ENTITY_BOAT_PADDLE_WATER, SoundCategory.NEUTRAL, 1.0F, 0.8F);
        }
    }

    private RaftSpawnHandler() {
    }
}
