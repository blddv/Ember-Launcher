package com.ember.visuals;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.util.InputUtil;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.RotationAxis;
import org.lwjgl.glfw.GLFW;

import java.util.Arrays;

/**
 * Миникарта: ландшафт и метки. Игроков и сущностей на карте нет.
 * В центре всегда стоит точка: она показывает, где ты.
 *
 * Клавиши (когда не открыт экран):
 *   M — показать/скрыть, [ и ] — размер карты (шаг 16 блоков),
 *   B — метка в текущей позиции, N — полноэкранная карта.
 *
 * Производительность: название биома и заголовок пересчитываются раз в 10 тиков,
 * а не каждый кадр; обновление пикселей ограничено бюджетом; GPU-загрузка редкая.
 */
public final class Minimap {
    private static final Identifier MASK_ID = Identifier.of("orangevisuals", "minimap_mask");
    private static final TerrainMap MAP = new TerrainMap(Identifier.of("orangevisuals", "minimap"));

    // ARGB для ctx.fill
    private static final int PANEL = 0xE6050B1A;
    private static final int ACCENT = 0xFFFF7100;
    private static final int EDGE = 0x66FF7100;
    private static final int TEXT = 0xFFF2F2F2;
    private static final int MUTED = 0xFF8FA3C7;
    private static final int DARK = 0xFF050B1A;
    private static final int PAD = 3;
    private static final int HEAD_H = 11;
    private static final int FOOT_H = 11;

    // Тот же порядок каналов, что у NativeImage.setColor (ABGR)
    private static final int PANEL_ABGR = 0xE61A0B05;
    private static final int ACCENT_ABGR = 0xFF0071FF;

    private static final int IDLE_BUDGET = 120;   // пикселей в тик, когда карта стоит
    private static final int MOVED_BUDGET = 700;  // пикселей в тик, когда игрок движется
    private static final int IDLE_BUDGET_LOW = 40;
    private static final int MOVED_BUDGET_LOW = 180;
    private static final int UPLOAD_EVERY_LOW = 8;

    private static final int KEY_M = GLFW.GLFW_KEY_M;
    private static final int KEY_LBRACKET = GLFW.GLFW_KEY_LEFT_BRACKET;
    private static final int KEY_RBRACKET = GLFW.GLFW_KEY_RIGHT_BRACKET;
    private static final int KEY_B = GLFW.GLFW_KEY_B;
    private static final int KEY_N = GLFW.GLFW_KEY_N;
    private static final boolean[] WAS = new boolean[5];   // M, [, ], B, N

    private static NativeImageBackedTexture mask;
    private static int maskSize = 0;

    private static int tickCount = 0;
    private static String biome = "";
    private static String lastBiomeForTitle = null;
    private static int lastTitleWidth = -1;
    private static String title = "КАРТА";

    private Minimap() {}

    /** Размер карты на экране в пикселях GUI */
    public static int displaySize(Config cfg) {
        return Math.max(32, (int) Math.round(cfg.minimapSize * cfg.minimapScale));
    }

    public static int totalHeight(Config cfg) {
        return displaySize(cfg) + PAD * 2 + HEAD_H + FOOT_H;
    }

    /** Коробка миникарты на экране: {x, y, ширина, высота} */
    public static int[] box(Config cfg, int w, int h) {
        int d = displaySize(cfg);
        int boxW = d + PAD * 2;
        int boxH = totalHeight(cfg);
        int margin = 6;
        int x = (cfg.minimapCorner == 1 || cfg.minimapCorner == 3) ? w - boxW - margin : margin;
        int y = (cfg.minimapCorner == 2 || cfg.minimapCorner == 3) ? h - boxH - margin : margin;
        return new int[] {x, y, boxW, boxH};
    }

    /** Центр области карты на экране: {x, y} */
    public static int[] center(Config cfg, int w, int h) {
        int[] b = box(cfg, w, h);
        int half = displaySize(cfg) / 2;
        return new int[] {b[0] + PAD + half, b[1] + PAD + HEAD_H + half};
    }

    // ---------- клавиши ----------

    private static void handleKeys(MinecraftClient mc, Config cfg) {
        if (mc.getWindow() == null) return;
        if (mc.currentScreen != null) {
            Arrays.fill(WAS, false);
            return;
        }
        long h = mc.getWindow().getHandle();
        boolean[] now = {
                InputUtil.isKeyPressed(h, KEY_M),
                InputUtil.isKeyPressed(h, KEY_LBRACKET),
                InputUtil.isKeyPressed(h, KEY_RBRACKET),
                InputUtil.isKeyPressed(h, KEY_B),
                InputUtil.isKeyPressed(h, KEY_N),
        };
        boolean changed = false;
        if (now[0] && !WAS[0]) { cfg.minimap = !cfg.minimap; changed = true; }
        if (now[1] && !WAS[1]) { cfg.minimapSize -= 16; changed = true; }
        if (now[2] && !WAS[2]) { cfg.minimapSize += 16; changed = true; }
        if (now[3] && !WAS[3] && mc.player != null && mc.world != null) addWaypointHere(mc);
        if (now[4] && !WAS[4] && mc.player != null) mc.setScreen(new FullMapScreen());
        System.arraycopy(now, 0, WAS, 0, WAS.length);
        if (changed) {
            cfg.clamp();
            cfg.save();
        }
    }

    private static void addWaypointHere(MinecraftClient mc) {
        int x = mc.player.getBlockX();
        int y = mc.player.getBlockY();
        int z = mc.player.getBlockZ();
        Waypoints.Point p = Waypoints.add(Waypoints.dimOf(mc.world), x, y, z);
        mc.player.sendMessage(Text.literal("Метка добавлена: " + p.name + " (" + x + ", " + y + ", " + z + ")"), true);
    }

    // ---------- обновление данных (клиентский тик) ----------

    public static void tick(MinecraftClient mc) {
        Config cfg = OrangeVisualsClient.CONFIG;
        handleKeys(mc, cfg);
        tickCount++;
        if (mc.player != null && mc.world != null && tickCount % 10 == 0) {
            biome = biomeName(mc);
        }

        if (!cfg.minimap) {
            if (MAP.ready()) MAP.close(mc);
            return;
        }
        if (mc.player == null || mc.world == null) return;
        // Слабый ПК: меньше пикселей за тик и реже загрузка в GPU
        int idle = cfg.lowEnd ? IDLE_BUDGET_LOW : IDLE_BUDGET;
        int moved = cfg.lowEnd ? MOVED_BUDGET_LOW : MOVED_BUDGET;
        int upload = cfg.lowEnd ? UPLOAD_EVERY_LOW : 3;
        MAP.update(mc, mc.world, mc.player.getBlockX(), mc.player.getBlockZ(),
                cfg.minimapSize, idle, moved, upload);
    }

    private static String biomeName(MinecraftClient mc) {
        try {
            return mc.world.getBiome(mc.player.getBlockPos()).getKey()
                    .map(k -> Text.translatable(k.getValue().toTranslationKey("biome")).getString())
                    .orElse("");
        } catch (Exception e) {
            return "";
        }
    }

    // ---------- отрисовка ----------

    /** Угол поворота карты (в радианах) по yaw игрока, чтобы верх карты совпадал с направлением взгляда. */
    static double rotationAngle(float yawDeg) {
        double yaw = Math.toRadians(yawDeg);
        // Направление взгляда в экранных координатах (x вправо, y вниз = +Z мира)
        double fx = -Math.sin(yaw);
        double fy = Math.cos(yaw);
        return -Math.PI / 2 - Math.atan2(fy, fx);
    }

    public static void render(DrawContext ctx, MinecraftClient mc, Config cfg, int w, int h) {
        if (!cfg.minimap || !MAP.ready() || mc.player == null) return;
        int s = MAP.size();
        int d = displaySize(cfg);
        double ppb = d / (double) s;          // пикселей на блок: окно точно вписывается в квадрат d×d
        int[] bx0 = box(cfg, w, h);
        int x = bx0[0];
        int y = bx0[1];
        int boxW = bx0[2];
        int boxH = bx0[3];
        TextRenderer tr = mc.textRenderer;

        drawFrame(ctx, x, y, boxW, boxH);

        // Заголовок: название биома (обрезка по ширине только когда биом или ширина поменялись)
        if (!biome.equals(lastBiomeForTitle) || boxW - 8 != lastTitleWidth) {
            lastBiomeForTitle = biome;
            lastTitleWidth = boxW - 8;
            title = biome.isEmpty() ? "КАРТА" : tr.trimToWidth(biome.toUpperCase(), boxW - 8);
        }
        ctx.drawTextWithShadow(tr, title, x + 4, y + 3, ACCENT);

        int mx = x + PAD;
        int my = y + PAD + HEAD_H;
        double cxS = mx + d / 2.0;
        double cyS = my + d / 2.0;
        double px = mc.player.getX();
        double pz = mc.player.getZ();
        // Игрок в центре: блок originX лежит левее центра на (px - originX) блоков
        double x0 = cxS - (px - MAP.originX()) * ppb;
        double y0 = cyS - (pz - MAP.originZ()) * ppb;
        double radius = d / 2.0;

        double ang = cfg.minimapRotate ? rotationAngle(mc.player.getYaw()) : 0.0;

        ctx.enableScissor(mx, my, mx + d, my + d);
        MatrixStack m = ctx.getMatrices();
        m.push();
        if (ang != 0.0) {
            m.translate(cxS, cyS, 0);
            m.multiply(RotationAxis.POSITIVE_Z.rotation((float) ang));
            m.translate(-cxS, -cyS, 0);
        }
        MAP.draw(ctx, x0, y0, ppb);
        drawWaypoints(ctx, mc, cxS, cyS, ppb, radius - 4, px, pz);
        m.pop();
        ctx.disableScissor();

        if (cfg.minimapRound) {
            ensureMask(d);
            ctx.drawTexture(MASK_ID, mx, my, 0, 0, d, d, d, d);
        }

        // Точка в центре: всегда, поверх карты, не вращается
        int ix = (int) Math.round(cxS);
        int iy = (int) Math.round(cyS);
        disc(ctx, ix, iy, 4, DARK);
        disc(ctx, ix, iy, 2, ACCENT);

        // Север: при повороте метка стоит на краю в направлении севера
        int nx = (int) Math.round(cxS + Math.sin(ang) * (radius - 8));
        int ny = (int) Math.round(cyS - Math.cos(ang) * (radius - 8));
        ctx.drawCenteredTextWithShadow(tr, "N", nx, ny - 4, ACCENT);

        // Линейка масштаба внизу по центру (не попадает в угол круглой карты)
        int blocks = s >= 128 ? 16 : 8;
        int barLen = (int) Math.round(blocks * ppb);
        int bx = mx + d / 2 - barLen / 2;
        int byy = my + d - 6;
        ctx.fill(bx - 1, byy - 1, bx + barLen + 1, byy + 2, 0xB0050B1A);
        ctx.fill(bx, byy, bx + barLen, byy + 1, TEXT);
        ctx.drawCenteredTextWithShadow(tr, blocks + " бл", mx + d / 2, byy - 10, TEXT);

        // Подвал: координаты
        String coords = "X " + mc.player.getBlockX() + "  Y " + mc.player.getBlockY() + "  Z " + mc.player.getBlockZ();
        ctx.drawCenteredTextWithShadow(tr, coords, x + boxW / 2, my + d + 2, MUTED);
    }

    /** Закрашенный круг по строкам (без текстур) */
    static void disc(DrawContext ctx, int cx, int cy, int r, int color) {
        for (int dy = -r; dy <= r; dy++) {
            int hw = (int) Math.round(Math.sqrt((double) r * r - (double) dy * dy));
            ctx.fill(cx - hw, cy + dy, cx + hw + 1, cy + dy + 1, color);
        }
    }

    /** Маркеры меток: точки текущего измерения, у края, если метка за пределами карты */
    private static void drawWaypoints(DrawContext ctx, MinecraftClient mc, double cxS, double cyS,
                                      double ppb, double limit, double px, double pz) {
        if (mc.world == null) return;
        for (Waypoints.Point p : Waypoints.inDim(Waypoints.dimOf(mc.world))) {
            double dx = (p.x + 0.5 - px) * ppb;
            double dz = (p.z + 0.5 - pz) * ppb;
            double dist = Math.hypot(dx, dz);
            if (dist > limit && dist > 0) {
                dx *= limit / dist;
                dz *= limit / dist;
            }
            int sx = (int) Math.round(cxS + dx);
            int sy = (int) Math.round(cyS + dz);
            ctx.fill(sx - 3, sy - 3, sx + 3, sy + 3, DARK);
            ctx.fill(sx - 2, sy - 2, sx + 2, sy + 2, p.color);
        }
    }

    private static void drawFrame(DrawContext ctx, int x, int y, int boxW, int boxH) {
        ctx.fill(x, y, x + boxW, y + boxH, PANEL);
        ctx.fill(x, y, x + boxW, y + 1, EDGE);
        ctx.fill(x, y + boxH - 1, x + boxW, y + boxH, EDGE);
        ctx.fill(x, y, x + 1, y + boxH, EDGE);
        ctx.fill(x + boxW - 1, y, x + boxW, y + boxH, EDGE);
        int corner = 8;
        ctx.fill(x, y, x + corner, y + 2, ACCENT);
        ctx.fill(x, y, x + 2, y + corner, ACCENT);
        ctx.fill(x + boxW - corner, y, x + boxW, y + 2, ACCENT);
        ctx.fill(x + boxW - 2, y, x + boxW, y + corner, ACCENT);
        ctx.fill(x, y + boxH - 2, x + corner, y + boxH, ACCENT);
        ctx.fill(x, y + boxH - corner, x + 2, y + boxH, ACCENT);
        ctx.fill(x + boxW - corner, y + boxH - 2, x + boxW, y + boxH, ACCENT);
        ctx.fill(x + boxW - 2, y + boxH - corner, x + boxW, y + boxH, ACCENT);
    }

    /** Маска круглой формы: вне круга — панель, по краю — акцентное кольцо, внутри — прозрачно. Строится один раз на размер. */
    private static void ensureMask(int d) {
        if (mask != null && maskSize == d) return;
        NativeImageBackedTexture fresh = new NativeImageBackedTexture(d, d, true);
        fresh.setFilter(false, false);
        NativeImage img = fresh.getImage();
        if (img != null) {
            double r = d / 2.0;
            for (int yy = 0; yy < d; yy++) {
                for (int xx = 0; xx < d; xx++) {
                    double dx = xx + 0.5 - r;
                    double dy = yy + 0.5 - r;
                    double dist = Math.sqrt(dx * dx + dy * dy);
                    int c;
                    if (dist > r) c = PANEL_ABGR;
                    else if (dist > r - 1.5) c = ACCENT_ABGR;
                    else c = 0;
                    img.setColor(xx, yy, c);
                }
            }
        }
        fresh.upload();
        NativeImageBackedTexture old = mask;
        mask = fresh;
        maskSize = d;
        MinecraftClient.getInstance().getTextureManager().registerTexture(MASK_ID, fresh);
        if (old != null) old.close();
    }

    /** Освобождает текстуры миникарты и маски (вызывается при выгрузке). */
    public static void release() {
        MinecraftClient mc = MinecraftClient.getInstance();
        MAP.close(mc);
        if (mask != null) {
            mc.getTextureManager().destroyTexture(MASK_ID);
            mask = null;
            maskSize = 0;
        }
    }
}
