package com.ember.visuals;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Настройки мода. Файл config/orangevisuals.json.
 * Лаунчер создаёт его с значениями по умолчанию, дальше им управляет сам мод (меню по умолчанию на R SHIFT).
 */
public class Config {
    // HUD
    public boolean hudFps = true;
    public boolean hudCoords = true;
    public boolean hudClock = false;
    public boolean hudMemory = false;
    public boolean hudDirection = true;
    public boolean hudCps = false;
    public boolean hudNowPlaying = true;
    public boolean hudToasts = true;
    public double hudScale = 1.0;      // 0.6 .. 1.6
    public int hudCorner = 0;          // 0 — слева сверху, 1 — справа сверху, 2 — слева снизу, 3 — справа снизу
    public boolean crosshairDot = false;
    public boolean menuOnShift = true; // короткое нажатие клавиши меню открывает меню
    public boolean hudPing = false;
    public boolean hudPotions = false;
    public boolean watermark = false;
    public boolean minimap = true;
    public int minimapSize = 128;      // сколько блоков видно: 64 .. 256
    public double minimapScale = 1.0;  // размер на экране: 0.5 .. 2.0
    public int minimapCorner = 1;      // 0 — слева сверху, 1 — справа сверху, 2 — слева снизу, 3 — справа снизу
    public boolean minimapRotate = false; // карта поворачивается по взгляду, север показывает метка N
    public boolean minimapRound = false;  // круглая форма вместо квадрата
    public int menuKey = 344;          // GLFW-код клавиши меню: 344 — R SHIFT (задаётся в лаунчере)
    public int zoomKey = 67;           // GLFW-код клавиши зума: 67 — C

    // Визуал
    public boolean zoom = true;
    public boolean customFov = false;  // свой FOV вместо настройки Minecraft
    public double fov = 90;            // 30 .. 150
    public double zoomFactor = 0.25;   // 0.05 .. 1.0 (меньше — сильнее зум)
    public boolean warm = false;       // тёплый оранжевый фильтр
    public double warmStrength = 0.3;  // 0 .. 1
    public boolean vignette = false;   // затемнение краёв
    public double vignetteStrength = 0.5;
    public boolean lowEnd = false;     // режим для слабых ПК: реже обновляются HUD и миникарта, без виньетки

    // Музыка в игре
    public boolean music = true;
    public String musicFolder = "";    // папка задаётся в лаунчере; можно поменять в файле
    public double musicVolume = 0.6;   // 0 .. 1
    public boolean musicAutoplay = true;
    public boolean musicShuffle = false;
    public String musicRepeat = "all"; // off | all | one

    public static Config load() {
        Path path = path();
        Config cfg = new Config();
        try {
            if (Files.exists(path)) {
                Config read = new Gson().fromJson(Files.readString(path), Config.class);
                if (read != null) cfg = read;
            }
        } catch (Exception ignored) {
            // битый файл — значения по умолчанию
        }
        cfg.clamp();
        return cfg;
    }

    public void save() {
        try {
            Path path = path();
            Files.createDirectories(path.getParent());
            Files.writeString(path, new GsonBuilder().setPrettyPrinting().create().toJson(this));
        } catch (Exception ignored) {
            // нет доступа к папке — настройки останутся до конца сессии
        }
    }

    public void clamp() {
        zoomFactor = clamp(zoomFactor, 0.05, 1.0);
        fov = clamp(fov, 30.0, 150.0);
        minimapSize = Math.max(64, Math.min(256, minimapSize));
        minimapScale = clamp(minimapScale, 0.5, 2.0);
        minimapCorner = Math.max(0, Math.min(3, minimapCorner));
        if (menuKey <= 0) menuKey = 344;
        if (zoomKey <= 0) zoomKey = 67;
        hudScale = clamp(hudScale, 0.6, 1.6);
        hudCorner = Math.max(0, Math.min(3, hudCorner));
        warmStrength = clamp(warmStrength, 0.0, 1.0);
        vignetteStrength = clamp(vignetteStrength, 0.0, 1.0);
        musicVolume = clamp(musicVolume, 0.0, 1.0);
        if (musicRepeat == null || !(musicRepeat.equals("off") || musicRepeat.equals("all") || musicRepeat.equals("one"))) {
            musicRepeat = "all";
        }
        if (musicFolder == null) musicFolder = "";
    }

    public static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static Path path() {
        return FabricLoader.getInstance().getConfigDir().resolve("orangevisuals.json");
    }
}
