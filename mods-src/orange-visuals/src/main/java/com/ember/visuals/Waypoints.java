package com.ember.visuals;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.world.World;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Метки на карте. Файл config/orangevisuals-waypoints.json.
 * Метки привязаны к измерению: на карте показываются только метки текущего мира.
 */
public final class Waypoints {

    public static final class Point {
        public String name = "";
        public String dim = "";
        public int x;
        public int y;
        public int z;
        public int color = 0xFFFF7100;   // ARGB
    }

    private static final int[] COLORS = {0xFFFF7100, 0xFF4FC3F7, 0xFF81C784, 0xFFE57373, 0xFFBA68C8, 0xFFFFD54F};
    private static final List<Point> LIST = new ArrayList<>();
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static boolean loaded = false;

    private Waypoints() {}

    private static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("orangevisuals-waypoints.json");
    }

    /** Идентификатор измерения, например minecraft:overworld */
    public static String dimOf(World w) {
        return w.getRegistryKey().getValue().toString();
    }

    public static synchronized void load() {
        if (loaded) return;
        loaded = true;
        Path f = file();
        if (!Files.isRegularFile(f)) return;
        try {
            Point[] arr = GSON.fromJson(Files.readString(f, StandardCharsets.UTF_8), Point[].class);
            if (arr != null) for (Point p : arr) if (p != null) LIST.add(sanitize(p));
        } catch (Exception e) {
            // Битый файл: начинаем с пустого списка, сам файл не трогаем до первого сохранения
        }
    }

    private static Point sanitize(Point p) {
        if (p.name == null) p.name = "";
        if (p.dim == null) p.dim = "";
        return p;
    }

    private static synchronized void save() {
        try {
            Path f = file();
            Files.createDirectories(f.getParent());
            Files.writeString(f, GSON.toJson(LIST.toArray(new Point[0])), StandardCharsets.UTF_8);
        } catch (IOException e) {
            // Не удалось записать: метки останутся в памяти до перезапуска
        }
    }

    public static synchronized Point add(String dim, int x, int y, int z) {
        int n = 1;
        for (Point p : LIST) if (p.dim.equals(dim)) n++;
        Point p = new Point();
        p.name = "Метка " + n;
        p.dim = dim;
        p.x = x;
        p.y = y;
        p.z = z;
        p.color = COLORS[LIST.size() % COLORS.length];
        LIST.add(p);
        save();
        return p;
    }

    /** Метки текущего измерения (копия списка) */
    public static synchronized List<Point> inDim(String dim) {
        List<Point> r = new ArrayList<>();
        for (Point p : LIST) if (p.dim.equals(dim)) r.add(p);
        return r;
    }

    public static synchronized int countIn(String dim) {
        int n = 0;
        for (Point p : LIST) if (p.dim.equals(dim)) n++;
        return n;
    }

    /** Ближайшая метка в измерении в радиусе maxDist блоков (по X и Z), или null */
    public static synchronized Point nearest(String dim, double x, double z, double maxDist) {
        Point best = null;
        double bestD = maxDist;
        for (Point p : LIST) {
            if (!p.dim.equals(dim)) continue;
            double d = Math.hypot(p.x + 0.5 - x, p.z + 0.5 - z);
            if (d <= bestD) {
                bestD = d;
                best = p;
            }
        }
        return best;
    }

    public static synchronized void remove(Point p) {
        if (LIST.remove(p)) save();
    }

    /** Удаляет все метки измерения. Возвращает сколько удалено. */
    public static synchronized int clear(String dim) {
        int before = LIST.size();
        LIST.removeIf(p -> p.dim.equals(dim));
        int removed = before - LIST.size();
        if (removed > 0) save();
        return removed;
    }
}
