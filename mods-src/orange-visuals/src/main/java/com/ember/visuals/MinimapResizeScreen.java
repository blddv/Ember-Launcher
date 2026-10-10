package com.ember.visuals;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

/**
 * Режим изменения размера миникарты. Системный курсор скрыт, вместо него рисуется кружок.
 * Кружок в центре миникарты — ручка: тянешь её мышью, размер карты равен расстоянию
 * от точки захвата до курсора. Шаг 16 блоков, как у клавиш [ и ].
 * Esc — выход.
 */
public final class MinimapResizeScreen extends Screen {
    private static final int ACCENT = 0xFFFF7100;
    private static final int TEXT = 0xFFF2F2F2;
    private static final int MUTED = 0xFF8FA3C7;
    private static final int DARK = 0xFF050B1A;
    private static final int GRAB = 12;       // радиус захвата ручки, пикселей

    private final Screen parent;
    private final Config cfg = OrangeVisualsClient.CONFIG;
    private boolean dragging;
    private int anchorX;
    private int anchorY;

    public MinimapResizeScreen(Screen parent) {
        super(Text.literal("Размер миникарты"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        // Миникарта должна быть видна, иначе менять нечего
        cfg.minimap = true;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.getWindow() != null) {
            GLFW.glfwSetInputMode(mc.getWindow().getHandle(), GLFW.GLFW_CURSOR, GLFW.GLFW_CURSOR_HIDDEN);
        }
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    // ---------- отрисовка ----------

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        ctx.fill(0, 0, width, height, 0x55000000);
        MinecraftClient mc = MinecraftClient.getInstance();
        Minimap.render(ctx, mc, cfg, width, height);

        int[] c = Minimap.center(cfg, width, height);
        // Ручка в центре миникарты
        Minimap.disc(ctx, c[0], c[1], GRAB / 2 + 1, ACCENT);
        Minimap.disc(ctx, c[0], c[1], GRAB / 2 - 2, DARK);

        // Свой курсор: кружок под мышью, системный скрыт
        Minimap.disc(ctx, mouseX, mouseY, 4, DARK);
        Minimap.disc(ctx, mouseX, mouseY, 2, TEXT);

        String hint = "Тяни кружок в центре карты · размер " + Minimap.displaySize(cfg) + " · Esc — готово";
        ctx.drawCenteredTextWithShadow(textRenderer, hint, width / 2, 8, ACCENT);
        ctx.drawCenteredTextWithShadow(textRenderer, "Шаг 16 блоков; клавиши [ и ] работают так же",
                width / 2, 20, MUTED);
    }

    @Override
    public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
        // Затемнение рисуем в render()
    }

    // ---------- мышь ----------

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0) {
            int[] c = Minimap.center(cfg, width, height);
            double dist = Math.hypot(mouseX - c[0], mouseY - c[1]);
            if (dist <= GRAB) {
                dragging = true;
                anchorX = c[0];
                anchorY = c[1];
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
        if (button == 0 && dragging) {
            double dist = Math.hypot(mouseX - anchorX, mouseY - anchorY);
            double scale = cfg.minimapScale;
            // displaySize = minimapSize * scale, полный диаметр = 2 * расстояние
            int size = (int) Math.round((2.0 * dist / scale) / 16.0) * 16;
            size = Math.max(64, Math.min(256, size));
            if (size != cfg.minimapSize) cfg.minimapSize = size;
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, dx, dy);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (button == 0 && dragging) {
            dragging = false;
            cfg.clamp();
            cfg.save();
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    // ---------- выход ----------

    @Override
    public void removed() {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.getWindow() != null) {
            GLFW.glfwSetInputMode(mc.getWindow().getHandle(), GLFW.GLFW_CURSOR, GLFW.GLFW_CURSOR_NORMAL);
        }
        cfg.clamp();
        cfg.save();
        super.removed();
    }

    @Override
    public void close() {
        MinecraftClient.getInstance().setScreen(parent);
    }
}
