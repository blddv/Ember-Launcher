package com.ember.raft;

import java.util.List;
import java.util.UUID;
import javax.annotation.Nullable;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.stat.Stats;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * Брошенный крюк с верёвкой. Летит по баллистической дуге, в воде тонет.
 * Зацепив мусор (древесину, доски, припасы), мгновенно «вытягивает» его владельцу.
 */
public class HookEntity extends Entity {
    private static final int MAX_LIFE_TICKS = 90;

    @Nullable
    private UUID ownerUuid;
    private int life = MAX_LIFE_TICKS;

    public HookEntity(EntityType<? extends HookEntity> type, World world) {
        super(type, world);
    }

    public static void throwHook(World world, PlayerEntity player) {
        HookEntity hook = new HookEntity(EmberRaftEntities.HOOK, world);
        Vec3d look = player.getRotationVector();
        Vec3d eye = player.getEyePos();
        hook.setPosition(eye.x + look.x * 0.5, eye.y + look.y * 0.5 - 0.1, eye.z + look.z * 0.5);
        hook.setVelocity(look.multiply(1.3).add(player.getVelocity()));
        hook.setYaw(player.getYaw());
        hook.setPitch(player.getPitch());
        hook.ownerUuid = player.getUuid();
        world.spawnEntity(hook);
        world.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.ENTITY_FISHING_BOBBER_THROW, SoundCategory.PLAYERS, 0.5F, 0.4F / (world.random.nextFloat() * 0.4F + 0.8F));
    }

    @Nullable
    public UUID getOwnerUuid() {
        return this.ownerUuid;
    }

    @Nullable
    public PlayerEntity getOwnerPlayer() {
        return this.ownerUuid == null ? null : this.getWorld().getPlayerByUuid(this.ownerUuid);
    }

    @Override
    public void tick() {
        super.tick();
        if (this.getWorld().isClient) {
            return;
        }
        if (this.ownerUuid == null) {
            this.discard();
            return;
        }

        Vec3d velocity = this.getVelocity();
        if (this.isTouchingWater()) {
            // В воде крюк замедляется и медленно тонет.
            this.setVelocity(velocity.multiply(0.6).add(0.0, -0.02, 0.0));
            this.life -= 3;
        } else {
            this.setVelocity(velocity.x * 0.99, velocity.y - 0.04, velocity.z * 0.99);
        }
        this.move(MovementType.SELF, this.getVelocity());

        // Столкновение с твёрдым блоком — крюк возвращается.
        BlockPos pos = this.getBlockPos();
        BlockState state = this.getWorld().getBlockState(pos);
        if (!state.isAir() && state.getFluidState().isEmpty() && !state.getCollisionShape(this.getWorld(), pos).isEmpty()) {
            this.discard();
            return;
        }

        // Цепляем ближайший мусор.
        List<LootItemEntity> nearby = this.getWorld().getEntitiesByClass(LootItemEntity.class, this.getBoundingBox().expand(1.6), loot -> !loot.isRemoved());
        if (!nearby.isEmpty()) {
            this.grab(nearby.get(0));
            return;
        }

        if (--this.life <= 0) {
            this.discard();
        }
    }

    private void grab(LootItemEntity loot) {
        PlayerEntity owner = this.getOwnerPlayer();
        if (owner != null) {
            ItemStack stack = loot.getStack().copy();
            int count = stack.getCount();
            if (owner.getInventory().insertStack(stack)) {
                owner.sendPickup(loot, count);
                owner.increaseStat(Stats.PICKED_UP.getOrCreateStat(stack.getItem()), count);
                owner.triggerItemPickedUpByEntityCriteria(loot);
            } else if (!stack.isEmpty()) {
                owner.dropItem(stack, false);
            }
            this.getWorld().playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ENTITY_ITEM_PICKUP, SoundCategory.PLAYERS, 0.6F, 1.3F);
        }
        loot.discard();
        this.discard();
    }

    @Override
    protected void initDataTracker(DataTracker.Builder builder) {
    }

    @Override
    protected void readCustomDataFromNbt(NbtCompound nbt) {
        if (nbt.containsUuid("Owner")) {
            this.ownerUuid = nbt.getUuid("Owner");
        }
    }

    @Override
    protected void writeCustomDataToNbt(NbtCompound nbt) {
        if (this.ownerUuid != null) {
            nbt.putUuid("Owner", this.ownerUuid);
        }
    }
}
