package com.ember.visuals;

import javax.sound.sampled.AudioSystem;

import javax.sound.sampled.SourceDataLine;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

/**
 * Музыкальный плеер внутри игры. Читает папку, которую выбрал лаунчер (или вы в меню),
 * играет MP3, WAV и OGG через javax.sound, не трогая звуки Minecraft.
 */
public final class MusicPlayer {
    private static final List<Path> TRACKS = new ArrayList<>();
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "orangevisuals-music");
        t.setDaemon(true);
        return t;
    });
    private static final Random RNG = new Random();

    private static volatile long generation = 0;
    private static volatile int current = -1;
    private static volatile boolean playing = false;
    private static volatile boolean paused = false;
    private static volatile float volume = 0.6f;
    private static volatile boolean shuffle = false;
    private static volatile String repeat = "all";
    private static volatile long framesOut = 0;
    private static volatile float rate = 44100f;
    private static volatile int changeSerial = 0;
    private static volatile String folder = "";
    private static volatile String lastError = "";
    private static volatile int failStreak = 0;

    private MusicPlayer() {}

    // ---------- состояние для HUD и меню ----------

    public static synchronized void rescan(String dir) {
        folder = dir == null ? "" : dir;
        TRACKS.clear();
        if (folder.isBlank()) return;
        Path root = Path.of(folder);
        if (!Files.isDirectory(root)) return;
        try (Stream<Path> s = Files.walk(root, 3)) {
            s.filter(Files::isRegularFile)
                    .filter(p -> {
                        String n = p.getFileName().toString().toLowerCase(Locale.ROOT);
                        return n.endsWith(".mp3") || n.endsWith(".wav") || n.endsWith(".ogg");
                    })
                    .sorted()
                    .forEach(TRACKS::add);
        } catch (IOException ignored) {
            // папка недоступна — список остаётся пустым
        }
        if (current >= TRACKS.size()) current = -1;
    }

    public static synchronized List<String> names() {
        List<String> out = new ArrayList<>();
        for (Path p : TRACKS) out.add(stripExt(p.getFileName().toString()));
        return out;
    }

    public static synchronized int trackCount() { return TRACKS.size(); }
    public static String folder() { return folder; }
    public static int current() { return current; }
    public static boolean isPlaying() { return playing; }
    public static boolean isPaused() { return paused; }
    public static int changeSerial() { return changeSerial; }
    public static String lastError() { return lastError; }
    public static double elapsedSeconds() { return rate > 0 ? framesOut / (double) rate : 0; }

    public static synchronized String currentName() {
        if (current < 0 || current >= TRACKS.size()) return null;
        return stripExt(TRACKS.get(current).getFileName().toString());
    }

    private static String stripExt(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    // ---------- управление ----------

    public static synchronized void play(int index) {
        if (TRACKS.isEmpty()) return;
        int i = Math.floorMod(index, TRACKS.size());
        generation++;
        long g = generation;
        current = i;
        playing = true;
        paused = false;
        changeSerial++;
        EXEC.execute(() -> run(g, i));
    }

    /** Старт без выбора трека: случайный при перемешивании, иначе первый. */
    public static synchronized void playDefault() {
        if (TRACKS.isEmpty()) return;
        play(shuffle ? RNG.nextInt(TRACKS.size()) : 0);
    }

    public static synchronized void togglePause() {
        if (current < 0) {
            playDefault();
            return;
        }
        if (!playing) {
            play(current);
            return;
        }
        paused = !paused;
    }

    public static synchronized void stop() {
        generation++;
        playing = false;
        paused = false;
    }

    public static synchronized void next() {
        if (TRACKS.isEmpty()) return;
        play(nextIndex(current, true));
    }

    public static synchronized void prev() {
        if (TRACKS.isEmpty()) return;
        play(shuffle ? nextIndex(current, true) : current - 1);
    }

    private static int nextIndex(int from, boolean manual) {
        int size = TRACKS.size();
        if (shuffle && size > 1) {
            int r;
            do { r = RNG.nextInt(size); } while (r == from);
            return r;
        }
        return from + 1 >= size && !manual ? 0 : Math.floorMod(from + 1, size);
    }

    public static void setVolume(double v) {
        volume = (float) Math.max(0, Math.min(1, v));
    }

    public static void setShuffle(boolean on) { shuffle = on; }
    public static void setRepeat(String mode) { repeat = mode; }

    // ---------- поток проигрывания ----------

    private static void run(long g, int index) {
        if (g != generation) return;
        Path file;
        synchronized (MusicPlayer.class) {
            if (index >= TRACKS.size()) return;
            file = TRACKS.get(index);
        }
        framesOut = 0;
        lastError = "";
        AudioDecoders.PcmDecoder src = null;
        SourceDataLine line = null;
        try {
            src = AudioDecoders.open(file);
            rate = src.sampleRate;
            line = AudioSystem.getSourceDataLine(src.format());
            line.open(src.format(), 16384);
            line.start();
            byte[] buf = new byte[4096];
            int frame = src.channels * 2;
            while (g == generation) {
                if (paused) {
                    line.stop();
                    Thread.sleep(80);
                    continue;
                }
                if (!line.isRunning()) line.start();
                int n = src.read(buf);
                if (n < 0) break;
                applyVolume(buf, n, volume);
                line.write(buf, 0, n);
                framesOut += n / frame;
            }
            if (g == generation) {
                failStreak = 0;
                line.drain();
                afterTrack(g);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception | LinkageError e) {
            // Файл не читается — пропускаем трек, плеер продолжает работу
            lastError = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            failStreak++;
            // Если подряд не открылся ни один трек, не крутим очередь бесконечно
            if (g == generation) {
                if (failStreak <= TRACKS.size()) afterTrack(g);
                else playing = false;
            }
        } finally {
            if (line != null) {
                line.stop();
                line.close();
            }
            if (src != null) {
                try { src.close(); } catch (IOException ignored) { /* уже закрыт */ }
            }
        }
    }

    private static void afterTrack(long g) {
        synchronized (MusicPlayer.class) {
            if (g != generation) return;
            if (TRACKS.isEmpty()) { playing = false; return; }
            String mode = repeat;
            if ("one".equals(mode)) {
                play(current);
            } else if ("off".equals(mode) && !shuffle && current + 1 >= TRACKS.size()) {
                playing = false;
                paused = false;
            } else {
                play(nextIndex(current, false));
            }
        }
    }

    private static void applyVolume(byte[] buf, int len, float vol) {
        if (vol >= 0.999f) return;
        for (int i = 0; i + 1 < len; i += 2) {
            int s = (short) ((buf[i] & 0xff) | (buf[i + 1] << 8));
            s = Math.round(s * vol);
            if (s > 32767) s = 32767;
            else if (s < -32768) s = -32768;
            buf[i] = (byte) (s & 0xff);
            buf[i + 1] = (byte) ((s >> 8) & 0xff);
        }
    }
}
