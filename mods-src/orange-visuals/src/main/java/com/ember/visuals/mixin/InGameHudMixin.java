package com.ember.visuals.mixin;

import com.ember.visuals.Config;
import com.ember.visuals.OrangeVisualsClient;
import net.minecraft.client.gui.hud.InGameHud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Если включена «Точка-прицел» (свой прицел мода), обычный прицел игры не рисуется. */
@Mixin(InGameHud.class)
public abstract class InGameHudMixin {
    @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
    private void orangevisuals$hideCrosshair(CallbackInfo ci) {
        Config cfg = OrangeVisualsClient.CONFIG;
        if (cfg.crosshairDot) {
            ci.cancel();
        }
    }
}
