package com.ember.visuals;

import net.minecraft.client.MinecraftClient;

import java.util.ArrayDeque;

/** Счётчик кликов в секунду (CPS) для ЛКМ и ПКМ. */
public final class Clicks {
    private static final ArrayDeque<Long> LEFT = new ArrayDeque<>();
    private static final ArrayDeque<Long> RIGHT = new ArrayDeque<>();
    private static boolean prevLeft = false;
    private static boolean prevRight = false;

    private Clicks() {}

    public static void tick(MinecraftClient mc) {
        if (mc.options == null) return;
        long now = System.currentTimeMillis();
        boolean left = mc.options.attackKey.isPressed();
        boolean right = mc.options.useKey.isPressed();
        if (left && !prevLeft) LEFT.addLast(now);
        if (right && !prevRight) RIGHT.addLast(now);
        prevLeft = left;
        prevRight = right;
        trim(LEFT, now);
        trim(RIGHT, now);
    }

    private static void trim(ArrayDeque<Long> q, long now) {
        while (!q.isEmpty() && now - q.peekFirst() > 1000) q.pollFirst();
    }

    public static int lmb() { return LEFT.size(); }
    public static int rmb() { return RIGHT.size(); }
}
