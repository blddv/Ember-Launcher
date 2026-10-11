package com.ember.raft;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.stat.Stats;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.world.World;

/**
 * Плавающий мусор и припасы на островах. В отличие от обычных предметов:
 * не подбирается автоматически при ходьбе — только ПКМ по предмету.
 * Не ломается от ударов и огня.
 */
public class LootItemEntity extends ItemEntity {
    public LootItemEntity(EntityType<? extends LootItemEntity> type, World world) {
        super(type, world);
        // Бесконечная задержка подбора: не подбирается при ходьбе, не сливается
        // с обычными предметами и не засасывается воронками — только ПКМ.
        this.setPickupDelayInfinite();
    }

    /** Создаёт предмет в мире. Стек и позиция задаются явно. */
    public static LootItemEntity spawn(World world, double x, double y, double z, ItemStack stack) {
        LootItemEntity entity = new LootItemEntity(EmberRaftEntities.LOOT_ITEM, world);
        entity.setPosition(x, y, z);
        entity.setStack(stack);
        entity.setVelocity(world.random.nextDouble() * 0.1 - 0.05, 0.05, world.random.nextDouble() * 0.1 - 0.05);
        world.spawnEntity(entity);
        return entity;
    }

    /** Запрет автоматического подбора: только ПКМ. */
    @Override
    public void onPlayerCollision(PlayerEntity player) {
    }

    /** Припасы нельзя сломать или сжечь. */
    @Override
    public boolean damage(DamageSource source, float amount) {
        return false;
    }

    @Override
    public ActionResult interact(PlayerEntity player, Hand hand) {
        if (this.getWorld().isClient) {
            return ActionResult.SUCCESS;
        }
        ItemStack stack = this.getStack();
        int count = stack.getCount();
        if (player.getInventory().insertStack(stack)) {
            player.sendPickup(this, count);
            player.increaseStat(Stats.PICKED_UP.getOrCreateStat(stack.getItem()), count);
            player.triggerItemPickedUpByEntityCriteria(this);
            this.getWorld().playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.ENTITY_ITEM_PICKUP, SoundCategory.PLAYERS, 0.5F, 1.0F);
            if (stack.isEmpty()) {
                this.discard();
            } else {
                this.setStack(stack); // частично вошло в инвентарь — обновляем остаток
            }
            return ActionResult.CONSUME;
        }
        player.sendMessage(Text.translatable("msg.ember_raft.inventory_full"), true);
        return ActionResult.PASS;
    }
}
