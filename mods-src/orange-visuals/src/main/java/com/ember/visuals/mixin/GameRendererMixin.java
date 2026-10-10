package com.ember.visuals.mixin;

import com.ember.visuals.Config;
import com.ember.visuals.OrangeVisualsClient;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    /**
     * Меняет FOV: свой FOV из меню (пропорционально настройке Minecraft, эффекты бега и зелий сохраняются)
     * и плавный зум на клавишу зума.
     */
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void orangevisuals$fov(Camera camera, float tickDelta, boolean changingFov,
                                   CallbackInfoReturnable<Double> cir) {
        Config cfg = OrangeVisualsClient.CONFIG;
        double value = cir.getReturnValue();
        if (cfg.customFov) {
            double base = MinecraftClient.getInstance().options.getFov().getValue();
            value = value * cfg.fov / Math.max(1.0, base);
        }
        double p = OrangeVisualsClient.zoomProgress;
        if (p > 0.0) {
            value = value * (1.0 - (1.0 - cfg.zoomFactor) * p);
        }
        cir.setReturnValue(value);
    }
}
