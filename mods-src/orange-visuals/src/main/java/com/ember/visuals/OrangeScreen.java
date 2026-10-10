package com.ember.visuals;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.Function;
import java.util.function.Supplier;

/** Меню Orange Visuals: открывается коротким нажатием клавиши меню (по умолчанию R SHIFT). Все изменения применяются сразу. */
public class OrangeScreen extends Screen {
    private static final int COL_W = 176;
    private static final int GAP = 14;
    private static final int ROW = 24;
    private static final int BTN_H = 20;
    private static final int PANEL_BG = 0xF2050B1A;
    private static final int ACCENT = 0xFFFF7100;
    private static final int TEXT = 0xFFF2F2F2;
    private static final int MUTED = 0xFF8FA3C7;
    private static final String[] CORNERS = {"слева сверху", "справа сверху", "слева снизу", "справа снизу"};
    private static final String[] REPEAT_IDS = {"off", "all", "one"};
    private static final String[] REPEAT_NAMES = {"нет", "все", "один"};

    private final Config c = OrangeVisualsClient.CONFIG;
    private int px;
    private int py;
    private int pw;
    private int ph;

    public OrangeScreen() {
        this(null);
    }

    public OrangeScreen(Screen parent) {
        super(Text.literal("Orange Visuals"));
    }

    @Override
    protected void init() {
        pw = COL_W * 3 + GAP * 2 + 40;
        ph = 400;
        px = width / 2 - pw / 2;
        py = Math.max(6, height / 2 - ph / 2);
        int x1 = px + 20;
        int x2 = x1 + COL_W + GAP;
        int x3 = x2 + COL_W + GAP;
        int top = py + 44;

        // Колонка HUD
        int r = 0;
        toggle(x1, top + ROW * r++, "Счётчик FPS", () -> c.hudFps, v -> c.hudFps = v);
        toggle(x1, top + ROW * r++, "Координаты", () -> c.hudCoords, v -> c.hudCoords = v);
        toggle(x1, top + ROW * r++, "Курс (компас)", () -> c.hudDirection, v -> c.hudDirection = v);
        toggle(x1, top + ROW * r++, "Часы", () -> c.hudClock, v -> c.hudClock = v);
        toggle(x1, top + ROW * r++, "Память (RAM)", () -> c.hudMemory, v -> c.hudMemory = v);
        toggle(x1, top + ROW * r++, "CPS (клики)", () -> c.hudCps, v -> c.hudCps = v);
        toggle(x1, top + ROW * r++, "Сейчас играет", () -> c.hudNowPlaying, v -> c.hudNowPlaying = v);
        toggle(x1, top + ROW * r++, "Тосты о треке", () -> c.hudToasts, v -> c.hudToasts = v);
        toggle(x1, top + ROW * r++, "Пинг", () -> c.hudPing, v -> c.hudPing = v);
        toggle(x1, top + ROW * r++, "Эффекты зелий", () -> c.hudPotions, v -> c.hudPotions = v);
        toggle(x1, top + ROW * r++, "Водяной знак", () -> c.watermark, v -> c.watermark = v);
        toggle(x1, top + ROW * r++, "Меню по " + keyName(c.menuKey), () -> c.menuOnShift, v -> c.menuOnShift = v);
        slider(x1, top + ROW * r++, "Масштаб HUD", 0.6, 1.6, c.hudScale, v -> c.hudScale = v, v -> String.format("%.1f", v));
        button(x1, top + ROW * r, COL_W, () -> Text.literal("Угол: " + CORNERS[c.hudCorner]),
                () -> c.hudCorner = (c.hudCorner + 1) % CORNERS.length);

        // Колонка визуала
        r = 0;
        toggle(x2, top + ROW * r++, "Зум на " + keyName(c.zoomKey), () -> c.zoom, v -> c.zoom = v);
        slider(x2, top + ROW * r++, "Сила зума", 0.05, 1.0, c.zoomFactor, v -> c.zoomFactor = v,
                v -> "FOV x" + String.format("%.2f", v));
        toggle(x2, top + ROW * r++, "Тёплый фильтр", () -> c.warm, v -> c.warm = v);
        slider(x2, top + ROW * r++, "Сила фильтра", 0.0, 1.0, c.warmStrength, v -> c.warmStrength = v, this::pct);
        toggle(x2, top + ROW * r++, "Затемнение краёв", () -> c.vignette, v -> c.vignette = v);
        slider(x2, top + ROW * r++, "Сила затемнения", 0.0, 1.0, c.vignetteStrength, v -> c.vignetteStrength = v, this::pct);
        toggle(x2, top + ROW * r++, "Точка-прицел", () -> c.crosshairDot, v -> c.crosshairDot = v);
        toggle(x2, top + ROW * r++, "Свой FOV", () -> c.customFov, v -> c.customFov = v);
        slider(x2, top + ROW * r++, "FOV", 30, 150, c.fov, v -> c.fov = Math.round(v), v -> String.valueOf(Math.round(v)));
        toggle(x2, top + ROW * r++, "Режим для слабых ПК", () -> c.lowEnd, v -> c.lowEnd = v);
        button(x2, top + ROW * r++, COL_W, () -> Text.literal("Карта и метки…"),
                () -> MinecraftClient.getInstance().setScreen(new MapSettingsScreen(this)));

        // Колонка музыки
        r = 0;
        toggle(x3, top + ROW * r++, "Музыка в игре", () -> c.music, v -> c.music = v);
        toggle(x3, top + ROW * r++, "Автостарт", () -> c.musicAutoplay, v -> c.musicAutoplay = v);
        toggle(x3, top + ROW * r++, "Перемешать", () -> c.musicShuffle, v -> {
            c.musicShuffle = v;
            MusicPlayer.setShuffle(v);
        });
        button(x3, top + ROW * r++, COL_W, () -> Text.literal("Повтор: " + repeatName()), () -> {
            int idx = 0;
            for (int i = 0; i < REPEAT_IDS.length; i++) if (REPEAT_IDS[i].equals(c.musicRepeat)) idx = i;
            c.musicRepeat = REPEAT_IDS[(idx + 1) % REPEAT_IDS.length];
            MusicPlayer.setRepeat(c.musicRepeat);
        });
        slider(x3, top + ROW * r++, "Громкость", 0.0, 1.0, c.musicVolume, v -> {
            c.musicVolume = v;
            MusicPlayer.setVolume(v);
        }, this::pct);
        int bw = (COL_W - 8) / 3;
        button(x3, top + ROW * r, bw, () -> Text.literal("« Пред."), MusicPlayer::prev);
        button(x3 + bw + 4, top + ROW * r, bw, () -> Text.literal("Пуск/Пауза"), MusicPlayer::togglePause);
        button(x3 + (bw + 4) * 2, top + ROW * r, bw, () -> Text.literal("След. »"), MusicPlayer::next);
        r++;
        button(x3, top + ROW * r++, COL_W, () -> Text.literal("Пересканировать папку"),
                () -> MusicPlayer.rescan(c.musicFolder));

        // Подвал
        addDrawableChild(ButtonWidget.builder(Text.literal("Готово"), b -> close())
                .dimensions(px + pw / 2 - 80, py + ph - 30, 160, BTN_H).build());
    }

    // ---------- виджеты ----------

    private void toggle(int x, int y, String label, BooleanSupplier get, Consumer<Boolean> set) {
        button(x, y, COL_W, () -> onOff(label, get.getAsBoolean()), () -> set.accept(!get.getAsBoolean()));
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

    private String repeatName() {
        for (int i = 0; i < REPEAT_IDS.length; i++) {
            if (REPEAT_IDS[i].equals(c.musicRepeat)) return REPEAT_NAMES[i];
        }
        return REPEAT_NAMES[1];
    }

    /** Название клавиши по GLFW-коду, как его видит Minecraft (например, «Right Shift») */
    static String keyName(int code) {
        try {
            return InputUtil.fromKeyCode(code, 0).getLocalizedText().getString();
        } catch (Exception e) {
            return "клавиша " + code;
        }
    }

    private String pct(double v) {
        return Math.round(v * 100) + "%";
    }

    private final class Slider extends SliderWidget {
        private final String label;
        private final double min;
        private final double max;
        private final DoubleConsumer set;
        private final Function<Double, String> fmt;

        Slider(int x, int y, String label, double min, double max, double cur,
               DoubleConsumer set, Function<Double, String> fmt) {
            super(x, y, COL_W, BTN_H, Text.empty(), (cur - min) / (max - min));
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
            if (label == null || fmt == null) return;
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
        ctx.drawCenteredTextWithShadow(textRenderer, "ORANGE VISUALS", width / 2, py + 9, ACCENT);
        ctx.drawCenteredTextWithShadow(textRenderer, "Меню " + keyName(c.menuKey) + ": короткое нажатие открывает, Esc закрывает · карта: M — вкл/выкл, N — полная карта, B — метка", width / 2, py + 21, MUTED);

        int x1 = px + 20;
        int x2 = x1 + COL_W + GAP;
        int x3 = x2 + COL_W + GAP;
        ctx.drawTextWithShadow(textRenderer, "HUD", x1, py + 32, ACCENT);
        ctx.drawTextWithShadow(textRenderer, "ВИЗУАЛ", x2, py + 32, ACCENT);
        ctx.drawTextWithShadow(textRenderer, "МУЗЫКА", x3, py + 32, ACCENT);

        // Информация о плеере внизу третьей колонки
        int infoY = py + 44 + ROW * 6;
        String now = MusicPlayer.currentName();
        String state = MusicPlayer.trackCount() == 0 ? "Треков нет" :
                (MusicPlayer.isPlaying() ? (MusicPlayer.isPaused() ? "Пауза" : "Играет") : "Остановлено");
        ctx.drawTextWithShadow(textRenderer, trim(state + " · треков " + MusicPlayer.trackCount()), x3, infoY + 4, TEXT);
        ctx.drawTextWithShadow(textRenderer, trim(now == null ? "—" : now), x3, infoY + 16, MUTED);
        String folder = c.musicFolder == null || c.musicFolder.isBlank() ? "папка не выбрана в лаунчере" : c.musicFolder;
        ctx.drawTextWithShadow(textRenderer, trim(folder), x3, infoY + 28, MUTED);
        String err = MusicPlayer.lastError();
        if (!err.isEmpty()) ctx.drawTextWithShadow(textRenderer, trim("Ошибка: " + err), x3, infoY + 40, 0xFFFF8080);

        super.render(ctx, mouseX, mouseY, delta);
    }

    private String trim(String s) {
        return textRenderer.trimToWidth(s, COL_W);
    }

    @Override
    public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
        // Затемнение рисуем в render(), здесь ничего: без размытия и двойного фона
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
        MinecraftClient.getInstance().setScreen(null);
    }
}
