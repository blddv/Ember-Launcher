package com.ember.raft.client;

import com.ember.raft.RaftEntity;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

@Environment(EnvType.CLIENT)
public class RaftEntityRenderer extends EntityRenderer<RaftEntity> {
    private static final Identifier TEXTURE = Identifier.of("ember_raft", "textures/entity/raft.png");

    private final RaftEntityModel model;

    public RaftEntityRenderer(EntityRendererFactory.Context context) {
        super(context);
        this.shadowRadius = 0.9F;
        this.model = new RaftEntityModel(context.getPart(EmberRaftClient.RAFT_LAYER));
    }

    @Override
    public void render(RaftEntity raft, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light) {
        matrices.push();
        matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(180.0F - yaw));

        // Покачивание при ударах — как у лодки.
        float wobbleTicks = (float) raft.getDamageWobbleTicks() - tickDelta;
        float wobbleStrength = raft.getDamageWobbleStrength() - tickDelta;
        if (wobbleStrength < 0.0F) {
            wobbleStrength = 0.0F;
        }
        if (wobbleTicks > 0.0F) {
            matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(MathHelper.sin(wobbleTicks) * wobbleTicks * wobbleStrength / 10.0F * (float) raft.getDamageWobbleSide()));
        }

        int level = raft.getRaftLevel();
        float scale = 1.0F + 0.05F * level;
        matrices.scale(scale, scale, scale);
        this.model.setRaftLevel(level);
        this.model.setAngles(raft, tickDelta, 0.0F, -0.1F, 0.0F, 0.0F);
        VertexConsumer vertexConsumer = vertexConsumers.getBuffer(this.model.getLayer(TEXTURE));
        this.model.render(matrices, vertexConsumer, light, OverlayTexture.DEFAULT_UV);
        matrices.pop();
        super.render(raft, yaw, tickDelta, matrices, vertexConsumers, light);
    }

    @Override
    public Identifier getTexture(RaftEntity raft) {
        return TEXTURE;
    }
}
