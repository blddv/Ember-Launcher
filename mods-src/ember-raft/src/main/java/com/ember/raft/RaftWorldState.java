package com.ember.raft;

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import net.minecraft.block.Blocks;
import net.minecraft.datafixer.DataFixTypes;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.registry.RegistryWrapper;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import net.minecraft.world.PersistentState;
import net.minecraft.world.World;

/**
 * Данные мира для режима Raft: кто уже начал игру на плоту
 * и какие острова уже были разграблены (чтобы припасы не появлялись повторно).
 */
public class RaftWorldState extends PersistentState {
    private static final int MAX_LOOTED_ISLANDS = 4096;

    public final Set<UUID> startedPlayers = new HashSet<>();
    public final LinkedHashSet<Long> lootedIslands = new LinkedHashSet<>();

    private static final PersistentState.Type<RaftWorldState> TYPE = new PersistentState.Type<>(
            RaftWorldState::new, RaftWorldState::fromNbt, DataFixTypes.SAVED_DATA);

    public static RaftWorldState get(World world) {
        return ((ServerWorld) world).getPersistentStateManager().getOrCreate(TYPE, "ember_raft");
    }

    /**
     * Плот прибило к берегу. Если остров ещё не разграблен — раскладываем
     * припасы на берегу и сообщаем игрокам поблизости.
     */
    public void onRaftDocked(ServerWorld world, RaftEntity raft, BlockPos shore) {
        long key = ((long) (shore.getX() >> 4) << 32) | ((shore.getZ() >> 4) & 0xFFFFFFFFL);
        boolean firstTime = this.lootedIslands.add(key);
        if (this.lootedIslands.size() > MAX_LOOTED_ISLANDS) {
            this.lootedIslands.remove(this.lootedIslands.iterator().next());
        }
        this.markDirty();

        for (PlayerEntity player : world.getPlayers()) {
            if (player.squaredDistanceTo(shore.getX(), shore.getY(), shore.getZ()) < 60.0 * 60.0) {
                if (firstTime) {
                    player.sendMessage(Text.translatable("msg.ember_raft.island"), false);
                    player.sendMessage(Text.translatable("msg.ember_raft.island_supplies"), false);
                } else {
                    player.sendMessage(Text.translatable("msg.ember_raft.island_empty"), false);
                }
                player.playSound(SoundEvents.ENTITY_EXPERIENCE_ORB_PICKUP, SoundCategory.PLAYERS, 0.9F, 1.0F);
            }
        }

        if (!firstTime) {
            return;
        }
        int supplies = 4 + world.random.nextInt(3);
        int sea = world.getSeaLevel();
        for (int i = 0; i < supplies; i++) {
            int x = shore.getX() + world.random.nextInt(11) - 5;
            int z = shore.getZ() + world.random.nextInt(11) - 5;
            BlockPos top = world.getTopPosition(Heightmap.Type.WORLD_SURFACE, new BlockPos(x, 0, z));
            if (top.getY() <= sea) {
                continue; // вода — пропускаем
            }
            if (!world.getBlockState(top.down()).isOf(Blocks.AIR)) {
                LootItemEntity supply = LootItemEntity.spawn(world, x + 0.5, top.getY() + 0.3, z + 0.5, rollSupply(world.random));
                supply.setNeverDespawn();
            }
        }
    }

    private static ItemStack rollSupply(Random random) {
        int roll = random.nextInt(100);
        if (roll < 35) {
            return new ItemStack(Items.OAK_PLANKS, 4 + random.nextInt(7));
        }
        if (roll < 60) {
            return new ItemStack(Items.BREAD, 2 + random.nextInt(3));
        }
        if (roll < 80) {
            return new ItemStack(Items.STRING, 2 + random.nextInt(3));
        }
        if (roll < 92) {
            return new ItemStack(EmberRaftItems.DRIFTWOOD, 2 + random.nextInt(3));
        }
        return new ItemStack(Items.IRON_INGOT, 1 + random.nextInt(2));
    }

    public static RaftWorldState fromNbt(NbtCompound nbt, RegistryWrapper.WrapperLookup registryLookup) {
        RaftWorldState state = new RaftWorldState();
        long[] players = nbt.getLongArray("Started");
        for (int i = 0; i + 1 < players.length; i += 2) {
            state.startedPlayers.add(new UUID(players[i], players[i + 1]));
        }
        state.lootedIslands.addAll(Arrays.stream(nbt.getLongArray("Looted")).boxed().collect(Collectors.toCollection(LinkedHashSet::new)));
        return state;
    }

    @Override
    public NbtCompound writeNbt(NbtCompound nbt, RegistryWrapper.WrapperLookup registryLookup) {
        long[] players = new long[this.startedPlayers.size() * 2];
        int i = 0;
        for (UUID uuid : this.startedPlayers) {
            players[i++] = uuid.getMostSignificantBits();
            players[i++] = uuid.getLeastSignificantBits();
        }
        nbt.putLongArray("Started", players);
        nbt.putLongArray("Looted", this.lootedIslands.stream().mapToLong(Long::longValue).toArray());
        return nbt;
    }
}
