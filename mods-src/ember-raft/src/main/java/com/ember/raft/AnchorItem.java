package com.ember.raft;

import java.util.List;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Якорь: ПКМ поднимает или опускает якорь ближайшего плота.
 * То же самое можно сделать, нажав по плоту ПКМ с пустой рукой и зажав присед.
 */
public class AnchorItem extends Item {
    public AnchorItem(Settings settings) {
        super(settings);
    }

    @Override
    public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
        ItemStack stack = user.getStackInHand(hand);
        if (!world.isClient) {
            List<RaftEntity> rafts = world.getEntitiesByClass(RaftEntity.class, user.getBoundingBox().expand(6.0), raft -> true);
            RaftEntity nearest = null;
            double best = Double.MAX_VALUE;
            for (RaftEntity raft : rafts) {
                double dist = raft.squaredDistanceTo(user);
                if (dist < best) {
                    best = dist;
                    nearest = raft;
                }
            }
            if (nearest == null) {
                user.sendMessage(Text.translatable("msg.ember_raft.anchor.no_raft"), true);
                return TypedActionResult.pass(stack);
            }
            nearest.toggleAnchor(user);
            user.swingHand(hand);
        }
        return TypedActionResult.success(stack, world.isClient());
    }

    @Override
    public void appendTooltip(ItemStack stack, TooltipContext context, List<Text> tooltip, TooltipType type) {
        tooltip.add(Text.translatable("item.ember_raft.anchor.tooltip").formatted(Formatting.GRAY));
    }
}
