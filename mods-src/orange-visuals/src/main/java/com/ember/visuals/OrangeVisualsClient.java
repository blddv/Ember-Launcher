package com.ember.visuals;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

public class OrangeVisualsClient implements ClientModInitializer {
    public static final Config CONFIG = Config.load();
    /** 0 — обычный FOV, 1 — полный зум. Плавно меняется каждый тик. */
    public static double zoomProgress = 0.0;

    private static boolean menuWasDown = false;
    private static boolean menuChord = false;
    private static long menuDownAt = 0L;
    private static boolean autoplayDone = false;

    @Override
    public void onInitializeClient() {
        Waypoints.load();
        MusicPlayer.rescan(CONFIG.musicFolder);
        MusicPlayer.setVolume(CONFIG.musicVolume);
        MusicPlayer.setShuffle(CONFIG.musicShuffle);
        MusicPlayer.setRepeat(CONFIG.musicRepeat);

        HudRenderCallback.EVENT.register((drawContext, tickCounter) -> HudOverlay.render(drawContext));
        ClientTickEvents.END_CLIENT_TICK.register(OrangeVisualsClient::tick);
    }

    /** Клавиша зума читается напрямую из окна: работает независимо от биндингов Minecraft. */
    private static boolean zoomHeld(MinecraftClient client) {
        if (client.getWindow() == null || CONFIG.zoomKey <= 0) return false;
        return InputUtil.isKeyPressed(client.getWindow().getHandle(), CONFIG.zoomKey);
    }

    private static void tick(MinecraftClient client) {
        boolean wantZoom = CONFIG.zoom && client.player != null && client.currentScreen == null && zoomHeld(client);
        double target = wantZoom ? 1.0 : 0.0;
        zoomProgress += (target - zoomProgress) * 0.35;
        if (Math.abs(target - zoomProgress) < 0.001) zoomProgress = target;

        Clicks.tick(client);
        Minimap.tick(client);
        handleMenuKey(client);

        if (!autoplayDone && client.player != null && CONFIG.music && CONFIG.musicAutoplay) {
            autoplayDone = true;
            MusicPlayer.playDefault();
        }
    }

    /**
     * Короткое нажатие клавиши меню (по умолчанию R SHIFT, задаётся в лаунчере) открывает меню.
     * Нажатие с другими клавишами (например, приседание) меню не открывает.
     */
    private static void handleMenuKey(MinecraftClient client) {
        if (client.getWindow() == null || CONFIG.menuKey <= 0) return;
        long handle = client.getWindow().getHandle();
        boolean down = InputUtil.isKeyPressed(handle, CONFIG.menuKey);
        long now = System.currentTimeMillis();

        if (down && !menuWasDown) {
            menuDownAt = now;
            menuChord = false;
        }
        if (down && anyGameKeyPressed(client)) menuChord = true;

        if (!down && menuWasDown) {
            long held = now - menuDownAt;
            boolean screenOk = client.currentScreen == null || client.currentScreen instanceof OrangeScreen;
            if (CONFIG.menuOnShift && !menuChord && held < 350 && screenOk) {
                if (client.currentScreen instanceof OrangeScreen) {
                    client.setScreen(null);
                } else {
                    client.setScreen(new OrangeScreen(client.currentScreen));
                }
            }
        }
        menuWasDown = down;
    }

    private static boolean anyGameKeyPressed(MinecraftClient client) {
        var o = client.options;
        if (o == null) return false;
        return o.forwardKey.isPressed() || o.backKey.isPressed() || o.leftKey.isPressed()
                || o.rightKey.isPressed() || o.jumpKey.isPressed() || o.attackKey.isPressed()
                || o.useKey.isPressed() || o.inventoryKey.isPressed();
    }
}
