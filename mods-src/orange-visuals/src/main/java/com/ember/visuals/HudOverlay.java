package com.ember.visuals;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.util.math.BlockPos;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** HUD в фирменных цветах EMBER: тёмно-синий фон и оранжевые акценты. */
public final class HudOverlay {
    private static final int BG = 0xB8050B1A;
    private static final int ACCENT = 0xFFFF7100;
    private static final int ACCENT_SOFT = 0xFFFFB27A;
    private static final int TEXT = 0xFFF2F2F2;
    private static final int MUTED = 0xFF8FA3C7;
    private static final int LINE = 10;
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm:ss");

    /** Переиспользуемые списки строк: без новых ArrayList каждый кадр */
    private static final List<String> INFO_LINES = new ArrayList<>();
    private static final List<String> POTION_LINES = new ArrayList<>();

    // Кэш строк HUD: собираются не каждый кадр, а раз в период (чаще для обычного режима)
    private static long infoAt = 0L;
    private static int infoBoxW = 0;
    private static int infoBoxH = 0;

    // Кэш «Сейчас играет»: обрезка названия и строка времени обновляются не каждый кадр
    private static String npTitle = null;
    private static int npMaxText = -1;
    private static String npShown = "";
    private static int npShownW = 0;
    private static String npTime = "0:00";
    private static long npTimeAt = 0L;

    private static int toastSerial = -1;
    private static long toastUntil = 0L;
    private static String toastText = "";

    private HudOverlay() {}

    public static void render(DrawContext ctx) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null || mc.options.hudHidden) return;
        Config cfg = OrangeVisualsClient.CONFIG;
        int w = mc.getWindow().getScaledWidth();
        int h = mc.getWindow().getScaledHeight();

        drawVisuals(ctx, cfg, w, h);
        if (mc.currentScreen != null) return;

        drawInfoPanel(ctx, mc, cfg, w, h);
        Minimap.render(ctx, mc, cfg, w, h);
        // Список зелий: справа сверху, ниже миникарты, если она там же
        int potY = (cfg.minimap && cfg.minimapCorner == 1) ? 6 + Minimap.totalHeight(cfg) + 4 : 6;
        if (cfg.hudPotions) drawPotions(ctx, mc, cfg, w, potY);
        if (cfg.hudNowPlaying) drawNowPlaying(ctx, mc, w);
        if (cfg.hudToasts) drawToast(ctx, mc, cfg, w);
        if (cfg.watermark) {
            ctx.drawTextWithShadow(mc.textRenderer, "EMBER · Orange Visuals", 4, h - 11, ACCENT);
        }
        if (cfg.crosshairDot) {
            ctx.fill(w / 2 - 1, h / 2 - 1, w / 2 + 1, h / 2 + 1, ACCENT);
        }
    }

    // ---------- визуальные фильтры ----------

    private static void drawVisuals(DrawContext ctx, Config cfg, int w, int h) {
        if (cfg.warm) {
            int alpha = (int) (cfg.warmStrength * 0.22 * 255) & 0xFF;
            ctx.fill(0, 0, w, h, (alpha << 24) | 0xFF7100);
        }
        // Слабый ПК: виньетка (четыре градиента на весь кадр) не рисуется
        if (cfg.vignette && !cfg.lowEnd && cfg.vignetteStrength > 0.0) {
            int edge = Math.max(24, (int) (Math.min(w, h) * 0.28));
            int a = (int) (cfg.vignetteStrength * 200) & 0xFF;
            int dark = (a << 24) | 0x000000;
            int clear = 0x00000000;
            ctx.fillGradient(0, 0, w, edge, dark, clear);
            ctx.fillGradient(0, h - edge, w, h, clear, dark);
            ctx.fillGradient(0, 0, edge, h, dark, clear);
            ctx.fillGradient(w - edge, 0, w, h, clear, dark);
        }
    }

    // ---------- информационная панель ----------

    private static void drawInfoPanel(DrawContext ctx, MinecraftClient mc, Config cfg, int w, int h) {
        List<String> lines = INFO_LINES;
        TextRenderer tr = mc.textRenderer;
        long now = System.currentTimeMillis();
        // Строки собираются раз в период: 150 мс обычно, 500 мс в режиме для слабых ПК
        if (now - infoAt >= (cfg.lowEnd ? 500 : 150)) {
        infoAt = now;
        lines.clear();
        if (cfg.hudFps) lines.add("FPS " + mc.getCurrentFps());
        if (cfg.hudCoords) {
            BlockPos p = mc.player.getBlockPos();
            lines.add("XYZ " + p.getX() + " " + p.getY() + " " + p.getZ());
        }
        if (cfg.hudDirection) lines.add("Курс " + compass(mc.player.getYaw()));
        if (cfg.hudClock) lines.add(LocalTime.now().format(CLOCK));
        if (cfg.hudMemory) {
            Runtime rt = Runtime.getRuntime();
            long used = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
            long max = rt.maxMemory() / (1024 * 1024);
            lines.add("RAM " + used + "/" + max + " МБ");
        }
        if (cfg.hudCps) lines.add("CPS " + Clicks.lmb() + " / " + Clicks.rmb());
        if (cfg.hudPing) {
            PlayerListEntry entry = mc.getNetworkHandler() == null ? null
                    : mc.getNetworkHandler().getPlayerListEntry(mc.player.getUuid());
            lines.add("Пинг " + (entry == null ? "—" : entry.getLatency() + " мс"));
        }
        int maxW = 0;
        for (String s : lines) maxW = Math.max(maxW, tr.getWidth(s));
        infoBoxW = maxW + 6 * 2 + 4;
        infoBoxH = lines.size() * LINE + 6 * 2 - 2;
        }
        if (lines.isEmpty()) return;

        int pad = 6;
        int boxW = infoBoxW;
        int boxH = infoBoxH;
        double s = cfg.hudScale;
        int margin = 6;
        int sw = (int) Math.ceil(boxW * s);
        int sh = (int) Math.ceil(boxH * s);
        int x = (cfg.hudCorner == 0 || cfg.hudCorner == 2) ? margin : (int) (w / s) - margin - boxW;
        int y = (cfg.hudCorner == 0 || cfg.hudCorner == 1) ? margin : (int) (h / s) - margin - boxH;
        if (sw < 0 || sh < 0) return;

        ctx.getMatrices().push();
        ctx.getMatrices().scale((float) s, (float) s, 1f);
        ctx.fill(x, y, x + boxW, y + boxH, BG);
        ctx.fill(x, y, x + 2, y + boxH, ACCENT);
        int ty = y + pad;
        for (int i = 0; i < lines.size(); i++) {
            int color = (i == 0 && cfg.hudFps) ? ACCENT_SOFT : TEXT;
            ctx.drawTextWithShadow(tr, lines.get(i), x + pad + 2, ty + i * LINE, color);
        }
        ctx.getMatrices().pop();
    }

    // ---------- активные зелья ----------

    private static void drawPotions(DrawContext ctx, MinecraftClient mc, Config cfg, int w, int y) {
        List<String> lines = POTION_LINES;
        lines.clear();
        for (StatusEffectInstance e : mc.player.getStatusEffects()) {
            String name = e.getEffectType().value().getName().getString();
            lines.add(name + " " + (e.getAmplifier() + 1) + " " + fmt(e.getDuration() / 20.0));
        }
        if (lines.isEmpty()) return;
        TextRenderer tr = mc.textRenderer;
        int maxW = 0;
        for (String s : lines) maxW = Math.max(maxW, tr.getWidth(s));
        int pad = 6;
        int boxW = maxW + pad * 2 + 4;
        int boxH = lines.size() * LINE + pad * 2 - 2;
        int x = w - boxW - 6;
        ctx.fill(x, y, x + boxW, y + boxH, BG);
        ctx.fill(x + boxW - 2, y, x + boxW, y + boxH, ACCENT);
        for (int i = 0; i < lines.size(); i++) {
            ctx.drawTextWithShadow(tr, lines.get(i), x + pad, y + pad + i * LINE, TEXT);
        }
    }

    private static String compass(float yaw) {
        // В Minecraft yaw = 0 — юг, 90 — запад
        String[] names = {"S", "W", "N", "E"};
        int idx = Math.round(((yaw % 360) + 360) % 360 / 90f) % 4;
        return names[idx];
    }

    // ---------- музыка ----------

    private static void drawNowPlaying(DrawContext ctx, MinecraftClient mc, int w) {
        String title = MusicPlayer.currentName();
        if (title == null || !MusicPlayer.isPlaying()) return;
        TextRenderer tr = mc.textRenderer;
        boolean paused = MusicPlayer.isPaused();
        String label = paused ? "ПАУЗА" : "СЕЙЧАС ИГРАЕТ";
        int maxText = Math.min(260, w - 160);
        // Обрезка названия пересчитывается только при смене трека или ширины
        if (!title.equals(npTitle) || maxText != npMaxText) {
            npTitle = title;
            npMaxText = maxText;
            npShown = tr.trimToWidth(title, maxText);
            npShownW = tr.getWidth(npShown);
        }
        // Время обновляется четыре раза в секунду, а не каждый кадр
        long nowMs = System.currentTimeMillis();
        if (nowMs - npTimeAt >= 250) {
            npTimeAt = nowMs;
            npTime = fmt(MusicPlayer.elapsedSeconds());
        }
        String shown = npShown;
        String time = npTime;

        int labelW = tr.getWidth(label);
        int textW = npShownW;
        int timeW = tr.getWidth(time);
        int eq = 18;
        int total = eq + 6 + labelW + 8 + textW + 8 + timeW;
        int x = (w - total) / 2;
        int y = 6;
        ctx.fill(x - 8, y - 3, x + total + 8, y + 11, BG);
        ctx.fill(x - 8, y - 3, x + total + 8, y - 2, ACCENT);

        // Эквалайзер: высота полосок зависит от времени, при паузе застывает
        long t = System.currentTimeMillis();
        for (int i = 0; i < 3; i++) {
            double phase = paused ? 0.3 : (Math.sin(t / 140.0 + i * 1.7) + 1) / 2;
            int bh = 2 + (int) (phase * 7);
            int bx = x + i * 5;
            ctx.fill(bx, y + 9 - bh, bx + 3, y + 9, ACCENT);
        }
        int tx = x + eq + 6;
        ctx.drawTextWithShadow(tr, label, tx, y, ACCENT);
        ctx.drawTextWithShadow(tr, shown, tx + labelW + 8, y, TEXT);
        ctx.drawTextWithShadow(tr, time, tx + labelW + 8 + textW + 8, y, MUTED);
    }

    private static String fmt(double seconds) {
        long s = (long) seconds;
        return String.format("%d:%02d", s / 60, s % 60);
    }

    private static void drawToast(DrawContext ctx, MinecraftClient mc, Config cfg, int w) {
        int serial = MusicPlayer.changeSerial();
        if (serial != toastSerial) {
            toastSerial = serial;
            String name = MusicPlayer.currentName();
            if (name != null && MusicPlayer.isPlaying()) {
                toastText = "Сейчас: " + name;
                toastUntil = System.currentTimeMillis() + 3000;
            }
        }
        long left = toastUntil - System.currentTimeMillis();
        if (left <= 0 || toastText.isEmpty()) return;
        TextRenderer tr = mc.textRenderer;
        int alpha = (int) Math.min(255, left / 3000.0 * 255 * 2);
        int color = (alpha << 24) | 0xFFF2F2F2;
        String text = tr.trimToWidth(toastText, Math.min(300, w - 40));
        int tw = tr.getWidth(text);
        int x = (w - tw) / 2;
        ctx.drawTextWithShadow(tr, text, x, 24, color);
    }
}
