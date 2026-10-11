package com.ember.raft.client;

import com.google.common.collect.ImmutableList;
import java.util.List;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.render.entity.model.CompositeEntityModel;
import net.minecraft.entity.vehicle.BoatEntity;

/**
 * Модель плота: брёвна, дощатая палуба, столбики по углам (уровень 1+),
 * мачта (уровень 2+) и парус (уровень 3+). Нос модели смотрит в -Z.
 */
@Environment(EnvType.CLIENT)
public class RaftEntityModel extends CompositeEntityModel<BoatEntity> {
    private final ModelPart posts;
    private final ModelPart mast;
    private final ModelPart sail;
    private final List<ModelPart> parts;

    public RaftEntityModel(ModelPart root) {
        ModelPart logs = root.getChild("logs");
        ModelPart deck = root.getChild("deck");
        this.posts = root.getChild("posts");
        this.mast = root.getChild("mast");
        this.sail = root.getChild("sail");
        this.parts = ImmutableList.of(logs, deck, this.posts, this.mast, this.sail);
    }

    /** Включает детали, соответствующие уровню плота. */
    public void setRaftLevel(int level) {
        this.posts.visible = level >= 1;
        this.mast.visible = level >= 2;
        this.sail.visible = level >= 3;
    }

    @Override
    public Iterable<ModelPart> getParts() {
        return this.parts;
    }

    @Override
    public void setAngles(BoatEntity entity, float limbAngle, float limbDistance, float animationProgress, float headYaw, float headPitch) {
        // Плот не анимируется — покачивание делает физика лодки.
    }

    public static TexturedModelData getTexturedModelData() {
        ModelData modelData = new ModelData();
        ModelPartData root = modelData.getRoot();
        root.addChild("logs", ModelPartBuilder.create().uv(0, 32)
                .cuboid(-12.0F, 0.0F, -13.0F, 8.0F, 3.0F, 26.0F)
                .cuboid(-4.0F, 0.0F, -13.0F, 8.0F, 3.0F, 26.0F)
                .cuboid(4.0F, 0.0F, -13.0F, 8.0F, 3.0F, 26.0F), ModelTransform.NONE);
        root.addChild("deck", ModelPartBuilder.create().uv(0, 0)
                .cuboid(-12.0F, 3.0F, -13.0F, 24.0F, 2.0F, 26.0F), ModelTransform.NONE);
        root.addChild("posts", ModelPartBuilder.create().uv(70, 32)
                .cuboid(-12.0F, 5.0F, -13.0F, 1.0F, 3.0F, 1.0F)
                .cuboid(11.0F, 5.0F, -13.0F, 1.0F, 3.0F, 1.0F)
                .cuboid(-12.0F, 5.0F, 12.0F, 1.0F, 3.0F, 1.0F)
                .cuboid(11.0F, 5.0F, 12.0F, 1.0F, 3.0F, 1.0F), ModelTransform.NONE);
        root.addChild("mast", ModelPartBuilder.create().uv(102, 0)
                .cuboid(-0.5F, 5.0F, 1.5F, 1.0F, 20.0F, 1.0F), ModelTransform.NONE);
        root.addChild("sail", ModelPartBuilder.create().uv(76, 32)
                .cuboid(-8.0F, 10.0F, 1.25F, 16.0F, 12.0F, 0.5F), ModelTransform.NONE);
        return TexturedModelData.of(modelData, 128, 64);
    }
}
