package com.ember.visuals;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.Function;
import java.util.function.Supplier;

/** Настройки миникарты, полноэкранной карты и меток. Открывается из меню Orange Visuals. */
public final class MapSettingsScreen extends Screen {
    private static final int W = 220;
    private static final int ROW = 24;
    private static final int BTN_H = 20;
    private static final int PANEL_BG = 0xF2050B1A;
    private static final int ACCENT = 0xFFFF7100;
    private static final int MUTED = 0xFF8FA3C7;
    private static final String[] CORNERS = {"слева сверху", "справа сверху", "слева снизу", "справа снизу"};

    private final Screen parent;
    private final Config c = OrangeVisualsClient.CONFIG;
    private int px;
    private int py;
    private int pw;
    private int ph;

    public MapSettingsScreen(Screen parent) {
        super(Text.literal("Карта и метки"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        pw = W + 60;
        ph = 372;
        px = width / 2 - pw / 2;
        py = Math.max(6, height / 2 - ph / 2);
        int x = width / 2 - W / 2;
        int top = py + 40;
        int r = 0;

        toggle(x, top + ROW * r++, "Миникарта", () -> c.minimap, v -> c.minimap = v);
        toggle(x, top + ROW * r++, "Вращение по взгляду", () -> c.minimapRotate, v -> c.minimapRotate = v);
        toggle(x, top + ROW * r++, "Круглая форма", () -> c.minimapRound, v -> c.minimapRound = v);
        slider(x, top + ROW * r++, "Размер карты", 64, 256, c.minimapSize,
                v -> c.minimapSize = (int) (Math.round(v / 16.0) * 16), v -> String.valueOf((int) (Math.round(v / 16.0) * 16)));
        slider(x, top + ROW * r++, "Масштаб карты", 0.5, 2.0, c.minimapScale,
                v -> c.minimapScale = Math.round(v * 10) / 10.0, v -> String.format("%.1f", v));
        button(x, top + ROW * r++, W, () -> Text.literal("Угол: " + CORNERS[c.minimapCorner]),
                () -> c.minimapCorner = (c.minimapCorner + 1) % CORNERS.length);

        r++;
        button(x, top + ROW * r++, W, () -> Text.literal("Размер мышью (кружок в центре)"),
                () -> MinecraftClient.getInstance().setScreen(new MinimapResizeScreen(this)));
        button(x, top + ROW * r++, W, () -> Text.literal("Полноэкранная карта (N)"),
                () -> MinecraftClient.getInstance().setScreen(new FullMapScreen()));
        button(x, top + ROW * r++, W, () -> Text.literal("Метка в текущей позиции (B)"), () -> {
            MinecraftClient mc = MinecraftClient.getInstance();
            if (mc.player != null && mc.world != null) {
                Waypoints.add(Waypoints.dimOf(mc.world), mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ());
            }
        });
        button(x, top + ROW * r++, W, () -> Text.literal("Очистить метки в этом мире"), () -> {
            MinecraftClient mc = MinecraftClient.getInstance();
            if (mc.world != null) Waypoints.clear(Waypoints.dimOf(mc.world));
        });

        addDrawableChild(ButtonWidget.builder(Text.literal("Назад"), b -> close())
                .dimensions(width / 2 - 80, py + ph - 30, 160, BTN_H).build());
    }

    // ---------- виджеты ----------

    private void toggle(int x, int y, String label, BooleanSupplier get, Consumer<Boolean> set) {
        button(x, y, W, () -> onOff(label, get.getAsBoolean()), () -> set.accept(!get.getAsBoolean()));
    }

    private void button(int x, int y, int w, Supplier<Text> label, Runnable action) {
        addDrawableChild(ButtonWidget.builder(label.get(), b -> {
            action.run();
            b.setMessage(label.get());
        }).dimensions(x, y, w, BTN_H).build());
    }

    private void slider(int x, int y, String label, double min, double max, double cur,
                        DoubleConsumer set, Function<Double, String> fmt) {
        addDrawableChild(new Slider(x, y, label, min, max, cur, set, fmt));
    }

    private static Text onOff(String label, boolean on) {
        return Text.literal(label + ": ").append(
                Text.literal(on ? "вкл" : "выкл").formatted(on ? Formatting.GOLD : Formatting.GRAY));
    }

    private final class Slider extends SliderWidget {
        private final String label;
        private final double min;
        private final double max;
        private final DoubleConsumer set;
        private final Function<Double, String> fmt;

        Slider(int x, int y, String label, double min, double max, double cur,
               DoubleConsumer set, Function<Double, String> fmt) {
            super(x, y, W, BTN_H, Text.empty(), (cur - min) / (max - min));
            this.label = label;
            this.min = min;
            this.max = max;
            this.set = set;
            this.fmt = fmt;
            updateMessage();
        }

        private double actual() {
            return min + this.value * (max - min);
        }

        @Override
        protected void updateMessage() {
            setMessage(Text.literal(label + ": " + fmt.apply(actual())));
        }

        @Override
        protected void applyValue() {
            if (set != null) set.accept(actual());
        }
    }

    // ---------- отрисовка ----------

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        ctx.fill(0, 0, width, height, 0x88000000);
        ctx.fill(px, py, px + pw, py + ph, PANEL_BG);
        ctx.fill(px, py, px + pw, py + 2, ACCENT);
        ctx.drawCenteredTextWithShadow(textRenderer, "КАРТА И МЕТКИ", width / 2, py + 9, ACCENT);
        ctx.drawCenteredTextWithShadow(textRenderer,
                "M — вкл/выкл · [ ] — размер · B — метка · N — полная карта", width / 2, py + 21, MUTED);

        MinecraftClient mc = MinecraftClient.getInstance();
        int n = mc.world == null ? 0 : Waypoints.countIn(Waypoints.dimOf(mc.world));
        ctx.drawCenteredTextWithShadow(textRenderer, "Меток в этом мире: " + n, width / 2, py + ph - 44, MUTED);

        super.render(ctx, mouseX, mouseY, delta);
    }

    @Override
    public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
        // Затемнение рисуем в render(), без размытия и двойного фона
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void removed() {
        c.clamp();
        c.save();
        super.removed();
    }

    @Override
    public void close() {
        MinecraftClient.getInstance().setScreen(parent);
    }
}
