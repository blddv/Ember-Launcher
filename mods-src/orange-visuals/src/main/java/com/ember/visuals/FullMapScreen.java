package com.ember.visuals;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.world.Heightmap;
import org.lwjgl.glfw.GLFW;

/**
 * Полноэкранная карта. Открывается клавишей N, закрывается N или Esc.
 * Левый drag — панорама, колесо — зум 1–4×, ЛКМ без drag — метка, ПКМ — удалить ближайшую метку.
 * Окно TerrainMap создаётся при открытии и освобождается при закрытии.
 */
public final class FullMapScreen extends Screen {
    private static final int SIZE = 256;          // блоков в окне карты
    private static final int HEAD = 34;           // высота шапки
    private static final int FOOT = 8;
    private static final double REMOVE_RADIUS = 8.0;
    private static final double MAX_ZOOM = 4.0;
    private static final int PANEL = 0xE6050B1A;
    private static final int ACCENT = 0xFFFF7100;
    private static final int EDGE = 0x66FF7100;
    private static final int TEXT = 0xFFF2F2F2;
    private static final int MUTED = 0xFF8FA3C7;
    private static final int BG = 0xFF0A1530;

    private final TerrainMap map = new TerrainMap(Identifier.of("orangevisuals", "fullmap"));
    private double cx;
    private double cz;
    private double zoom = 1.0;

    private boolean dragging;
    private boolean dragMoved;
    private double pressX;
    private double pressY;

    private int areaX;
    private int areaY;
    private int areaSize;

    public FullMapScreen() {
        super(Text.literal("Карта"));
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player != null) {
            cx = mc.player.getX();
            cz = mc.player.getZ();
        }
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void tick() {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null) return;
        map.update(mc, mc.world, (int) Math.floor(cx), (int) Math.floor(cz), SIZE, 240, 900);
    }

    @Override
    public void removed() {
        map.close(MinecraftClient.getInstance());
        super.removed();
    }

    // ---------- геометрия ----------

    private double ppb() {
        return areaSize / (double) SIZE * zoom;
    }

    private double centerX() {
        return areaX + areaSize / 2.0;
    }

    private double centerY() {
        return areaY + areaSize / 2.0;
    }

    private boolean inside(double mx, double my) {
        return mx >= areaX && mx < areaX + areaSize && my >= areaY && my < areaY + areaSize;
    }

    private double worldX(double mx) {
        return cx + (mx - centerX()) / ppb();
    }

    private double worldZ(double my) {
        return cz + (my - centerY()) / ppb();
    }

    private static String dim(MinecraftClient mc) {
        return mc.world == null ? "" : Waypoints.dimOf(mc.world);
    }

    // ---------- отрисовка ----------

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        MinecraftClient mc = MinecraftClient.getInstance();
        TextRenderer tr = textRenderer;

        ctx.fill(0, 0, width, height, 0xE6050B1A);
        ctx.drawCenteredTextWithShadow(tr, "КАРТА МИРА", width / 2, 6, ACCENT);
        ctx.drawCenteredTextWithShadow(tr,
                "ЛКМ — метка · ПКМ — удалить · колесо — зум · тяни — сдвиг · N или Esc — закрыть",
                width / 2, 18, MUTED);

        int avail = Math.min(width - 40, height - HEAD - FOOT - 8);
        areaSize = Math.max(64, avail);
        areaX = (width - areaSize) / 2;
        areaY = HEAD;

        // Рамка и фон
        ctx.fill(areaX - 1, areaY - 1, areaX + areaSize + 1, areaY + areaSize + 1, EDGE);
        ctx.fill(areaX, areaY, areaX + areaSize, areaY + areaSize, BG);

        double ppb = ppb();
        double scx = centerX();
        double scy = centerY();

        ctx.enableScissor(areaX, areaY, areaX + areaSize, areaY + areaSize);
        if (map.ready()) {
            double x0 = scx + (map.originX() - cx) * ppb;
            double y0 = scy + (map.originZ() - cz) * ppb;
            map.draw(ctx, x0, y0, ppb);
        } else {
            ctx.drawCenteredTextWithShadow(tr, "Загрузка карты…", (int) scx, (int) scy, MUTED);
        }

        if (mc.world != null) {
            for (Waypoints.Point p : Waypoints.inDim(dim(mc))) {
                double sx = scx + (p.x + 0.5 - cx) * ppb;
                double sy = scy + (p.z + 0.5 - cz) * ppb;
                if (sx < areaX - 20 || sx > areaX + areaSize + 20 || sy < areaY - 20 || sy > areaY + areaSize + 20) continue;
                int ix = (int) Math.round(sx);
                int iy = (int) Math.round(sy);
                ctx.fill(ix - 4, iy - 4, ix + 4, iy + 4, 0xFF050B1A);
                ctx.fill(ix - 3, iy - 3, ix + 3, iy + 3, p.color);
                ctx.drawTextWithShadow(tr, p.name, ix + 6, iy - 4, p.color);
            }
        }
        ctx.disableScissor();

        // Подсказка с координатами под курсором
        if (inside(mouseX, mouseY)) {
            int bx = (int) Math.floor(worldX(mouseX));
            int bz = (int) Math.floor(worldZ(mouseY));
            String t = "X " + bx + "  Z " + bz + "  ·  зум " + String.format("%.1f", zoom) + "×";
            int tw = tr.getWidth(t);
            int tx = areaX + 4;
            int ty = areaY + areaSize - 12;
            ctx.fill(tx - 3, ty - 3, tx + tw + 3, ty + 10, PANEL);
            ctx.drawTextWithShadow(tr, t, tx, ty, TEXT);
        }

        if (mc.world == null) {
            ctx.drawCenteredTextWithShadow(tr, "Нет мира", width / 2, areaY + areaSize / 2, MUTED);
        } else {
            int n = Waypoints.countIn(dim(mc));
            ctx.drawTextWithShadow(tr, "Меток в этом мире: " + n, areaX, areaY + areaSize + 3, MUTED);
        }
    }

    // ---------- мышь ----------

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0 && inside(mouseX, mouseY)) {
            dragging = true;
            dragMoved = false;
            pressX = mouseX;
            pressY = mouseY;
            return true;
        }
        if (button == 1 && inside(mouseX, mouseY)) {
            removeNearest(mouseX, mouseY);
            return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (button == 0 && dragging) {
            dragging = false;
            if (!dragMoved) addAt(mouseX, mouseY);
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
        if (button == 0 && dragging) {
            if (Math.abs(mouseX - pressX) + Math.abs(mouseY - pressY) > 3) dragMoved = true;
            double p = ppb();
            cx -= dx / p;
            cz -= dy / p;
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, dx, dy);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        if (verticalAmount == 0) return false;
        double z = verticalAmount > 0 ? zoom * 1.25 : zoom / 1.25;
        zoom = Math.max(1.0, Math.min(MAX_ZOOM, z));
        return true;
    }

    private void addAt(double mouseX, double mouseY) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null) return;
        int x = (int) Math.floor(worldX(mouseX));
        int z = (int) Math.floor(worldZ(mouseY));
        int y = mc.world.getTopY(Heightmap.Type.WORLD_SURFACE, x, z);
        Waypoints.Point p = Waypoints.add(dim(mc), x, y, z);
        if (mc.player != null) {
            mc.player.sendMessage(Text.literal("Метка добавлена: " + p.name + " (" + x + ", " + z + ")"), true);
        }
    }

    private void removeNearest(double mouseX, double mouseY) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.world == null) return;
        // Радиус не меньше 8 блоков и не меньше 8 пикселей на экране
        double radius = Math.max(REMOVE_RADIUS, 8.0 / ppb());
        Waypoints.Point p = Waypoints.nearest(dim(mc), worldX(mouseX), worldZ(mouseY), radius);
        if (p != null) Waypoints.remove(p);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == GLFW.GLFW_KEY_N) {
            close();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
        // Фон рисуем в render(), без размытия Minecraft
    }
}
