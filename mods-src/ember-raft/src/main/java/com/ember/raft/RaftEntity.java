package com.ember.raft;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityDimensions;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.vehicle.BoatEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.ItemTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.chunk.ChunkStatus;

/**
 * Плот. Основан на ванильной лодке, поэтому у него настоящая физика:
 * он качается на волнах, плывёт от гребли (как лодка) и дрейфует по течению,
 * когда никто не гребёт. Дрейф направляется к ближайшей суше — так плот
 * «приплывает к островам».
 *
 * ПКМ досками улучшает плот: растёт уровень, скорость, появляются мачта и парус.
 * ПКМ с пустой рукой + присед (или якорь) останавливает дрейф.
 */
public class RaftEntity extends BoatEntity {
    private static final TrackedData<Integer> RAFT_LEVEL = DataTracker.registerData(RaftEntity.class, TrackedDataHandlerRegistry.INTEGER);
    private static final TrackedData<Boolean> ANCHORED = DataTracker.registerData(RaftEntity.class, TrackedDataHandlerRegistry.BOOLEAN);

    public static final int MAX_LEVEL = 4;
    /** Суммарное число досок, необходимое для достижения каждого уровня. */
    private static final int[] LEVEL_THRESHOLDS = {8, 20, 36, 56};
    private static final int DOCK_COOLDOWN_TICKS = 20 * 60 * 5;

    private float driftYaw;
    private int retargetTicks;
    private int dockScanTicks = 40;
    private long lastDockTime = -DOCK_COOLDOWN_TICKS;
    private int progress;

    public RaftEntity(EntityType<? extends RaftEntity> type, World world) {
        super(type, world);
        this.driftYaw = world.random.nextFloat() * 360.0F;
        this.setVariant(Type.OAK);
    }

    public RaftEntity(World world, double x, double y, double z) {
        this(EmberRaftEntities.RAFT, world);
        this.setPosition(x, y, z);
        this.prevX = x;
        this.prevY = y;
        this.prevZ = z;
    }

    @Override
    protected void initDataTracker(DataTracker.Builder builder) {
        super.initDataTracker(builder);
        builder.add(RAFT_LEVEL, 0).add(ANCHORED, false);
    }

    public int getRaftLevel() {
        return this.getDataTracker().get(RAFT_LEVEL);
    }

    public boolean isAnchored() {
        return this.getDataTracker().get(ANCHORED);
    }

    @Override
    public void tick() {
        super.tick();
        if (this.getWorld().isClient) {
            return;
        }
        if (!this.isAnchored() && this.isTouchingWater()) {
            boolean paddling = this.isPaddleMoving(0) || this.isPaddleMoving(1);
            if (paddling && this.getControllingPassenger() != null) {
                this.applyPaddleBoost();
            } else {
                // Никто не гребёт — плот медленно несёт течением, как в Raft.
                this.applyDrift();
            }
        }
        if (--this.dockScanTicks <= 0) {
            this.dockScanTicks = 40;
            this.scanForDock();
        }
    }

    /** Течение: плот медленно плывёт в сторону ближайшей суши. */
    private void applyDrift() {
        if (--this.retargetTicks <= 0) {
            this.retargetTicks = 60;
            this.retargetDrift();
        }
        double speed = 0.028 + 0.007 * this.getRaftLevel();
        float rad = this.driftYaw * (float) (Math.PI / 180.0);
        double targetX = -MathHelper.sin(rad) * speed;
        double targetZ = MathHelper.cos(rad) * speed;
        Vec3d velocity = this.getVelocity();
        this.setVelocity(velocity.x + (targetX - velocity.x) * 0.05, velocity.y, velocity.z + (targetZ - velocity.z) * 0.05);
        float wrapped = MathHelper.wrapDegrees(this.driftYaw - this.getYaw());
        this.setYaw(this.getYaw() + wrapped * 0.02F);
    }

    /** Бонус к скорости, пока игрок активно гребёт. */
    private void applyPaddleBoost() {
        double bonus = 0.008 + 0.003 * this.getRaftLevel();
        float rad = this.getYaw() * (float) (Math.PI / 180.0);
        this.addVelocity(-MathHelper.sin(rad) * bonus, 0.0, MathHelper.cos(rad) * bonus);
    }

    private void retargetDrift() {
        World world = this.getWorld();
        int sea = world.getSeaLevel();
        double bestDist = Double.MAX_VALUE;
        float bestYaw = this.driftYaw + (world.random.nextFloat() - 0.5F) * 24.0F;
        for (double radius = 24; radius <= 112; radius += 16) {
            for (int a = 0; a < 12; a++) {
                double angle = a * Math.PI / 6.0 + radius * 0.13;
                int x = MathHelper.floor(this.getX() + Math.cos(angle) * radius);
                int z = MathHelper.floor(this.getZ() + Math.sin(angle) * radius);
                if (this.isLandColumn(x, z, sea)) {
                    double dist = this.squaredDistanceTo(x, sea, z);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestYaw = this.yawToward(x, z);
                    }
                }
            }
        }
        this.driftYaw = bestYaw;
    }

    private float yawToward(double x, double z) {
        double dx = x - this.getX();
        double dz = z - this.getZ();
        return (float) (MathHelper.atan2(-dx, dz) * 180.0 / Math.PI);
    }

    private boolean isLandColumn(int x, int z, int sea) {
        Chunk chunk = this.getWorld().getChunk(x >> 4, z >> 4, ChunkStatus.FULL, false);
        if (chunk == null) {
            return false;
        }
        int y = chunk.getHeightmap(Heightmap.Type.WORLD_SURFACE).get(x & 15, z & 15);
        return y >= sea + 2;
    }

    /** Ищем берег по курсу дрейфа — если он близко, плот «прибывает на остров». */
    private void scanForDock() {
        World world = this.getWorld();
        if (world.getTime() - this.lastDockTime < DOCK_COOLDOWN_TICKS) {
            return;
        }
        int sea = world.getSeaLevel();
        float rad = this.driftYaw * (float) (Math.PI / 180.0);
        double dirX = -MathHelper.sin(rad);
        double dirZ = MathHelper.cos(rad);
        for (double dist = 4; dist <= 14; dist += 2) {
            int x = MathHelper.floor(this.getX() + dirX * dist);
            int z = MathHelper.floor(this.getZ() + dirZ * dist);
            Chunk chunk = world.getChunk(x >> 4, z >> 4, ChunkStatus.FULL, false);
            if (chunk == null) {
                continue;
            }
            int y = chunk.getHeightmap(Heightmap.Type.WORLD_SURFACE).get(x & 15, z & 15);
            if (y >= sea + 2) {
                this.lastDockTime = world.getTime();
                RaftWorldState.get(world).onRaftDocked((ServerWorld) world, this, new BlockPos(x, y, z));
                return;
            }
        }
    }

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        ItemStack stack = player.getStackInHand(hand);
        if (player.isSneaking() && stack.isEmpty()) {
            if (!this.getWorld().isClient) {
                this.toggleAnchor(player);
            }
            return ActionResult.SUCCESS;
        }
        if (stack.isIn(ItemTags.PLANKS)) {
            if (!this.getWorld().isClient) {
                this.addPlank(player, stack);
            }
            return ActionResult.SUCCESS;
        }
        if (stack.isOf(EmberRaftItems.ANCHOR)) {
            if (!this.getWorld().isClient) {
                this.toggleAnchor(player);
            }
            return ActionResult.SUCCESS;
        }
        return super.interact(player, hand);
    }

    private void addPlank(PlayerEntity player, ItemStack stack) {
        if (!player.getAbilities().creativeMode) {
            stack.decrement(1);
        }
        int level = this.getRaftLevel();
        if (level >= MAX_LEVEL) {
            player.sendMessage(Text.translatable("msg.ember_raft.max_level"), true);
            return;
        }
        int progress = this.getProgress() + 1;
        this.setProgress(progress);
        this.getWorld().playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ENTITY_ITEM_PICKUP, SoundCategory.BLOCKS, 0.5F, 0.7F);
        if (this.getWorld() instanceof ServerWorld serverWorld) {
            serverWorld.spawnParticles(ParticleTypes.CRIT, this.getX(), this.getY() + 0.4, this.getZ(), 8, 0.5, 0.2, 0.5, 0.02);
        }
        int needed = LEVEL_THRESHOLDS[level];
        if (progress >= needed) {
            this.getDataTracker().set(RAFT_LEVEL, level + 1);
            this.getWorld().playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ENTITY_PLAYER_LEVELUP, SoundCategory.BLOCKS, 0.8F, 0.8F);
            player.sendMessage(Text.translatable("msg.ember_raft.levelup", level + 1), true);
            if (level + 1 < MAX_LEVEL) {
                player.sendMessage(Text.translatable("msg.ember_raft.progress", progress, LEVEL_THRESHOLDS[level + 1]), true);
            }
        } else {
            player.sendMessage(Text.translatable("msg.ember_raft.progress", progress, needed), true);
        }
    }

    public void toggleAnchor(PlayerEntity player) {
        boolean anchored = !this.isAnchored();
        this.getDataTracker().set(ANCHORED, anchored);
        this.getWorld().playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ENTITY_FISHING_BOBBER_SPLASH, SoundCategory.BLOCKS, 0.9F, anchored ? 0.6F : 1.2F);
        if (player != null) {
            player.sendMessage(Text.translatable(anchored ? "msg.ember_raft.anchor.down" : "msg.ember_raft.anchor.up"), true);
        }
    }

    private int getProgress() {
        return this.progress;
    }

    private void setProgress(int value) {
        this.progress = value;
    }

    @Override
    protected void writeCustomDataToNbt(NbtCompound nbt) {
        super.writeCustomDataToNbt(nbt);
        nbt.putInt("RaftLevel", this.getRaftLevel());
        nbt.putInt("RaftProgress", this.progress);
        nbt.putBoolean("Anchored", this.isAnchored());
        nbt.putFloat("DriftYaw", this.driftYaw);
    }

    @Override
    protected void readCustomDataFromNbt(NbtCompound nbt) {
        super.readCustomDataFromNbt(nbt);
        this.getDataTracker().set(RAFT_LEVEL, MathHelper.clamp(nbt.getInt("RaftLevel"), 0, MAX_LEVEL));
        this.progress = nbt.getInt("RaftProgress");
        this.getDataTracker().set(ANCHORED, nbt.getBoolean("Anchored"));
        if (nbt.contains("DriftYaw")) {
            this.driftYaw = nbt.getFloat("DriftYaw");
        }
    }

    @Override
    protected Vec3d getPassengerAttachmentPos(Entity passenger, EntityDimensions dimensions, float scaleFactor) {
        double y = 0.32;
        float offset = 0.0F;
        if (this.getPassengerList().size() > 1) {
            offset = this.getPassengerList().indexOf(passenger) == 0 ? 0.25F : -0.3F;
        }
        return new Vec3d(0.0, y, offset).rotateY(-this.getYaw() * (float) (Math.PI / 180.0));
    }

    @Override
    public Item asItem() {
        return EmberRaftItems.RAFT_ITEM;
    }

    @Override
    public ItemStack getPickBlockStack() {
        return new ItemStack(this.asItem());
    }

    @Override
    protected Text getDefaultName() {
        return Text.translatable("entity.ember_raft.raft");
    }
}
