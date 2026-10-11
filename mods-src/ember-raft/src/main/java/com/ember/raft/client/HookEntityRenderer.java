package com.ember.raft.client;

import com.ember.raft.EmberRaftItems;
import com.ember.raft.HookEntity;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Arm;
import net.minecraft.util.Colors;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * Рендер брошенного крюка: маленький спрайт и провисающая верёвка
 * от руки игрока до крюка — как у удочки.
 */
@Environment(EnvType.CLIENT)
public class HookEntityRenderer extends EntityRenderer<HookEntity> {
    private static final Identifier TEXTURE = Identifier.of("ember_raft", "textures/entity/hook.png");
    private static final RenderLayer LAYER = RenderLayer.getEntityCutout(TEXTURE);

    public HookEntityRenderer(EntityRendererFactory.Context context) {
        super(context);
    }

    @Override
    public void render(HookEntity hook, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light) {
        PlayerEntity player = hook.getOwnerPlayer();
        if (player != null) {
            matrices.push();
            matrices.push();
            matrices.scale(0.5F, 0.5F, 0.5F);
            matrices.multiply(this.dispatcher.getRotation());
            MatrixStack.Entry entry = matrices.peek();
            VertexConsumer vertexConsumer = vertexConsumers.getBuffer(LAYER);
            vertex(vertexConsumer, entry, light, 0.0F, 0, 0, 1);
            vertex(vertexConsumer, entry, light, 1.0F, 0, 1, 1);
            vertex(vertexConsumer, entry, light, 1.0F, 1, 1, 0);
            vertex(vertexConsumer, entry, light, 0.0F, 1, 0, 0);
            matrices.pop();

            float swing = player.getHandSwingProgress(tickDelta);
            float swingFactor = MathHelper.sin(MathHelper.sqrt(swing) * (float) Math.PI);
            Vec3d handPos = this.getHandPos(player, swingFactor, tickDelta);
            Vec3d hookPos = hook.getLerpedPos(tickDelta).add(0.0, 0.15, 0.0);
            float dx = (float) (handPos.x - hookPos.x);
            float dy = (float) (handPos.y - hookPos.y);
            float dz = (float) (handPos.z - hookPos.z);
            VertexConsumer ropeConsumer = vertexConsumers.getBuffer(RenderLayer.getLineStrip());
            MatrixStack.Entry ropeEntry = matrices.peek();
            for (int i = 0; i <= 16; i++) {
                renderRopeSegment(dx, dy, dz, ropeConsumer, ropeEntry, percentage(i, 16), percentage(i + 1, 16));
            }
            matrices.pop();
        }
        super.render(hook, yaw, tickDelta, matrices, vertexConsumers, light);
    }

    /** Позиция руки игрока с крюком — с поправкой на вид от первого лица. */
    private Vec3d getHandPos(PlayerEntity player, float swingFactor, float tickDelta) {
        int side = player.getMainArm() == Arm.RIGHT ? 1 : -1;
        ItemStack stack = player.getMainHandStack();
        if (!stack.isOf(EmberRaftItems.HOOK)) {
            side = -side;
        }
        if (this.dispatcher.gameOptions.getPerspective().isFirstPerson() && player == MinecraftClient.getInstance().player) {
            double fovScale = 960.0 / (double) this.dispatcher.gameOptions.getFov().getValue().intValue();
            Vec3d offset = this.dispatcher.camera.getProjection().getPosition((float) side * 0.525F, -0.1F)
                    .multiply(fovScale).rotateY(swingFactor * 0.5F).rotateX(-swingFactor * 0.7F);
            return player.getCameraPosVec(tickDelta).add(offset);
        }
        float bodyYaw = MathHelper.lerp(tickDelta, player.prevBodyYaw, player.bodyYaw) * (float) (Math.PI / 180.0);
        double sin = MathHelper.sin(bodyYaw);
        double cos = MathHelper.cos(bodyYaw);
        float scale = player.getScale();
        double sideOffset = (double) side * 0.35 * scale;
        double heightOffset = 0.8 * scale;
        float sneakOffset = player.isInSneakingPose() ? -0.1875F : 0.0F;
        return player.getCameraPosVec(tickDelta).add(-cos * sideOffset - sin * heightOffset, (double) sneakOffset - 0.45 * scale, -sin * sideOffset + cos * heightOffset);
    }

    private static float percentage(int value, int max) {
        return (float) value / (float) max;
    }

    private static void vertex(VertexConsumer buffer, MatrixStack.Entry matrix, int light, float x, float y, int u, int v) {
        buffer.vertex(matrix, x - 0.5F, (float) y - 0.5F, 0.0F)
                .color(Colors.WHITE)
                .texture((float) u, (float) v)
                .overlay(OverlayTexture.DEFAULT_UV)
                .light(light)
                .normal(matrix, 0.0F, 1.0F, 0.0F);
    }

    /** Сегмент провисающей верёвки. */
    private static void renderRopeSegment(float x, float y, float z, VertexConsumer buffer, MatrixStack.Entry matrices, float segmentStart, float segmentEnd) {
        float startX = x * segmentStart;
        float startY = y * (segmentStart * segmentStart + segmentStart) * 0.5F + 0.25F;
        float startZ = z * segmentStart;
        float dirX = x * segmentEnd - startX;
        float dirY = y * (segmentEnd * segmentEnd + segmentEnd) * 0.5F + 0.25F - startY;
        float dirZ = z * segmentEnd - startZ;
        float length = MathHelper.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        dirX /= length;
        dirY /= length;
        dirZ /= length;
        // Коричневая верёвка.
        buffer.vertex(matrices, startX, startY, startZ).color(154, 116, 72, 255).normal(matrices, dirX, dirY, dirZ);
    }

    @Override
    public Identifier getTexture(HookEntity hook) {
        return TEXTURE;
    }
}
