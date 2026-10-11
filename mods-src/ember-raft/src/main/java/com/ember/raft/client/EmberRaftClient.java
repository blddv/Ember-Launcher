package com.ember.raft.client;

import com.ember.raft.EmberRaftEntities;
import com.ember.raft.EmberRaftMod;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.render.entity.ItemEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModelLayer;
import net.minecraft.util.Identifier;

public class EmberRaftClient implements ClientModInitializer {
    public static final EntityModelLayer RAFT_LAYER = new EntityModelLayer(EmberRaftMod.id("raft"), "main");

    @Override
    public void onInitializeClient() {
        EntityModelLayerRegistry.registerModelLayer(RAFT_LAYER, RaftEntityModel::getTexturedModelData);
        EntityRendererRegistry.register(EmberRaftEntities.RAFT, RaftEntityRenderer::new);
        EntityRendererRegistry.register(EmberRaftEntities.HOOK, HookEntityRenderer::new);
        // Мусор и припасы рендерятся как обычные лежащие предметы.
        EntityRendererRegistry.register(EmberRaftEntities.LOOT_ITEM, ItemEntityRenderer::new);
    }

    public static Identifier raftTexture() {
        return EmberRaftMod.id("textures/entity/raft.png");
    }
}
