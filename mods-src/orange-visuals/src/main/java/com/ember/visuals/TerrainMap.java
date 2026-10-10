package com.ember.visuals;

import net.minecraft.block.BlockState;
import net.minecraft.block.MapColor;
import net.minecraft.block.MapColor.Brightness;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;

import java.util.ArrayDeque;

/**
 * Текстура ландшафта S×S блоков. Используется и миникартой, и полноэкранной картой.
 *
 * Хранится кольцом: мировая координата (x, z) лежит в пикселе (x mod S, z mod S).
 * При движении окна обновляются только новые колонки и строки, остальное догоняет
 * фоновое обновление с ограниченным бюджетом пикселей за тик. Загрузка в GPU идёт
 * не чаще раза в 3 тика и только если что-то изменилось.
 */
public final class TerrainMap {
    private final Identifier id;
    private NativeImageBackedTexture texture;
    private int size;
    private World world;
    private int originX;
    private int originZ;
    private boolean haveOrigin;
    private int cursor;
    private boolean dirty;
    private int ticks;
    /** Отложенные перерисовки новых колонок (тип 0, мировой X) и строк (тип 1, мировой Z) */
    private final ArrayDeque<int[]> pending = new ArrayDeque<>();
    private static final int PENDING_MAX = 2048;

    public TerrainMap(Identifier id) {
        this.id = id;
    }

    public boolean ready() {
        return texture != null && haveOrigin;
    }

    public int size() {
        return size;
    }

    public int originX() {
        return originX;
    }

    public int originZ() {
        return originZ;
    }

    /** Освобождает текстуру. Вызывать при закрытии экрана или выключении миникарты. */
    public void close(MinecraftClient mc) {
        if (texture == null) return;
        mc.getTextureManager().destroyTexture(id);
        texture = null;
        haveOrigin = false;
        world = null;
    }

    /**
     * Двигает окно так, чтобы (cx, cz) оказался в центре, и дорисовывает пиксели.
     * @param idleBudget пикселей за тик, когда окно стоит на месте
     * @param movedBudget пикселей за тик, когда окно сдвинулось
     * @return true, если окно сдвинулось в этот тик
     */
    public boolean update(MinecraftClient mc, World w, int cx, int cz, int s, int idleBudget, int movedBudget) {
        return update(mc, w, cx, cz, s, idleBudget, movedBudget, 3);
    }

    /** @param uploadEvery загрузка в GPU не чаще раза в N тиков (больше — меньше нагрузки на видеокарту) */
    public boolean update(MinecraftClient mc, World w, int cx, int cz, int s, int idleBudget, int movedBudget,
                          int uploadEvery) {
        if (texture == null || size != s || world != w) reset(mc, w, s);
        int newX0 = cx - s / 2;
        int newZ0 = cz - s / 2;
        boolean moved = false;
        if (!haveOrigin) {
            originX = newX0;
            originZ = newZ0;
            haveOrigin = true;
            moved = true;
        } else {
            int dx = newX0 - originX;
            int dz = newZ0 - originZ;
            if (dx != 0 || dz != 0) {
                moved = true;
                int oldX0 = originX;
                int oldZ0 = originZ;
                originX = newX0;
                originZ = newZ0;
                // Новые колонки и строки ставятся в очередь и перерисовываются с бюджетом,
                // чтобы сдвиг окна на много блоков за один тик не давал фриз.
                // При телепорте (сдвиг больше размера окна) фон догонит всё курсором.
                if (Math.abs(dx) < s && Math.abs(dz) < s) {
                    if (dx > 0) for (int x = oldX0 + s; x < newX0 + s; x++) queue(0, x);
                    else if (dx < 0) for (int x = newX0; x < oldX0; x++) queue(0, x);
                    if (dz > 0) for (int z = oldZ0 + s; z < newZ0 + s; z++) queue(1, z);
                    else if (dz < 0) for (int z = newZ0; z < oldZ0; z++) queue(1, z);
                }
            }
        }

        int budget = moved ? movedBudget : idleBudget;
        // Сначала отложенные линии (минимум одна за тик, чтобы очередь не копилась).
        // Линия, которая уже ушла из окна, пропускается: её пиксели заняты другим блоком.
        while (budget > 0 && !pending.isEmpty()) {
            int[] job = pending.poll();
            if (job[0] == 0) {
                if (job[1] < originX || job[1] >= originX + s) continue;
                refreshColumn(w, job[1], s);
            } else {
                if (job[1] < originZ || job[1] >= originZ + s) continue;
                refreshRow(w, job[1], s);
            }
            budget -= s;
        }
        int total = s * s;
        for (int k = 0; k < budget; k++) {
            int idx = cursor;
            cursor = (cursor + 1) % total;
            int px = idx % s;
            int pz = idx / s;
            int x = originX + Math.floorMod(px - originX, s);
            int z = originZ + Math.floorMod(pz - originZ, s);
            paint(w, x, z, s);
        }

        ticks++;
        if (dirty && ticks % Math.max(1, uploadEvery) == 0) {
            texture.upload();
            dirty = false;
        }
        return moved;
    }

    /**
     * Рисует окно. Блок с мировым X = originX лежит в экранной точке x0, 1 блок = ppb пикселей экрана.
     * Вызывать внутри DrawContext, у которого уже настроены матрица и scissor.
     */
    public void draw(DrawContext ctx, double x0, double y0, double ppb) {
        if (!ready()) return;
        int ox = Math.floorMod(originX, size);
        int oz = Math.floorMod(originZ, size);
        for (int[] sx : segments(ox, size)) {
            for (int[] sz : segments(oz, size)) {
                int dx0 = (int) Math.round(x0 + sx[0] * ppb);
                int dx1 = (int) Math.round(x0 + (sx[0] + sx[2]) * ppb);
                int dz0 = (int) Math.round(y0 + sz[0] * ppb);
                int dz1 = (int) Math.round(y0 + (sz[0] + sz[2]) * ppb);
                if (dx1 <= dx0 || dz1 <= dz0) continue;
                ctx.drawTexture(id, dx0, dz0, dx1 - dx0, dz1 - dz0, sx[1], sz[1], sx[2], sz[2], size, size);
            }
        }
    }

    // ---------- внутреннее ----------

    private void reset(MinecraftClient mc, World w, int s) {
        NativeImageBackedTexture fresh = new NativeImageBackedTexture(s, s, true);
        fresh.setFilter(false, false);   // точные пиксели, без размытия
        NativeImage img = fresh.getImage();
        if (img != null) {
            for (int y = 0; y < s; y++) for (int x = 0; x < s; x++) img.setColor(x, y, 0);
        }
        NativeImageBackedTexture old = texture;
        texture = fresh;
        mc.getTextureManager().registerTexture(id, fresh);
        if (old != null) old.close();
        size = s;
        world = w;
        cursor = 0;
        haveOrigin = false;
        dirty = true;
        pending.clear();
    }

    private void queue(int type, int coord) {
        // Очередь переполнилась: лишнее догонит фоновый обход текстуры
        if (pending.size() >= PENDING_MAX) return;
        pending.add(new int[] {type, coord});
    }

    private void refreshColumn(World w, int x, int s) {
        for (int j = 0; j < s; j++) paint(w, x, originZ + j, s);
    }

    private void refreshRow(World w, int z, int s) {
        for (int i = 0; i < s; i++) paint(w, originX + i, z, s);
    }

    private void paint(World w, int x, int z, int s) {
        NativeImage img = texture.getImage();
        if (img == null) return;
        int px = Math.floorMod(x, s);
        int pz = Math.floorMod(z, s);
        int c = sample(w, x, z);
        if (img.getColor(px, pz) != c) {
            img.setColor(px, pz, c);
            dirty = true;
        }
    }

    /**
     * Цвет колонки в формате, который принимает NativeImage.setColor (тот же, что отдаёт MapColor).
     * Каналы не переставляются. 0 — нет загруженного чанка, пиксель остаётся прозрачным.
     */
    static int sample(World w, int x, int z) {
        if (!w.isChunkLoaded(x >> 4, z >> 4)) return 0;
        int top = w.getTopY(Heightmap.Type.WORLD_SURFACE, x, z);
        BlockPos pos = new BlockPos(x, top - 1, z);
        BlockState state = w.getBlockState(pos);
        MapColor mc = state.getMapColor(w, pos);
        if (mc == MapColor.CLEAR) return 0xFF000000;

        // Тень по перепаду высот с северным соседом, как на картах Minecraft
        int north = w.isChunkLoaded(x >> 4, (z - 1) >> 4) ? w.getTopY(Heightmap.Type.WORLD_SURFACE, x, z - 1) : top;
        Brightness b = north < top ? Brightness.HIGH : north > top ? Brightness.LOW : Brightness.NORMAL;
        int color = mc.getRenderColor(b) | 0xFF000000;

        // Вода темнеет с глубиной (умножаем каналы, раскладка сохраняется)
        if (mc == MapColor.WATER_BLUE) {
            int floor = w.getTopY(Heightmap.Type.OCEAN_FLOOR, x, z);
            int depth = Math.min(16, Math.max(0, top - floor));
            double k = 1.0 - depth * 0.04;
            int c0 = (int) ((color & 0xFF) * k);
            int c1 = (int) (((color >> 8) & 0xFF) * k);
            int c2 = (int) (((color >> 16) & 0xFF) * k);
            color = 0xFF000000 | (c2 << 16) | (c1 << 8) | c0;
        }
        return color;
    }

    /** Отрезки оси: {позиция на экране (в блоках), позиция в текстуре, длина}. */
    private static int[][] segments(int offset, int s) {
        if (offset == 0) return new int[][] {{0, 0, s}};
        return new int[][] {{0, offset, s - offset}, {s - offset, 0, offset}};
    }
}
