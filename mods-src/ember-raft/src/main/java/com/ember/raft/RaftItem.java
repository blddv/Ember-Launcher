package com.ember.raft;

import java.util.List;
import java.util.function.Predicate;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.predicate.entity.EntityPredicates;
import net.minecraft.stat.Stats;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;
import net.minecraft.world.event.GameEvent;

/** Предмет-плот. Работает как предмет-лодка: ПКМ по воде ставит плот. */
public class RaftItem extends Item {
    private static final Predicate<Entity> RIDERS = EntityPredicates.EXCEPT_SPECTATOR.and(Entity::canHit);

    public RaftItem(Settings settings) {
        super(settings);
    }

    @Override
    public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
        ItemStack stack = user.getStackInHand(hand);
        HitResult hitResult = raycast(world, user, RaycastContext.FluidHandling.ANY);
        if (hitResult.getType() == HitResult.Type.MISS) {
            return TypedActionResult.pass(stack);
        }

        Vec3d rotation = user.getRotationVec(1.0F);
        List<Entity> blocking = world.getOtherEntities(user, user.getBoundingBox().stretch(rotation.multiply(5.0)).expand(1.0), RIDERS);
        if (!blocking.isEmpty()) {
            Vec3d eyePos = user.getEyePos();
            for (Entity entity : blocking) {
                Box box = entity.getBoundingBox().expand(entity.getTargetingMargin());
                if (box.contains(eyePos)) {
                    return TypedActionResult.pass(stack);
                }
            }
        }

        if (hitResult.getType() == HitResult.Type.BLOCK) {
            Vec3d pos = hitResult.getPos();
            RaftEntity raft = new RaftEntity(world, pos.x, pos.y, pos.z);
            raft.setYaw(user.getYaw());
            if (!world.isSpaceEmpty(raft, raft.getBoundingBox())) {
                return TypedActionResult.fail(stack);
            }
            if (!world.isClient) {
                world.spawnEntity(raft);
                world.emitGameEvent(user, GameEvent.ENTITY_PLACE, hitResult.getPos());
                stack.decrementUnlessCreative(1, user);
            }
            user.incrementStat(Stats.USED.getOrCreateStat(this));
            return TypedActionResult.success(stack, world.isClient());
        }
        return TypedActionResult.pass(stack);
    }
}
