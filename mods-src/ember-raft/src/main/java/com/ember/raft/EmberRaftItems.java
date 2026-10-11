package com.ember.raft;

import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class EmberRaftItems {
    /** Крюк с верёвкой: ПКМ бросает крюк, который цепляет проплывающий мусор. */
    public static final Item HOOK = new HookItem(new Item.Settings().maxCount(1));
    /** Дрейфующая древесина: основной ресурс, крафтится в доски и верёвки. */
    public static final Item DRIFTWOOD = new Item(new Item.Settings());
    /** Предмет-плот: ставится на воду, как лодка. */
    public static final Item RAFT_ITEM = new RaftItem(new Item.Settings().maxCount(1));
    /** Якорь: ПКМ по плоту (или рядом с ним) останавливает дрейф. */
    public static final Item ANCHOR = new AnchorItem(new Item.Settings().maxCount(1));

    public static void register() {
        Registry.register(Registries.ITEM, EmberRaftMod.id("hook"), HOOK);
        Registry.register(Registries.ITEM, EmberRaftMod.id("driftwood"), DRIFTWOOD);
        Registry.register(Registries.ITEM, EmberRaftMod.id("raft"), RAFT_ITEM);
        Registry.register(Registries.ITEM, EmberRaftMod.id("anchor"), ANCHOR);
    }

    private EmberRaftItems() {
    }
}
